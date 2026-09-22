import Order from "../../models/order.js";
import logger from "../logger.js";
import { WORKFLOW_STATUS, legacyStatusFromWorkflow } from "../../constants/orderWorkflow.js";
import { mapShipmentToWorkflowStatus } from "./shadowfaxStatusMapper.js";
import { applyDeliveredSettlement } from "../orderSettlement.js";
import { compensateOrderCancellation } from "../orderCompensation.js";
import { emitOrderStatusUpdate } from "../orderSocketEmitter.js";
import { emitNotificationEvent } from "../../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../../modules/notifications/notification.constants.js";

const FINISHED_WORKFLOW = [WORKFLOW_STATUS.DELIVERED, WORKFLOW_STATUS.CANCELLED];
const FINISHED_LEGACY = ["delivered", "cancelled"];

/**
 * Applies a Shadowfax shipment status to the linked order.
 *
 * Shared by the webhook and the tracking/reconciliation path so both produce the
 * same side effects: settlement on delivery, cancellation compensation (stock +
 * refund) when Shadowfax cancels, returns or loses the parcel, and progress updates.
 * Every update is conditional on the order not already being in that state (or
 * finished), so repeated callbacks and polling never apply side effects twice.
 */
export async function syncOrderWithShipmentStatus(
  shipment,
  shipmentStatus,
  { rawStatus = null, remarks = null } = {}
) {
  const workflowStatus = mapShipmentToWorkflowStatus(shipmentStatus);
  const orderId = shipment?.internalOrderId;
  if (!workflowStatus || !orderId) return null;

  const now = new Date();
  const openOrderFilter = {
    orderId,
    workflowStatus: { $nin: [...FINISHED_WORKFLOW, workflowStatus] },
    status: { $nin: FINISHED_LEGACY },
  };

  if (workflowStatus === WORKFLOW_STATUS.DELIVERED) {
    const order = await Order.findOneAndUpdate(
      openOrderFilter,
      {
        $set: {
          workflowStatus: WORKFLOW_STATUS.DELIVERED,
          status: "delivered",
          deliveredAt: shipment.deliveredAt || now,
        },
      },
      { new: true }
    );
    if (!order) return null;

    try {
      await applyDeliveredSettlement(order, order.orderId);
    } catch (err) {
      // The order is delivered either way; finance can reconcile out-of-band.
      logger.error("[Shadowfax] Settlement failed after delivery", { orderId, error: err.message });
    }

    emitOrderStatusUpdate(
      order.orderId,
      {
        workflowStatus: WORKFLOW_STATUS.DELIVERED,
        status: "delivered",
        deliveryProvider: "shadowfax",
        awbNumber: shipment.awbNumber,
      },
      order.customer
    );
    emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_DELIVERED, {
      orderId: order.orderId,
      customerId: order.customer,
      userId: order.customer,
      sellerId: order.seller,
    });
    return order;
  }

  if (workflowStatus === WORKFLOW_STATUS.CANCELLED) {
    const failed = shipmentStatus === "FAILED";
    const detail = `${rawStatus || shipmentStatus.toLowerCase()}${remarks ? `: ${remarks}` : ""}`;
    const reason = failed
      ? `Shadowfax could not deliver this order (${detail})`
      : `Shadowfax cancelled this order (${detail})`;

    const order = await Order.findOneAndUpdate(
      openOrderFilter,
      {
        $set: {
          workflowStatus: WORKFLOW_STATUS.CANCELLED,
          status: "cancelled",
          cancelledBy: "system",
          cancelReason: reason,
          deliveryFailureReason: reason,
        },
      },
      { new: true }
    );
    if (!order) return null;

    await compensateOrderCancellation(order, order.orderId, { reason });

    emitOrderStatusUpdate(
      order.orderId,
      { workflowStatus: WORKFLOW_STATUS.CANCELLED, status: "cancelled", deliveryProvider: "shadowfax" },
      order.customer
    );
    emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, {
      orderId: order.orderId,
      customerId: order.customer,
      userId: order.customer,
      sellerId: order.seller,
      customerMessage: failed
        ? "Your order could not be delivered and has been cancelled."
        : "Your order has been cancelled.",
      sellerMessage: `Order #${order.orderId}: ${reason}`,
    });
    return order;
  }

  const set = { workflowStatus, status: legacyStatusFromWorkflow(workflowStatus) };
  if (workflowStatus === WORKFLOW_STATUS.OUT_FOR_DELIVERY) set.outForDeliveryAt = now;

  const order = await Order.findOneAndUpdate(openOrderFilter, { $set: set }, { new: true });
  if (!order) return null;

  emitOrderStatusUpdate(
    order.orderId,
    {
      workflowStatus,
      status: set.status,
      deliveryProvider: "shadowfax",
      awbNumber: shipment.awbNumber,
      rider: shipment.rider,
    },
    order.customer
  );
  if (workflowStatus === WORKFLOW_STATUS.OUT_FOR_DELIVERY) {
    emitNotificationEvent(NOTIFICATION_EVENTS.OUT_FOR_DELIVERY, {
      orderId: order.orderId,
      customerId: order.customer,
      userId: order.customer,
      sellerId: order.seller,
    });
  }
  return order;
}
