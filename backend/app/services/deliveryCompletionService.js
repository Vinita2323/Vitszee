import Order from "../models/order.js";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { applyDeliveredSettlement } from "./orderSettlement.js";
import { clearOrderTracking, clearRiderPresence } from "./firebaseService.js";
import {
  emitOrderStatusUpdate,
  emitToCustomer,
  emitToOrder,
} from "./orderSocketEmitter.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import logger from "./logger.js";

/**
 * Atomically moves an OUT_FOR_DELIVERY order to DELIVERED, applies the
 * delivered settlement and fans out realtime + notification events.
 *
 * Shared by:
 *  - verifyHandoffOtpAndDeliver (prepaid / non-COD orders: OTP completes delivery)
 *  - the COD payment flow (QR payment verified, or cash recorded)
 *
 * The findOneAndUpdate guard on the pre-state makes completion idempotent:
 * only one caller can ever flip the order to delivered.
 *
 * @param {object} p
 * @param {string} p.orderId            public order id
 * @param {*}      p.deliveryId         assigned delivery partner id
 * @param {boolean} p.isV2Out           true: workflowStatus OUT_FOR_DELIVERY, false: legacy status
 * @param {string[]} p.images           delivery proof images
 * @param {object|null} p.validationLocation  {lat,lng} captured at OTP validation
 * @param {Date}   p.now                completion time
 * @param {Date}   [p.otpValidatedAt]   when the OTP was verified (defaults to now)
 * @param {object} [p.extraSet]         extra fields merged into the delivered update
 * @param {Function} [p.prepare]        async hook run before the delivered update
 *                                      (e.g. capture online payment finance)
 */
export async function completeOutForDeliveryOrder({
  orderId,
  deliveryId,
  isV2Out,
  images,
  validationLocation = null,
  now = new Date(),
  otpValidatedAt = null,
  extraSet = {},
  prepare = null,
}) {
  if (typeof prepare === "function") {
    await prepare();
  }

  // For v2 orders we move the workflow state; for legacy v1 we just
  // flip the legacy `status`. The atomic guard prevents double-delivery
  // by including the expected pre-state in the filter.
  const updateFilter = isV2Out
    ? {
        orderId,
        workflowStatus: WORKFLOW_STATUS.OUT_FOR_DELIVERY,
        deliveryBoy: deliveryId,
      }
    : {
        orderId,
        status: "out_for_delivery",
        deliveryBoy: deliveryId,
      };

  const updateSet = {
    status: "delivered",
    deliveredAt: now,
    otpValidatedAt: otpValidatedAt || now,
    deliveryProofImages: images,
    ...extraSet,
  };
  if (isV2Out) {
    updateSet.workflowStatus = WORKFLOW_STATUS.DELIVERED;
  }
  if (validationLocation) {
    updateSet.otpValidationLocation = validationLocation;
  }

  let updated = await Order.findOneAndUpdate(
    updateFilter,
    { $set: updateSet },
    { new: true },
  );

  if (updated) {
    updated = await updated.populate("customer");
  }

  if (!updated) {
    const err = new Error("Could not finalize delivery");
    err.statusCode = 409;
    err.code = "ORDER_NOT_READY";
    throw err;
  }

  if (!updated.customer) {
    logger.error("Customer field lost during delivery completion", {
      scope: "ORDER_BUG",
      orderId,
      _id: updated._id,
    });
    const err = new Error(
      "Order data integrity error: customer reference lost during update",
    );
    err.statusCode = 500;
    err.code = "ORDER_DATA_CORRUPT";
    throw err;
  }

  let settlementWarning = null;
  try {
    await applyDeliveredSettlement(updated, orderId);
  } catch (settlementError) {
    // Order is already marked delivered. Surface a warning instead of
    // failing the OTP call — finance can reconcile out-of-band.
    logger.error("Settlement failed after delivery", {
      scope: "completeOutForDeliveryOrder",
      orderId,
      error: settlementError.message,
    });
    settlementWarning = {
      code: "FINANCE_SETTLEMENT_FAILED",
      message: settlementError.message,
    };
  }

  // Realtime tracking nodes for this order are no longer interesting —
  // drop them so the customer's live-map and the fleet view stop
  // showing this rider as "live on order".
  clearOrderTracking(orderId).catch(() => {});
  clearRiderPresence(deliveryId).catch(() => {});

  emitOrderStatusUpdate(
    orderId,
    {
      workflowStatus: WORKFLOW_STATUS.DELIVERED,
      checkoutGroupId: updated.checkoutGroupId,
    },
    updated.customer,
  );

  // Frontend-compat: customers + observers listen for "delivery:otp:validated"
  // to flip their UI to "Delivered". Emit to both the customer room and the
  // order room so any open client picks it up.
  const validatedPayload = {
    orderId,
    checkoutGroupId: updated.checkoutGroupId,
    status: "delivered",
    deliveredAt: now.toISOString(),
  };
  emitToCustomer(updated.customer?._id || updated.customer, {
    event: "delivery:otp:validated",
    payload: validatedPayload,
  });
  emitToOrder(orderId, {
    event: "delivery:otp:validated",
    payload: validatedPayload,
  });

  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_DELIVERED, {
    orderId: updated.orderId,
    customerId: updated.customer,
    userId: updated.customer,
    deliveryId: updated.deliveryBoy,
    sellerId: updated.seller,
  });

  return {
    order: updated,
    orderId: updated.orderId,
    deliveredAt: now.toISOString(),
    warning: settlementWarning,
  };
}
