import crypto from "crypto";
import Shipment from "../../models/shipment.js";
import WebhookEventLog from "../../models/webhookEventLog.js";
import logger from "../logger.js";
import { getDelhiveryLocalConfig } from "./delhiveryLocalConfig.js";
import { applyLocalFulfilment } from "./delhiveryLocalService.js";
import { DelhiveryLocalWebhookError } from "./delhiveryLocalErrors.js";

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "x-coreos-access",
  "x-api-key",
  "x-webhook-signature",
  "x-client-code",
  "cookie",
]);

function redactHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      SENSITIVE_HEADERS.has(String(key).toLowerCase()) ? "[REDACTED]" : value,
    ])
  );
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Authenticates an inbound Local webhook.
 * Delhivery echoes our xApiKey back as `X-Api-Key`, or signs the body and sends
 * `X-WEBHOOK-SIGNATURE`. Fails closed in production when a secret is configured.
 */
export function verifyLocalWebhook(config, headers = {}, rawBody = "") {
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[String(k).toLowerCase()] = v;

  if (config.webhookApiKey) {
    return timingSafeEqual(lower["x-api-key"], config.webhookApiKey);
  }
  if (config.webhookSignatureKey) {
    const provided = lower["x-webhook-signature"];
    if (!provided) return false;
    const key = config.webhookSignatureKey;
    const hmac = crypto.createHmac("sha256", key).update(rawBody || "").digest();
    const hex = hmac.toString("hex");
    const b64 = hmac.toString("base64");
    return timingSafeEqual(provided, hex) || timingSafeEqual(provided, b64);
  }
  // No secret configured: allow in sandbox, reject in production so status can't be spoofed.
  return !config.isProduction;
}

function buildEventId(data, headers, crn, fulfilment) {
  const explicit = data.eventId || headers["x-event-id"];
  if (explicit) return String(explicit);
  const t = data.orderTimings || {};
  const stamp =
    t.orderDeliveredTime || t.orderCancellationTime || t.orderPickedTime || t.orderAcceptedTime || Date.now();
  return `${crn || "unknown"}:${fulfilment || "unknown"}:${stamp}`;
}

/**
 * Processes a Delhivery Local fulfilment webhook.
 *
 * The payload mirrors the Track Order response: an outer envelope with `data`
 * (or the fulfilment object at the top level) carrying `orderId`, `status`,
 * `fulfilmentStatus`, `partnerInfo`, `trackingUrl`, `orderTimings`, ...
 * `clientReferenceOrderId` is our internal order id.
 */
export async function processLocalWebhook(payload = {}, headers = {}, { rawBody = "" } = {}) {
  const config = await getDelhiveryLocalConfig();

  if (!verifyLocalWebhook(config, headers, rawBody || JSON.stringify(payload))) {
    logger.warn("[DelhiveryLocal Webhook] Rejected: authentication failed");
    throw new DelhiveryLocalWebhookError("Webhook authentication failed.");
  }

  const data = payload.data || payload;
  const crn = String(data.orderId || data.order_id || "").trim();
  const clientRef = String(data.clientReferenceOrderId || "").trim();
  const fulfilmentStatus = String(data.fulfilmentStatus || "").trim();
  const orderStatus = String(data.status || "").trim();

  const eventId = buildEventId(data, headers, crn, fulfilmentStatus || orderStatus);

  // 1. Dedupe re-sends of the same fulfilment event.
  let eventLog = null;
  try {
    eventLog = await WebhookEventLog.create({
      provider: "delhivery-local",
      eventType: fulfilmentStatus || orderStatus || "unknown",
      eventId,
      providerOrderId: crn,
      internalOrderId: clientRef,
      awbNumber: crn,
      payload,
      headers: redactHeaders(headers),
      processed: false,
    });
  } catch (err) {
    if (err.code === 11000) {
      logger.warn(`[DelhiveryLocal Webhook] Duplicate event ignored: ${eventId}`);
      return { duplicate: true, message: "Event already processed" };
    }
    logger.error(`[DelhiveryLocal Webhook] Failed to save event log: ${err.message}`);
  }

  // 2. Locate the shipment: CRN lives in awbNumber; clientRef is our order id.
  if (!crn && !clientRef) {
    if (eventLog) {
      eventLog.error = "No orderId or clientReferenceOrderId in webhook payload";
      await eventLog.save();
    }
    return { success: false, reason: "Missing identifiers" };
  }

  let shipment = crn ? await Shipment.findOne({ awbNumber: crn, providerType: "forward" }) : null;
  if (!shipment && clientRef) {
    shipment = await Shipment.findOne({
      $or: [{ internalOrderId: clientRef }, { clientOrderId: clientRef }],
      providerType: "forward",
    });
  }
  if (!shipment) {
    logger.warn("[DelhiveryLocal Webhook] Shipment not found", { crn, clientRef });
    if (eventLog) {
      eventLog.error = "Shipment document not found in DB";
      await eventLog.save();
    }
    return { success: false, reason: "Shipment not found" };
  }

  try {
    await applyLocalFulfilment(shipment, {
      fulfilmentStatus,
      orderStatus,
      partnerInfo: data.partnerInfo,
      trackingUrl: data.trackingUrl,
      raw: payload,
    });
    if (eventLog) {
      eventLog.processed = true;
      eventLog.processedAt = new Date();
      await eventLog.save();
    }
    return { success: true, shipmentId: shipment._id };
  } catch (err) {
    logger.error(`[DelhiveryLocal Webhook] Error processing event: ${err.message}`, { stack: err.stack });
    if (eventLog) {
      eventLog.error = err.message;
      await eventLog.save();
    }
    return { success: false, error: err.message };
  }
}
