import Shipment from "../../models/shipment.js";
import Order from "../../models/order.js";
import WebhookEventLog from "../../models/webhookEventLog.js";
import logger from "../logger.js";
import {
  mapShadowfaxForwardStatus,
  mapShadowfaxReverseStatus,
  isValidForwardStatusTransition,
  isValidReverseStatusTransition,
} from "./shadowfaxStatusMapper.js";
import { applyForwardStatusTimestamps } from "./shadowfaxForwardService.js";
import { syncOrderWithShipmentStatus } from "./shadowfaxOrderSync.js";
import { emitOrderStatusUpdate } from "../orderSocketEmitter.js";
import { emitNotificationEvent } from "../../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../../modules/notifications/notification.constants.js";

const SENSITIVE_HEADERS = new Set(["authorization", "token", "x-token", "x-webhook-secret", "cookie"]);

function redactHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      SENSITIVE_HEADERS.has(String(key).toLowerCase()) ? "[REDACTED]" : value,
    ])
  );
}

/**
 * Stable id for a callback so Shadowfax retries of the same event are ignored.
 * Push callbacks carry no event id, so AWB/order + status + event_timestamp identify one.
 */
function buildEventId(payload, headers, { awbNumber, clientOrderId, rawStatus }) {
  const explicit = payload.event_id || headers["x-event-id"];
  if (explicit) return String(explicit);
  const ref = awbNumber || clientOrderId || "unknown";
  if (rawStatus && payload.event_timestamp) {
    return `${ref}:${rawStatus}:${payload.event_timestamp}`;
  }
  return `${ref}:${rawStatus || "unknown"}:${Date.now()}`;
}

/**
 * Processes incoming Shadowfax Webhook events (Forward & Reverse).
 *
 * Shadowfax push callback fields: `awb_number`, `order_id` (our client order id),
 * `event` (status id, e.g. "ofd"), `status` (display text, e.g. "Out For Delivery"),
 * `event_timestamp`, `comments`, `rider_name`, `rider_contact`, `type` (FWD/REV).
 */
export async function processShadowfaxWebhook(payload = {}, headers = {}, webhookType = "forward") {
  const awbNumber = String(payload.awb_number || payload.awb || "").trim();
  const clientOrderId = String(payload.order_id || payload.client_order_id || payload.client_order_number || "").trim();
  const statusId = String(payload.event || payload.status_id || "").trim();
  const statusText = String(payload.status || payload.current_status || "").trim();
  const rawStatus = statusId || statusText;
  const isReversePayload = payload.type === "REV" || webhookType === "reverse";
  const eventId = buildEventId(payload, headers, { awbNumber, clientOrderId, rawStatus });

  // 1. Webhook Deduplication Guard (Idempotency)
  let eventLog = null;
  try {
    eventLog = await WebhookEventLog.create({
      provider: "shadowfax",
      eventType: rawStatus || "unknown",
      eventId,
      providerOrderId: String(payload.sfx_order_id || payload.request_id || "").trim(),
      internalOrderId: clientOrderId,
      awbNumber,
      payload,
      headers: redactHeaders(headers),
      processed: false,
    });
  } catch (err) {
    if (err.code === 11000) {
      logger.warn(`[Shadowfax Webhook] Duplicate event ignored: ${eventId}`);
      return { duplicate: true, message: "Event already processed" };
    }
    logger.error(`[Shadowfax Webhook] Failed to save event log: ${err.message}`);
  }

  // 2. Identify Shipment: the AWB is unique; otherwise match our order id + direction.
  if (!awbNumber && !clientOrderId) {
    if (eventLog) {
      eventLog.error = "No identifying order/AWB fields in webhook payload";
      await eventLog.save();
    }
    return { success: false, reason: "Missing identifiers" };
  }

  let shipment = awbNumber ? await Shipment.findOne({ awbNumber }) : null;
  if (!shipment && clientOrderId) {
    shipment = await Shipment.findOne({
      $or: [{ internalOrderId: clientOrderId }, { clientOrderId }, { clientRequestId: clientOrderId }],
      providerType: isReversePayload ? "reverse" : "forward",
    });
  }

  if (!shipment) {
    logger.warn(`[Shadowfax Webhook] Shipment not found for payload`, { clientOrderId, awbNumber });
    if (eventLog) {
      eventLog.error = "Shipment document not found in DB";
      await eventLog.save();
    }
    return { success: false, reason: "Shipment not found" };
  }

  try {
    const isReverse = shipment.providerType === "reverse" || isReversePayload;

    if (!isReverse) {
      // ── Forward Webhook Processing ──
      const normalizedStatus = mapShadowfaxForwardStatus(rawStatus);
      const description = `Webhook: ${statusText || rawStatus}${payload.comments ? ` (${payload.comments})` : ""}`;

      if (normalizedStatus && isValidForwardStatusTransition(shipment.shipmentStatus, normalizedStatus)) {
        applyForwardStatusTimestamps(shipment, normalizedStatus);
        shipment.shipmentStatus = normalizedStatus;
        shipment.providerStatus = rawStatus;

        // Rider details are sent with out-for-delivery events
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

        shipment.timeline.push({
          status: normalizedStatus,
          providerStatus: rawStatus,
          description,
          source: "webhook",
          timestamp: new Date(),
          metadata: payload,
        });
        shipment.lastProviderSyncAt = new Date();
        shipment.lastProviderResponse = payload;
        await shipment.save();

        await syncOrderWithShipmentStatus(shipment, normalizedStatus, {
          rawStatus,
          remarks: payload.comments || null,
        });
      } else if (!normalizedStatus && rawStatus) {
        // Exception statuses (not contactable, on hold, ...) are recorded without changing state.
        shipment.providerStatus = rawStatus;
        shipment.timeline.push({
          status: shipment.shipmentStatus,
          providerStatus: rawStatus,
          description,
          source: "webhook",
          timestamp: new Date(),
          metadata: payload,
        });
        shipment.lastProviderSyncAt = new Date();
        shipment.lastProviderResponse = payload;
        await shipment.save();
      } else {
        logger.info(`[Shadowfax Webhook] Ignored out-of-order forward event: ${rawStatus} for current status: ${shipment.shipmentStatus}`);
      }
    } else {
      // ── Reverse Webhook Processing ──
      const reverseRawStatus = statusText || statusId;
      const normalizedReturnStatus = mapShadowfaxReverseStatus(reverseRawStatus);

      if (isValidReverseStatusTransition(shipment.providerStatus, normalizedReturnStatus)) {
        shipment.providerStatus = reverseRawStatus;

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
          providerStatus: reverseRawStatus,
          description: `Reverse Webhook: ${reverseRawStatus}`,
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
