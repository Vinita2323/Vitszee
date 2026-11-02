import PaymentWebhookEvent from "../models/paymentWebhookEvent.js";
import { WEBHOOK_EVENT_STATUS } from "../constants/payment.js";
import { alertAdmins } from "./paymentAlerts.js";
import logger from "./logger.js";

const LOCK_MS = () => Number.parseInt(process.env.WEBHOOK_EVENT_LOCK_MS || String(2 * 60 * 1000), 10);
const ALERT_AFTER_ATTEMPTS = 3;

/**
 * Claims an event for processing.
 *
 *  - first delivery                       → claimed
 *  - redelivery of a finished event       → { claimed:false, reason:"DUPLICATE" }
 *  - redelivery of a FAILED event         → claimed again (retry)
 *  - another worker is mid-flight         → { claimed:false, reason:"IN_PROGRESS" }
 *  - worker died mid-flight (stale lock)  → claimed again
 */
export async function claimWebhookEvent({ eventId, gatewayName, eventType, payloadHash }) {
  const now = new Date();
  try {
    const doc = await PaymentWebhookEvent.create({
      eventId,
      gatewayName,
      eventType,
      payloadHash,
      status: WEBHOOK_EVENT_STATUS.PROCESSING,
      attempts: 1,
      lockedAt: now,
    });
    return { claimed: true, doc };
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  const stale = new Date(now.getTime() - LOCK_MS());
  const retried = await PaymentWebhookEvent.findOneAndUpdate(
    {
      eventId,
      $or: [
        { status: WEBHOOK_EVENT_STATUS.FAILED },
        { status: WEBHOOK_EVENT_STATUS.PROCESSING, lockedAt: { $lt: stale } },
      ],
    },
    { $set: { status: WEBHOOK_EVENT_STATUS.PROCESSING, lockedAt: now }, $inc: { attempts: 1 } },
    { new: true },
  );
  if (retried) return { claimed: true, doc: retried, retry: true };

  const existing = await PaymentWebhookEvent.findOne({ eventId });
  return {
    claimed: false,
    reason: existing?.status === WEBHOOK_EVENT_STATUS.PROCESSING ? "IN_PROGRESS" : "DUPLICATE",
    doc: existing,
  };
}

export async function completeWebhookEvent(eventId, { status, payment = null, publicOrderId = null, note = null }) {
  await PaymentWebhookEvent.updateOne(
    { eventId },
    {
      $set: {
        status: status || WEBHOOK_EVENT_STATUS.PROCESSED,
        payment,
        publicOrderId,
        note,
        lockedAt: null,
        lastError: null,
        processedAt: new Date(),
      },
    },
  );
}

export async function failWebhookEvent(eventId, error) {
  const doc = await PaymentWebhookEvent.findOneAndUpdate(
    { eventId },
    {
      $set: {
        status: WEBHOOK_EVENT_STATUS.FAILED,
        lockedAt: null,
        lastError: String(error?.message || error).slice(0, 500),
      },
    },
    { new: true },
  );
  logger.error("payment_webhook_event_failed", {
    scope: "paymentWebhookEvents",
    eventId,
    attempts: doc?.attempts,
    message: error?.message,
  });
  // A webhook that keeps failing needs a human before Razorpay gives up on it.
  if (doc && doc.attempts >= ALERT_AFTER_ATTEMPTS && !doc.alertedAt) {
    const first = await PaymentWebhookEvent.findOneAndUpdate(
      { eventId, alertedAt: null },
      { $set: { alertedAt: new Date() } },
    );
    if (first) {
      alertAdmins({
        title: "Payment webhook keeps failing",
        message: `Event ${doc.eventType} (${eventId}) failed ${doc.attempts} times: ${doc.lastError}`,
        token: `webhook-failing:${eventId}`,
      });
    }
  }
  return doc;
}
