import Shipment from "../../models/shipment.js";
import WebhookEventLog from "../../models/webhookEventLog.js";
import logger from "../logger.js";
import { mapDelhiveryStatus, isValidForwardStatusTransition } from "./delhiveryStatusMapper.js";
import { applyForwardStatusTimestamps } from "./delhiveryForwardService.js";
import { syncOrderWithShipmentStatus } from "./delhiveryOrderSync.js";

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
 * Stable id for a scan so Delhivery re-sends of the same scan are ignored.
 */
function buildEventId(payload, headers, { awbNumber, referenceNo, status, statusDateTime }) {
  const explicit = payload.event_id || headers["x-event-id"];
  if (explicit) return String(explicit);
  const ref = awbNumber || referenceNo || "unknown";
  if (status && statusDateTime) return `${ref}:${status}:${statusDateTime}`;
  return `${ref}:${status || "unknown"}:${Date.now()}`;
}

/**
 * Processes a Delhivery push scan.
 *
 * Documented payload:
 * { "Shipment": { "Status": { "Status", "StatusDateTime", "StatusType", "StatusLocation", "Instructions" },
 *                 "PickUpDate", "NSLCode", "Sortcode", "ReferenceNo", "AWB" } }
 * ReferenceNo is our order id; AWB is the waybill.
 */
export async function processDelhiveryWebhook(payload = {}, headers = {}) {
  const parcel = payload.Shipment || payload.shipment || payload;
  const scan = parcel.Status || parcel.status || {};

  const awbNumber = String(parcel.AWB || parcel.awb || parcel.Waybill || parcel.waybill || "").trim();
  const referenceNo = String(parcel.ReferenceNo || parcel.reference_no || parcel.OrderId || "").trim();
  const rawStatus = String(scan.Status || scan.status || "").trim();
  const statusType = String(scan.StatusType || scan.status_type || "").trim();
  const statusDateTime = String(scan.StatusDateTime || scan.status_datetime || "").trim();
  const instructions = scan.Instructions || scan.instructions || null;

  const eventId = buildEventId(payload, headers, { awbNumber, referenceNo, status: rawStatus, statusDateTime });

  // 1. Deduplication guard
  let eventLog = null;
  try {
    eventLog = await WebhookEventLog.create({
      provider: "delhivery",
      eventType: rawStatus || "unknown",
      eventId,
      providerOrderId: awbNumber,
      internalOrderId: referenceNo,
      awbNumber,
      payload,
      headers: redactHeaders(headers),
      processed: false,
    });
  } catch (err) {
    if (err.code === 11000) {
      logger.warn(`[Delhivery Webhook] Duplicate scan ignored: ${eventId}`);
      return { duplicate: true, message: "Scan already processed" };
    }
    logger.error(`[Delhivery Webhook] Failed to save event log: ${err.message}`);
  }

  // 2. Find the shipment (AWB is unique; fall back to our order id)
  if (!awbNumber && !referenceNo) {
    if (eventLog) {
      eventLog.error = "No AWB or reference number in scan payload";
      await eventLog.save();
    }
    return { success: false, reason: "Missing identifiers" };
  }

  let shipment = awbNumber ? await Shipment.findOne({ awbNumber }) : null;
  if (!shipment && referenceNo) {
    shipment = await Shipment.findOne({
      $or: [{ internalOrderId: referenceNo }, { clientOrderId: referenceNo }],
      providerType: "forward",
    });
  }

  if (!shipment) {
    logger.warn("[Delhivery Webhook] Shipment not found for scan", { awbNumber, referenceNo });
    if (eventLog) {
      eventLog.error = "Shipment document not found in DB";
      await eventLog.save();
    }
    return { success: false, reason: "Shipment not found" };
  }

  try {
    const normalizedStatus = mapDelhiveryStatus(rawStatus, statusType);
    const description = `Scan: ${rawStatus}${instructions ? ` (${instructions})` : ""}`;

    if (normalizedStatus && isValidForwardStatusTransition(shipment.shipmentStatus, normalizedStatus)) {
      applyForwardStatusTimestamps(shipment, normalizedStatus);
      shipment.shipmentStatus = normalizedStatus;
      shipment.providerStatus = rawStatus;
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

      await syncOrderWithShipmentStatus(shipment, normalizedStatus, { rawStatus, remarks: instructions });
    } else if (!normalizedStatus && rawStatus) {
      // Informational scan: record it without changing the state.
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
      logger.info(
        `[Delhivery Webhook] Ignored out-of-order scan: ${rawStatus} for current status ${shipment.shipmentStatus}`
      );
    }

    if (eventLog) {
      eventLog.processed = true;
      eventLog.processedAt = new Date();
      await eventLog.save();
    }

    return { success: true, shipmentId: shipment._id };
  } catch (err) {
    logger.error(`[Delhivery Webhook] Error processing scan: ${err.message}`, { stack: err.stack });
    if (eventLog) {
      eventLog.error = err.message;
      await eventLog.save();
    }
    return { success: false, error: err.message };
  }
}
