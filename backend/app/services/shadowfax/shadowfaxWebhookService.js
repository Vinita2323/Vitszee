import Shipment from "../../models/shipment.js";
import Order from "../../models/order.js";
import WebhookEventLog from "../../models/webhookEventLog.js";
import logger from "../logger.js";
import {
  mapShadowfaxForwardStatus,
  mapShipmentToWorkflowStatus,
  mapShadowfaxReverseStatus,
  isValidForwardStatusTransition,
  isValidReverseStatusTransition,
} from "./shadowfaxStatusMapper.js";
import { emitOrderStatusUpdate } from "../orderSocketEmitter.js";
import { emitNotificationEvent } from "../../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../../modules/notifications/notification.constants.js";
import { applyDeliveredSettlement } from "../orderSettlement.js";

/**
 * Processes incoming Shadowfax Webhook events (Forward & Reverse).
 */
export async function processShadowfaxWebhook(payload = {}, headers = {}, webhookType = "forward") {
  const eventId =
    payload.event_id ||
    payload.id ||
    headers["x-event-id"] ||
    `${payload.order_id || payload.client_order_id || payload.awb_number}-${payload.status || payload.event}-${Date.now()}`;

  const providerOrderId = String(payload.order_id || payload.sfx_order_id || payload.request_id || "").trim();
  const internalOrderId = String(payload.client_order_id || payload.client_order_number || "").trim();
  const awbNumber = String(payload.awb_number || payload.awb || "").trim();
  const rawStatus = String(payload.status || payload.event || payload.current_status || "").trim();

  // 1. Webhook Deduplication Guard (Idempotency)
  let eventLog = null;
  try {
    eventLog = await WebhookEventLog.create({
      provider: "shadowfax",
      eventType: rawStatus || "unknown",
      eventId,
      providerOrderId,
      internalOrderId,
      awbNumber,
      payload,
      headers,
      processed: false,
    });
  } catch (err) {
    if (err.code === 11000) {
      logger.warn(`[Shadowfax Webhook] Duplicate event ignored: ${eventId}`);
      return { duplicate: true, message: "Event already processed" };
    }
    logger.error(`[Shadowfax Webhook] Failed to save event log: ${err.message}`);
  }

  // 2. Identify Shipment
  const query = {
    $or: [
      ...(internalOrderId ? [{ internalOrderId }, { clientOrderId: internalOrderId }] : []),
      ...(awbNumber ? [{ awbNumber }] : []),
      ...(providerOrderId ? [{ shadowfaxOrderId: providerOrderId }, { clientRequestId: providerOrderId }] : []),
    ],
  };

  if (query.$or.length === 0) {
    if (eventLog) {
      eventLog.error = "No identifying order/AWB fields in webhook payload";
      await eventLog.save();
    }
    return { success: false, reason: "Missing identifiers" };
  }

  const shipment = await Shipment.findOne(query);

  if (!shipment) {
    logger.warn(`[Shadowfax Webhook] Shipment not found for payload`, { internalOrderId, awbNumber, providerOrderId });
    if (eventLog) {
      eventLog.error = "Shipment document not found in DB";
      await eventLog.save();
    }
    return { success: false, reason: "Shipment not found" };
  }

  try {
    const isReverse = shipment.providerType === "reverse" || webhookType === "reverse" || payload.type === "REV";

    if (!isReverse) {
      // ── Forward Webhook Processing ──
      const normalizedStatus = mapShadowfaxForwardStatus(rawStatus);

      if (isValidForwardStatusTransition(shipment.shipmentStatus, normalizedStatus)) {
        shipment.shipmentStatus = normalizedStatus;
        shipment.providerStatus = rawStatus;

        // Extract rider updates
        if (payload.rider_name || payload.rider_contact || payload.rider_phone || payload.rider_latitude) {
          shipment.rider = {
            id: payload.rider_id || shipment.rider?.id,
            name: payload.rider_name || shipment.rider?.name,
            phone: payload.rider_contact || payload.rider_phone || shipment.rider?.phone,
            latitude: payload.rider_latitude ? Number(payload.rider_latitude) : shipment.rider?.latitude,
            longitude: payload.rider_longitude ? Number(payload.rider_longitude) : shipment.rider?.longitude,
            lastLocationAt: new Date(),
          };
        }

        // Set timestamps
        if (normalizedStatus === "PICKED_UP") shipment.pickedUpAt = new Date();
        if (normalizedStatus === "RIDER_ARRIVED") shipment.arrivedAt = new Date();
        if (normalizedStatus === "DELIVERED") shipment.deliveredAt = new Date();
        if (normalizedStatus === "CANCELLED") shipment.cancelledAt = new Date();
        if (normalizedStatus === "FAILED") shipment.failedAt = new Date();

        shipment.timeline.push({
          status: normalizedStatus,
          providerStatus: rawStatus,
          description: `Webhook: ${rawStatus}`,
          source: "webhook",
          timestamp: new Date(),
          metadata: payload,
        });

        shipment.lastProviderSyncAt = new Date();
        shipment.lastProviderResponse = payload;
        await shipment.save();

        // Sync with Order
        const newWorkflow = mapShipmentToWorkflowStatus(normalizedStatus);
        const order = await Order.findOne({ orderId: shipment.internalOrderId });

        if (order && newWorkflow) {
          order.workflowStatus = newWorkflow;
          if (newWorkflow === "DELIVERED") {
            order.status = "delivered";
            order.deliveredAt = new Date();
            await applyDeliveredSettlement(order);
          } else if (newWorkflow === "CANCELLED") {
            order.status = "cancelled";
          }
          await order.save();

          emitOrderStatusUpdate(order.orderId, {
            workflowStatus: order.workflowStatus,
            status: order.status,
            rider: shipment.rider,
          });

          // Dispatch notification
          if (newWorkflow === "DELIVERED") {
            emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_DELIVERED, {
              orderId: order.orderId,
              customerId: order.customer,
              sellerId: order.seller,
            });
          } else if (newWorkflow === "OUT_FOR_DELIVERY") {
            emitNotificationEvent(NOTIFICATION_EVENTS.OUT_FOR_DELIVERY, {
              orderId: order.orderId,
              customerId: order.customer,
            });
          }
        }
      } else {
        logger.info(`[Shadowfax Webhook] Ignored out-of-order forward event: ${rawStatus} for current status: ${shipment.shipmentStatus}`);
      }
    } else {
      // ── Reverse Webhook Processing ──
      const normalizedReturnStatus = mapShadowfaxReverseStatus(rawStatus);

      if (isValidReverseStatusTransition(shipment.providerStatus, normalizedReturnStatus)) {
        shipment.providerStatus = rawStatus;

        // Process Doorstep QC if included
        if (payload.qc_result || payload.qc_status) {
          const isPassed = String(payload.qc_status || payload.qc_result).toLowerCase() === "passed" || payload.qc_pass === true;
          shipment.qcDetails.qcStatus = isPassed ? "PASSED" : "FAILED";
          shipment.qcDetails.qcResult = String(payload.qc_result || payload.qc_status);
          shipment.qcDetails.qcFailedReason = payload.qc_failed_reason || payload.reason || null;
          shipment.qcDetails.qcImages = Array.isArray(payload.qc_images) ? payload.qc_images : [];
          shipment.qcDetails.qcTimestamp = new Date();
          shipment.qcDetails.qcVerifiedBy = payload.rider_name || "Shadowfax Rider";
        }

        shipment.timeline.push({
          status: normalizedReturnStatus,
          providerStatus: rawStatus,
          description: `Reverse Webhook: ${rawStatus}`,
          source: "webhook",
          timestamp: new Date(),
          metadata: payload,
        });

        shipment.lastProviderSyncAt = new Date();
        shipment.lastProviderResponse = payload;
        await shipment.save();

        const order = await Order.findOne({ orderId: shipment.internalOrderId });
        if (order) {
          order.returnStatus = normalizedReturnStatus;
          if (shipment.qcDetails.qcStatus === "PASSED") {
            order.returnQcStatus = "passed";
            order.returnQcAt = new Date();
          } else if (shipment.qcDetails.qcStatus === "FAILED") {
            order.returnQcStatus = "failed";
            order.returnQcAt = new Date();
            order.returnQcNote = shipment.qcDetails.qcFailedReason || "QC rejected by doorstep verification";
          }
          await order.save();

          emitOrderStatusUpdate(order.orderId, {
            returnStatus: order.returnStatus,
            returnQcStatus: order.returnQcStatus,
          });

          if (normalizedReturnStatus === "returned") {
            emitNotificationEvent(NOTIFICATION_EVENTS.RETURN_COMPLETED, {
              orderId: order.orderId,
              customerId: order.customer,
              sellerId: order.seller,
            });
          }
        }
      }
    }

    if (eventLog) {
      eventLog.processed = true;
      eventLog.processedAt = new Date();
      await eventLog.save();
    }

    return { success: true, shipmentId: shipment._id };
  } catch (err) {
    logger.error(`[Shadowfax Webhook] Error processing event: ${err.message}`, { stack: err.stack });
    if (eventLog) {
      eventLog.error = err.message;
      await eventLog.save();
    }
    return { success: false, error: err.message };
  }
}
