import Payment from "../models/payment.js";
import CodQrPayment from "../models/codQrPayment.js";
import {
  PAYMENT_EVENT_SOURCE,
  PAYMENT_STATUS,
  RECONCILIATION_REASON,
  REFUND_STATUS,
} from "../constants/payment.js";
import { alertAdmins } from "./paymentAlerts.js";
import {
  applyFullRefundEffects,
  claimStatusTransition,
  flagReconciliation,
  getRelatedOrdersForPayment,
} from "./paymentService.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import logger from "./logger.js";

/**
 * Refund tracking for webhook events refund.created / refund.processed /
 * refund.failed. Every refund is stored by its Razorpay refund id with
 * amount, status and timestamps, so partial and full refunds are both
 * represented and any redelivery or out-of-order event is harmless.
 *
 * Refund status only moves forward: pending → processed, or pending → failed
 * (a failed refund may later succeed). `processed` is final.
 */
const RANK = { [REFUND_STATUS.PENDING]: 0, [REFUND_STATUS.FAILED]: 1, [REFUND_STATUS.PROCESSED]: 2 };

export function normalizeRefundStatus(entityStatus, eventName) {
  const s = String(entityStatus || "").toLowerCase();
  if (s === "processed") return REFUND_STATUS.PROCESSED;
  if (s === "failed") return REFUND_STATUS.FAILED;
  if (s === "pending" || s === "created") return REFUND_STATUS.PENDING;
  if (eventName === "refund.processed") return REFUND_STATUS.PROCESSED;
  if (eventName === "refund.failed") return REFUND_STATUS.FAILED;
  return REFUND_STATUS.PENDING;
}

/** Statuses a refund may currently be in for `next` to be a legal forward move. */
const allowedFrom = (next) => Object.keys(RANK).filter((s) => RANK[s] < RANK[next]);

async function upsertRefund(Model, docId, refund, status, eventName) {
  const now = new Date();
  const fields = {
    "refunds.$.status": status,
    "refunds.$.amount": refund.amount,
    "refunds.$.lastEvent": eventName,
    "refunds.$.updatedAt": now,
    ...(refund.speed ? { "refunds.$.speed": refund.speed } : {}),
    ...(status === REFUND_STATUS.PROCESSED ? { "refunds.$.processedAt": now } : {}),
    ...(status === REFUND_STATUS.FAILED ? { "refunds.$.failedAt": now } : {}),
  };

  // 1. Known refund: move it forward only.
  const moved = await Model.findOneAndUpdate(
    { _id: docId, refunds: { $elemMatch: { refundId: refund.id, status: { $in: allowedFrom(status) } } } },
    { $set: fields },
    { new: true },
  );
  if (moved) return { changed: true, inserted: false };

  // 2. Unknown refund: insert it (atomic against concurrent deliveries).
  const inserted = await Model.findOneAndUpdate(
    { _id: docId, "refunds.refundId": { $ne: refund.id } },
    {
      $push: {
        refunds: {
          refundId: refund.id,
          gatewayPaymentId: refund.paymentId,
          amount: refund.amount,
          currency: refund.currency,
          status,
          speed: refund.speed,
          notes: refund.notes,
          createdAtGateway: refund.createdAt,
          processedAt: status === REFUND_STATUS.PROCESSED ? now : null,
          failedAt: status === REFUND_STATUS.FAILED ? now : null,
          lastEvent: eventName,
          updatedAt: now,
        },
      },
    },
    { new: true },
  );
  if (inserted) return { changed: true, inserted: true };

  // 3. Same status again, or an older status arriving late — nothing to do.
  return { changed: false, inserted: false };
}

async function findRefundTarget(decoded, findPayment) {
  const paymentId = decoded.refund?.paymentId;
  let payment = paymentId ? await Payment.findOne({ gatewayPaymentId: paymentId }) : null;
  if (!payment) payment = await findPayment(decoded);
  if (payment) return { Model: Payment, doc: payment, kind: "PAYMENT" };
  const qr = paymentId ? await CodQrPayment.findOne({ razorpayPaymentId: paymentId }) : null;
  if (qr) return { Model: CodQrPayment, doc: qr, kind: "QR" };
  return null;
}

export async function processRefundEvent({ decoded, findPayment }) {
  const refund = decoded.refund;
  if (!refund?.id) return { matched: false, reason: "missing_refund_id" };
  const status = normalizeRefundStatus(refund.status, decoded.eventName);

  const target = await findRefundTarget(decoded, findPayment);
  if (!target) {
    logger.error("refund_event_unmatched", { scope: "paymentRefundService", refundId: refund.id, paymentId: refund.paymentId, status });
    if (status === REFUND_STATUS.FAILED) {
      alertAdmins({
        title: "Refund failed (payment not found)",
        message: `Razorpay refund ${refund.id} of ₹${(refund.amount / 100).toFixed(2)} on payment ${refund.paymentId || "?"} failed and matches no payment of ours.`,
        token: `refund-failed:${refund.id}`,
      });
    }
    return { matched: false, reason: "payment_not_found", refundId: refund.id };
  }

  const { Model, doc, kind } = target;
  const change = await upsertRefund(Model, doc._id, refund, status, decoded.eventName);

  // Totals are derived from the stored refunds, so they are always consistent.
  const fresh = await Model.findById(doc._id);
  const totalProcessed = fresh.refunds
    .filter((r) => r.status === REFUND_STATUS.PROCESSED)
    .reduce((sum, r) => sum + r.amount, 0);
  const paid = kind === "PAYMENT" ? fresh.amount : fresh.amountPaise;
  const refundState = totalProcessed <= 0 ? "NONE" : totalProcessed >= paid ? "FULL" : "PARTIAL";
  await Model.updateOne({ _id: fresh._id }, { $set: { refundedAmount: totalProcessed, refundState } });

  const summary = {
    matched: true,
    refundId: refund.id,
    refundStatus: status,
    changed: change.changed,
    refundedAmount: totalProcessed,
    refundState,
    paymentDocId: fresh._id,
    publicOrderId: fresh.publicOrderId || fresh.orderId,
  };

  if (kind === "PAYMENT") {
    if (totalProcessed > paid) {
      await flagReconciliation(fresh, RECONCILIATION_REASON.REFUND_EXCEEDS_PAYMENT, {
        refundId: refund.id, refundedPaise: totalProcessed, paidPaise: paid,
      }, refund.id);
    }

    // Fully refunded: move the payment (and its orders) to REFUNDED exactly once.
    if (refundState === "FULL" && fresh.status === PAYMENT_STATUS.CAPTURED) {
      const claimed = await claimStatusTransition(fresh, PAYMENT_STATUS.REFUNDED, {
        allowedFrom: [PAYMENT_STATUS.CAPTURED],
        source: PAYMENT_EVENT_SOURCE.WEBHOOK,
        reason: `Refund ${refund.id} processed (full)`,
        eventName: decoded.eventName,
      });
      if (claimed) await applyFullRefundEffects(claimed);
    } else if (refundState === "PARTIAL" && change.changed && status === REFUND_STATUS.PROCESSED) {
      // Partial refund: the payment stays CAPTURED/PAID; just tell the customer.
      const orders = await getRelatedOrdersForPayment(fresh);
      for (const order of orders) {
        emitNotificationEvent(NOTIFICATION_EVENTS.REFUND_COMPLETED, {
          orderId: order.orderId,
          checkoutGroupId: fresh.checkoutGroupId,
          customerId: order.customer,
          userId: order.customer,
          sellerId: order.seller,
        });
      }
    }
  }

  // Failed refund: money did not go back — a person must act. Alert once per refund.
  if (status === REFUND_STATUS.FAILED && change.changed) {
    const first = await Model.findOneAndUpdate(
      { _id: fresh._id, refunds: { $elemMatch: { refundId: refund.id, failureAlertedAt: null } } },
      { $set: { "refunds.$.failureAlertedAt": new Date() } },
      { new: true },
    );
    if (first) {
      if (kind === "PAYMENT") {
        await flagReconciliation(fresh, RECONCILIATION_REASON.REFUND_FAILED, {
          refundId: refund.id, amountPaise: refund.amount, gatewayPaymentId: refund.paymentId,
        }, refund.id);
      } else {
        alertAdmins({
          title: "Refund failed",
          message: `Refund ${refund.id} of ₹${(refund.amount / 100).toFixed(2)} for COD QR payment ${refund.paymentId} failed.`,
          token: `refund-failed:${refund.id}`,
        });
      }
    }
  }
  return summary;
}
