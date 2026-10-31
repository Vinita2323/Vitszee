import Order from "../models/order.js";
import CodQrPayment from "../models/codQrPayment.js";
import {
  COD_QR_STATUS,
  COD_QR_OPEN_STATUSES,
  COD_QR_AUDIT_EVENT,
  COD_SETTLEMENT_METHOD,
  codQrEnabled,
  codQrExpiryMinutes,
} from "../constants/codQr.js";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { roundCurrency } from "../utils/money.js";
import { requireCanonicalOrderId } from "../utils/orderLookup.js";
import { completeOutForDeliveryOrder } from "./deliveryCompletionService.js";
import {
  createDynamicQr,
  fetchQr,
  fetchQrPayments,
  closeQr,
} from "./payment/razorpayQrGateway.js";
import {
  emitOrderStatusUpdate,
  emitToCustomer,
  emitToDelivery,
  emitToOrder,
} from "./orderSocketEmitter.js";
import logger from "./logger.js";

/* ────────────────────────────── helpers ────────────────────────────── */

function svcError(message, statusCode, code, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

const PAID_ORDER_PAYMENT_STATUSES = new Set([
  "PAID",
  "CASH_COLLECTED",
  "COD_RECONCILED",
  "PARTIALLY_REMITTED",
  "REFUNDED",
]);

export const toPaise = (rupees) => Math.round(Number(rupees || 0) * 100);

/** Amount still to be collected for the order, in rupees (same basis as COD cash collection). */
export function outstandingAmountRupees(order) {
  const total = roundCurrency(
    order?.paymentBreakdown?.grandTotal || order?.pricing?.total || 0,
  );
  const collected = roundCurrency(order?.paymentBreakdown?.codCollectedAmount || 0);
  return Math.max(0, roundCurrency(total - collected));
}

/**
 * True when delivering this order needs a payment step (COD with money
 * still outstanding). Prepaid / already-settled orders keep the original
 * "OTP completes delivery" behaviour.
 */
export function orderRequiresCodPayment(order) {
  return codQrEnabled() && orderIsOutstandingCod(order);
}

/** COD order whose cash has not been collected yet (independent of the QR feature flag). */
export function orderIsOutstandingCod(order) {
  if (!order) return false;
  const mode = String(order.paymentMode || "").toUpperCase();
  const legacy = String(order.payment?.method || "").toLowerCase();
  const isCod = mode === "COD" || (!mode && (legacy === "cash" || legacy === "cod"));
  if (!isCod || legacy === "online") return false;
  if (order.financeFlags?.codMarkedCollected) return false;
  if (order.financeFlags?.onlinePaymentCaptured) return false;
  if (PAID_ORDER_PAYMENT_STATUSES.has(order.paymentStatus)) return false;
  return outstandingAmountRupees(order) > 0;
}

function isOutForDeliveryV2(order) {
  return order.workflowStatus === WORKFLOW_STATUS.OUT_FOR_DELIVERY;
}

function isOrderDelivered(order) {
  return (
    order.workflowStatus === WORKFLOW_STATUS.DELIVERED ||
    String(order.status || "").toLowerCase() === "delivered"
  );
}

function isExactPayment(doc, payment) {
  return (
    !!payment &&
    payment.status === "captured" &&
    Number(payment.amount) === doc.amountPaise &&
    String(payment.currency || "INR").toUpperCase() === doc.currency
  );
}

function sanitizePayment(p = {}) {
  return {
    id: p.id,
    entity: p.entity,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    method: p.method,
    vpa: p.vpa || null,
    captured: p.captured,
    order_id: p.order_id || null,
    created_at: p.created_at,
  };
}

function auditEntry(event, source, detail = {}) {
  return { at: new Date(), event, source, detail };
}

export function displayStatusOf(doc, now = new Date()) {
  if (!doc) return "NOT_STARTED";
  if (doc.status === COD_QR_STATUS.PAID) return "PAID";
  if (doc.status === COD_QR_STATUS.FAILED) return "PAYMENT_FAILED";
  if (doc.status === COD_QR_STATUS.EXPIRED) return "QR_EXPIRED";
  if (doc.status === COD_QR_STATUS.CLOSED) return "CLOSED";
  if (doc.expiresAt && new Date(doc.expiresAt) <= now) return "QR_EXPIRED";
  return "PAYMENT_PENDING";
}

export function summarizeAttempt(doc, { includeQr = true } = {}) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    attempt: doc.attempt,
    status: doc.status,
    displayStatus: displayStatusOf(doc),
    amount: doc.amountPaise / 100,
    amountPaise: doc.amountPaise,
    currency: doc.currency,
    qrImageUrl: includeQr ? doc.qrImageUrl : undefined,
    razorpayQrId: doc.razorpayQrId,
    razorpayPaymentId: doc.razorpayPaymentId,
    expiresAt: doc.expiresAt,
    failureReason: doc.failureReason,
    finalizedAt: doc.finalizedAt,
    reviewRequired: !!doc.reviewRequired,
  };
}

function emitPaymentUpdate(order, event, extra = {}) {
  const payload = {
    orderId: order.orderId,
    checkoutGroupId: order.checkoutGroupId,
    amount: outstandingAmountRupees(order) || order.codHandoff?.outstandingAmount || 0,
    at: new Date().toISOString(),
    ...extra,
  };
  try {
    emitToOrder(order.orderId, { event, payload });
    emitToCustomer(order.customer?._id || order.customer, { event, payload });
    if (order.deliveryBoy) emitToDelivery(order.deliveryBoy, { event, payload });
    emitOrderStatusUpdate(
      order.orderId,
      { codPaymentStatus: extra.codPaymentStatus, paymentStatus: extra.paymentStatus },
      order.customer?._id || order.customer,
    );
  } catch (e) {
    logger.warn("cod payment realtime emit failed", { orderId: order.orderId, error: e.message });
  }
}

async function loadOrderForActor(orderIdParam, actor, { write = false } = {}) {
  const orderId = await requireCanonicalOrderId(orderIdParam);
  const order = await Order.findOne({ orderId });
  if (!order) throw svcError("Order not found", 404, "ORDER_NOT_FOUND");
  if (actor?.role === "delivery") {
    if (!order.deliveryBoy || String(order.deliveryBoy) !== String(actor.id)) {
      throw svcError("Order not found or not assigned to you", 404, "UNAUTHORIZED_DELIVERY");
    }
  } else if (actor?.role === "admin") {
    if (write) throw svcError("Only the assigned delivery partner can do this", 403, "FORBIDDEN");
  } else {
    throw svcError("Not allowed", 403, "FORBIDDEN");
  }
  return order;
}

function assertAwaitingPayment(order) {
  if (order.codHandoff?.awaitingPayment) return;
  if (isOrderDelivered(order)) {
    throw svcError("Order is already delivered and paid", 409, "ALREADY_COMPLETED");
  }
  throw svcError(
    "Verify the customer's delivery OTP before collecting payment",
    409,
    "PAYMENT_NOT_REQUIRED",
  );
}

/* ─────────────────────── OTP → payment hand-off ─────────────────────── */

/**
 * Called by verifyHandoffOtpAndDeliver once the OTP is verified for a COD
 * order. Keeps the order OUT_FOR_DELIVERY and opens the payment step.
 * Idempotent: a second call while already awaiting returns the order as is.
 */
export async function beginCodPaymentHandoff({
  order,
  deliveryId,
  images,
  validationLocation,
  now = new Date(),
}) {
  if (order.codHandoff?.awaitingPayment) return order;

  const outstanding = outstandingAmountRupees(order);
  const filter = isOutForDeliveryV2(order)
    ? { _id: order._id, workflowStatus: WORKFLOW_STATUS.OUT_FOR_DELIVERY, deliveryBoy: deliveryId }
    : { _id: order._id, status: "out_for_delivery", deliveryBoy: deliveryId };

  const set = {
    otpValidatedAt: now,
    "codHandoff.awaitingPayment": true,
    "codHandoff.otpVerifiedAt": now,
    "codHandoff.proofImages": images,
    "codHandoff.outstandingAmount": outstanding,
    "codHandoff.paymentChoice": null,
    "codHandoff.completedAt": null,
  };
  if (validationLocation) {
    set["codHandoff.validationLocation"] = validationLocation;
    set.otpValidationLocation = validationLocation;
  }

  const updated = await Order.findOneAndUpdate(filter, { $set: set }, { new: true });
  if (!updated) {
    throw svcError("Could not start payment collection", 409, "ORDER_NOT_READY");
  }

  emitPaymentUpdate(updated, "order:payment:pending", {
    codPaymentStatus: "PAYMENT_PENDING",
    paymentStatus: updated.paymentStatus,
  });
  return updated;
}

/* ───────────────────────── attempt state machine ───────────────────────── */

async function pushAudit(docId, entry, extraSet = {}) {
  return CodQrPayment.findOneAndUpdate(
    { _id: docId },
    { $set: extraSet, $push: { auditLog: entry } },
    { new: true },
  );
}

async function closeAttempt(doc, nextStatus, reason) {
  if (doc.razorpayQrId) {
    try {
      await closeQr(doc.razorpayQrId);
    } catch (e) {
      // QR may already be closed/expired at Razorpay — that is fine.
      logger.warn("cod qr close failed (ignored)", { qrId: doc.razorpayQrId, error: e?.error?.description || e.message });
    }
  }
  const updated = await CodQrPayment.findOneAndUpdate(
    { _id: doc._id, razorpayPaymentId: null, status: { $ne: COD_QR_STATUS.PAID } },
    {
      $set: { status: nextStatus, isActive: false },
      $push: { auditLog: auditEntry(COD_QR_AUDIT_EVENT.CLOSED, "SYSTEM", { reason, status: nextStatus }) },
    },
    { new: true },
  );
  return updated || (await CodQrPayment.findById(doc._id));
}

async function markFailed(doc, reason, source) {
  const updated = await CodQrPayment.findOneAndUpdate(
    { _id: doc._id, status: { $in: COD_QR_OPEN_STATUSES }, razorpayPaymentId: null },
    {
      $set: { status: COD_QR_STATUS.FAILED, failedAt: new Date(), failureReason: reason },
      $push: { auditLog: auditEntry(COD_QR_AUDIT_EVENT.PAYMENT_FAILED, source, { reason }) },
    },
    { new: true },
  );
  if (updated) {
    const order = await Order.findById(updated.order);
    if (order) {
      emitPaymentUpdate(order, "order:payment:failed", {
        codPaymentStatus: "PAYMENT_FAILED",
        paymentStatus: order.paymentStatus,
        reason,
      });
    }
  }
  return updated || doc;
}

async function markExpired(doc, source) {
  const updated = await CodQrPayment.findOneAndUpdate(
    { _id: doc._id, razorpayPaymentId: null, status: { $in: [...COD_QR_OPEN_STATUSES, COD_QR_STATUS.FAILED] } },
    {
      $set: { status: COD_QR_STATUS.EXPIRED, isActive: false },
      $push: { auditLog: auditEntry(COD_QR_AUDIT_EVENT.EXPIRED, source) },
    },
    { new: true },
  );
  if (updated) {
    const order = await Order.findById(updated.order);
    if (order) {
      emitPaymentUpdate(order, "order:payment:expired", {
        codPaymentStatus: "QR_EXPIRED",
        paymentStatus: order.paymentStatus,
      });
    }
  }
  return updated || doc;
}

async function flagReview(doc, reason, detail, event = COD_QR_AUDIT_EVENT.DUPLICATE_PAYMENT) {
  if (detail?.paymentId && doc.duplicatePayments?.some((d) => d.paymentId === detail.paymentId)) {
    return doc; // already recorded (webhook redelivery) — keep the audit trail free of repeats
  }
  logger.error("cod qr payment needs review", {
    scope: "codQrPaymentService",
    orderId: doc.orderId,
    qrId: doc.razorpayQrId,
    reason,
    detail,
  });
  return CodQrPayment.findOneAndUpdate(
    { _id: doc._id },
    {
      $set: { reviewRequired: true },
      $push: {
        auditLog: auditEntry(event, "SYSTEM", { reason, ...detail }),
        ...(detail?.paymentId
          ? {
              duplicatePayments: {
                paymentId: detail.paymentId,
                amountPaise: detail.amountPaise,
                reason,
                at: new Date(),
              },
            }
          : {}),
      },
    },
    { new: true },
  );
}

/**
 * Moves the order to DELIVERED/PAID for an attempt whose payment has been
 * verified. Safe to call repeatedly (webhook retries, status polling).
 */
async function ensureOrderCompleted(doc) {
  if (doc.finalizedAt) {
    return { doc, completed: true, order: await Order.findById(doc.order) };
  }
  const FINALIZE_LOCK_MS = 60_000;
  const locked = await CodQrPayment.findOneAndUpdate(
    {
      _id: doc._id,
      finalizedAt: null,
      $or: [{ finalizingAt: null }, { finalizingAt: { $lt: new Date(Date.now() - FINALIZE_LOCK_MS) } }],
    },
    { $set: { finalizingAt: new Date() } },
    { new: true },
  );
  if (!locked) {
    // Another request is completing this payment right now (or just did).
    const fresh = (await CodQrPayment.findById(doc._id)) || doc;
    return { doc: fresh, completed: !!fresh.finalizedAt, inProgress: !fresh.finalizedAt };
  }
  doc = locked;

  const order = await Order.findById(doc.order);
  if (!order) throw svcError("Order not found", 404, "ORDER_NOT_FOUND");

  if (isOrderDelivered(order)) {
    // Delivered through another path (cash) → customer paid twice.
    const flagged = await flagReview(doc, `Order already settled via ${order.paymentMethod || "another method"}`, {
      paymentId: doc.razorpayPaymentId,
      amountPaise: doc.amountPaise,
    });
    await CodQrPayment.updateOne({ _id: doc._id }, { $set: { finalizingAt: null } });
    return { doc: flagged, completed: false, duplicate: true, order };
  }

  const claimed = await Order.findOneAndUpdate(
    {
      _id: order._id,
      "codHandoff.awaitingPayment": true,
      "codHandoff.paymentChoice": { $in: [null, COD_SETTLEMENT_METHOD.RAZORPAY_QR] },
    },
    { $set: { "codHandoff.paymentChoice": COD_SETTLEMENT_METHOD.RAZORPAY_QR } },
    { new: true },
  );
  if (!claimed) {
    const flagged = await flagReview(doc, "Cash settlement already chosen for this order", {
      paymentId: doc.razorpayPaymentId,
      amountPaise: doc.amountPaise,
    });
    await CodQrPayment.updateOne({ _id: doc._id }, { $set: { finalizingAt: null } });
    return { doc: flagged, completed: false, duplicate: true, order };
  }

  const now = new Date();
  try {
    const result = await completeOutForDeliveryOrder({
      orderId: claimed.orderId,
      deliveryId: claimed.deliveryBoy,
      isV2Out: isOutForDeliveryV2(claimed),
      images: claimed.codHandoff.proofImages || [],
      validationLocation: claimed.codHandoff.validationLocation?.lat != null
        ? { lat: claimed.codHandoff.validationLocation.lat, lng: claimed.codHandoff.validationLocation.lng }
        : null,
      now,
      otpValidatedAt: claimed.codHandoff.otpVerifiedAt,
      // Customer paid online → capture as an online payment in finance
      // (admin wallet credit + PAID) *before* delivery settlement runs.
      prepare: async () => {
        // Lazy import keeps the finance module out of this service's static
        // import graph (it is only needed on the QR-paid path).
        const { handleOnlineOrderFinance } = await import("./finance/orderFinanceService.js");
        return handleOnlineOrderFinance(claimed._id, {
          transactionId: doc.razorpayPaymentId,
          metadata: {
            source: "COD_RAZORPAY_QR",
            razorpayQrId: doc.razorpayQrId,
            razorpayPaymentId: doc.razorpayPaymentId,
            amountPaise: doc.amountPaise,
          },
        });
      },
      extraSet: {
        paymentMethod: COD_SETTLEMENT_METHOD.RAZORPAY_QR,
        "codHandoff.awaitingPayment": false,
        "codHandoff.completedAt": now,
      },
    });

    const finalized = await pushAudit(
      doc._id,
      auditEntry(COD_QR_AUDIT_EVENT.ORDER_COMPLETED, "SYSTEM", { deliveredAt: now }),
      { finalizedAt: now, isActive: false },
    );
    emitPaymentUpdate(result.order, "order:payment:paid", {
      codPaymentStatus: "PAID",
      paymentStatus: "PAID",
      method: COD_SETTLEMENT_METHOD.RAZORPAY_QR,
      paymentId: doc.razorpayPaymentId,
    });
    return { doc: finalized, completed: true, order: result.order, warning: result.warning };
  } catch (error) {
    await pushAudit(
      doc._id,
      auditEntry(COD_QR_AUDIT_EVENT.ORDER_COMPLETION_FAILED, "SYSTEM", { error: error.message }),
      { finalizingAt: null },
    );
    throw error;
  }
}

/**
 * Verify an incoming/fetched Razorpay payment against the attempt (QR id is
 * already matched by the caller): captured, exact amount, currency — then
 * claim it exactly once and complete the order.
 */
async function settlePaidAttempt(doc, payment, { source, webhookEventId = null } = {}) {
  if (!payment?.id) return { doc, completed: false };

  if (payment.status !== "captured") {
    const d = await pushAudit(
      doc._id,
      auditEntry(COD_QR_AUDIT_EVENT.PAYMENT_NOT_CAPTURED, source, {
        paymentId: payment.id,
        status: payment.status,
      }),
    );
    return { doc: d || doc, completed: false };
  }

  if (!isExactPayment(doc, payment)) {
    const d = await flagReview(
      doc,
      `Amount mismatch: expected ${doc.amountPaise} ${doc.currency}, got ${payment.amount} ${payment.currency}`,
      { paymentId: payment.id, amountPaise: payment.amount },
      COD_QR_AUDIT_EVENT.AMOUNT_MISMATCH,
    );
    return { doc: d || doc, completed: false, mismatch: true };
  }

  const late =
    doc.status === COD_QR_STATUS.EXPIRED ||
    doc.status === COD_QR_STATUS.CLOSED ||
    (doc.expiresAt && new Date(doc.expiresAt) < new Date());

  let claimed;
  try {
    claimed = await CodQrPayment.findOneAndUpdate(
      { _id: doc._id, razorpayPaymentId: null },
      {
        $set: {
          status: COD_QR_STATUS.PAID,
          razorpayPaymentId: payment.id,
          paymentMethodUsed: payment.method || null,
          payerVpa: payment.vpa || null,
          capturedAt: payment.created_at ? new Date(payment.created_at * 1000) : new Date(),
          paymentSnapshot: sanitizePayment(payment),
          failureReason: null,
        },
        $push: {
          auditLog: auditEntry(COD_QR_AUDIT_EVENT.PAYMENT_VERIFIED, source, {
            paymentId: payment.id,
            amountPaise: payment.amount,
            late,
          }),
          ...(webhookEventId ? { webhookEventIds: webhookEventId } : {}),
        },
      },
      { new: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    claimed = null; // payment id already used by another attempt
  }

  if (!claimed) {
    const fresh = await CodQrPayment.findById(doc._id);
    if (fresh?.razorpayPaymentId === payment.id) {
      // Same payment delivered again (webhook retry / poll) → idempotent.
      return ensureOrderCompleted(fresh);
    }
    const flagged = await flagReview(fresh || doc, "Second payment received on an already-paid QR", {
      paymentId: payment.id,
      amountPaise: payment.amount,
    });
    return { doc: flagged, completed: false, duplicate: true };
  }

  if (late) {
    await pushAudit(doc._id, auditEntry(COD_QR_AUDIT_EVENT.LATE_PAYMENT_ACCEPTED, source, { paymentId: payment.id }));
  }
  return ensureOrderCompleted(claimed);
}

/**
 * Ask Razorpay what really happened to this QR and apply it. Used by the
 * status endpoint (delayed/missed webhooks) and before closing/replacing a QR.
 */
async function reconcileAttempt(doc, { source = "STATUS_CHECK" } = {}) {
  if (doc.status === COD_QR_STATUS.PAID) {
    return doc.finalizedAt ? { doc, completed: true } : ensureOrderCompleted(doc);
  }
  if (!doc.razorpayQrId) return { doc, completed: false };

  let qr;
  let items;
  try {
    const [qrRes, paymentsRes] = await Promise.all([
      fetchQr(doc.razorpayQrId),
      fetchQrPayments(doc.razorpayQrId),
    ]);
    qr = qrRes;
    items = Array.isArray(paymentsRes?.items) ? paymentsRes.items : [];
  } catch (error) {
    logger.error("cod qr reconcile: razorpay unreachable", {
      scope: "codQrPaymentService",
      qrId: doc.razorpayQrId,
      error: error?.error?.description || error.message,
    });
    throw svcError("Could not reach Razorpay to verify the payment. Try again.", 502, "GATEWAY_UNAVAILABLE");
  }

  const exact = items.find((p) => isExactPayment(doc, p));
  if (exact) return settlePaidAttempt(doc, exact, { source });

  const wrongAmount = items.find((p) => p.status === "captured");
  if (wrongAmount) return settlePaidAttempt(doc, wrongAmount, { source });

  let current = doc;
  if (items.some((p) => p.status === "failed") && COD_QR_OPEN_STATUSES.includes(doc.status)) {
    const failure = items.find((p) => p.status === "failed");
    current = await markFailed(
      doc,
      failure?.error_description || failure?.error_reason || "Payment failed",
      source,
    );
  }

  const expiredAtGateway = qr?.status === "closed" && qr?.close_reason === "expired";
  const locallyExpired = doc.expiresAt && new Date(doc.expiresAt) <= new Date();
  if (expiredAtGateway || locallyExpired) {
    if (qr?.status === "active") {
      // Stop any further payments, then re-check so a last-second payment is not lost.
      try {
        await closeQr(doc.razorpayQrId);
        const again = await fetchQrPayments(doc.razorpayQrId);
        const late = (again?.items || []).find((p) => isExactPayment(doc, p));
        if (late) return settlePaidAttempt(doc, late, { source });
      } catch (e) {
        logger.warn("cod qr expiry close failed (ignored)", { error: e?.error?.description || e.message });
      }
    }
    current = await markExpired(current, source);
  } else if (qr?.status === "closed" && qr?.close_reason === "on_demand") {
    current = await closeAttempt(current, COD_QR_STATUS.CLOSED, "Closed at Razorpay");
  }

  await pushAudit(current._id, auditEntry(COD_QR_AUDIT_EVENT.STATUS_CHECKED, source, {
    qrStatus: qr?.status,
    payments: items.length,
  }));
  return { doc: (await CodQrPayment.findById(current._id)) || current, completed: false };
}

/* ───────────────────────────── public API ───────────────────────────── */

export async function getCodPaymentState({ orderId, actor }) {
  const order = await loadOrderForActor(orderId, actor);
  const latest = await CodQrPayment.findOne({ order: order._id }).sort({ createdAt: -1 });
  const handoff = order.codHandoff || {};
  const delivered = isOrderDelivered(order);
  const choice = handoff.paymentChoice;
  return {
    orderId: order.orderId,
    awaitingPayment: !!handoff.awaitingPayment,
    completed: delivered,
    paymentChoice: choice || null,
    paymentMethod: order.paymentMethod || null,
    paymentStatus: order.paymentStatus,
    outstandingAmount: handoff.awaitingPayment
      ? outstandingAmountRupees(order)
      : handoff.outstandingAmount || 0,
    payment: summarizeAttempt(latest, { includeQr: actor?.role !== "customer" }),
    canGenerateQr:
      !!handoff.awaitingPayment && choice !== COD_SETTLEMENT_METHOD.CASH && actor?.role === "delivery",
    canCollectCash:
      !!handoff.awaitingPayment && choice !== COD_SETTLEMENT_METHOD.RAZORPAY_QR && actor?.role === "delivery",
  };
}

export async function createOrReuseQr({ orderId, deliveryId, regenerate = false }) {
  const actor = { role: "delivery", id: deliveryId };
  const order = await loadOrderForActor(orderId, actor, { write: true });
  assertAwaitingPayment(order);
  if (order.codHandoff.paymentChoice === COD_SETTLEMENT_METHOD.CASH) {
    throw svcError("Cash has already been recorded for this order", 409, "CASH_ALREADY_CHOSEN");
  }

  const amountPaise = toPaise(outstandingAmountRupees(order));
  if (amountPaise < 100) {
    throw svcError("Amount is below the ₹1 minimum for online payment. Collect cash instead.", 400, "AMOUNT_TOO_LOW");
  }

  const active = await CodQrPayment.findOne({ order: order._id, isActive: true });
  if (active) {
    // A payment may have landed on the old QR — settle that first.
    const rec = await reconcileAttempt(active, { source: "STATUS_CHECK" });
    if (rec.completed) {
      return { completed: true, payment: summarizeAttempt(rec.doc), reused: false };
    }
    const current = rec.doc;
    const reusable =
      current.isActive &&
      current.razorpayQrId &&
      current.status === COD_QR_STATUS.PENDING &&
      current.amountPaise === amountPaise &&
      new Date(current.expiresAt) > new Date();
    if (reusable && !regenerate) {
      return { completed: false, payment: summarizeAttempt(current), reused: true };
    }
    if (current.isActive) {
      await closeAttempt(
        current,
        COD_QR_STATUS.CLOSED,
        regenerate ? "Replaced by a new QR (retry)" : "Replaced (stale or amount changed)",
      );
    }
  }

  const attempt = (await CodQrPayment.countDocuments({ order: order._id })) + 1;
  const expiresAt = new Date(Date.now() + codQrExpiryMinutes() * 60 * 1000);

  let doc;
  try {
    doc = await CodQrPayment.create({
      order: order._id,
      orderId: order.orderId,
      customer: order.customer?._id || order.customer,
      deliveryBoy: order.deliveryBoy,
      attempt,
      amountPaise,
      currency: "INR",
      status: COD_QR_STATUS.CREATED,
      isActive: true,
      expiresAt,
    });
  } catch (error) {
    if (error?.code === 11000) {
      // Concurrent request already created the live QR → return it.
      const existing = await CodQrPayment.findOne({ order: order._id, isActive: true });
      if (existing) return { completed: false, payment: summarizeAttempt(existing), reused: true };
    }
    throw error;
  }

  try {
    const qr = await createDynamicQr({
      amountPaise,
      closeByUnix: Math.floor(expiresAt.getTime() / 1000),
      name: `Order ${order.orderId}`.slice(0, 40),
      description: `COD payment for order ${order.orderId}`.slice(0, 255),
      notes: { orderId: order.orderId, codQrPaymentId: String(doc._id), attempt: String(attempt) },
    });
    doc = await CodQrPayment.findOneAndUpdate(
      { _id: doc._id },
      {
        $set: {
          razorpayQrId: qr.id,
          qrImageUrl: qr.image_url,
          status: COD_QR_STATUS.PENDING,
        },
        $push: {
          auditLog: auditEntry(COD_QR_AUDIT_EVENT.QR_CREATED, "RIDER", {
            qrId: qr.id,
            amountPaise,
            expiresAt,
          }),
        },
      },
      { new: true },
    );
  } catch (error) {
    const reason = error?.error?.description || error.message || "QR creation failed";
    await CodQrPayment.findOneAndUpdate(
      { _id: doc._id },
      {
        $set: { status: COD_QR_STATUS.FAILED, isActive: false, failedAt: new Date(), failureReason: reason },
        $push: { auditLog: auditEntry(COD_QR_AUDIT_EVENT.QR_CREATE_FAILED, "RIDER", { reason }) },
      },
    );
    logger.error("cod qr creation failed", { scope: "codQrPaymentService", orderId: order.orderId, reason });
    throw svcError(`Could not create payment QR: ${reason}`, 502, "QR_CREATE_FAILED");
  }

  emitPaymentUpdate(order, "order:payment:pending", {
    codPaymentStatus: "PAYMENT_PENDING",
    paymentStatus: order.paymentStatus,
    amount: amountPaise / 100,
  });
  return { completed: false, payment: summarizeAttempt(doc), reused: false };
}

/** Backend payment verification against Razorpay (used when webhooks are delayed). */
export async function verifyCodPayment({ orderId, actor }) {
  const order = await loadOrderForActor(orderId, actor);
  let completed = isOrderDelivered(order);

  // Recover an attempt that was paid but whose order completion failed earlier.
  const stuck = await CodQrPayment.findOne({
    order: order._id,
    status: COD_QR_STATUS.PAID,
    finalizedAt: null,
  });
  if (stuck && order.codHandoff?.awaitingPayment) {
    const r = await ensureOrderCompleted(stuck);
    completed = completed || r.completed;
  } else if (!completed) {
    const active = await CodQrPayment.findOne({ order: order._id, isActive: true });
    if (active) {
      const r = await reconcileAttempt(active, { source: "STATUS_CHECK" });
      completed = completed || !!r.completed;
    }
  }

  return getCodPaymentState({ orderId: order.orderId, actor });
}

/** Rider records cash instead of QR. */
export async function confirmCashCollection({ orderId, deliveryId, amountReceived = null }) {
  const actor = { role: "delivery", id: deliveryId };
  const order = await loadOrderForActor(orderId, actor, { write: true });
  assertAwaitingPayment(order);
  if (order.codHandoff.paymentChoice === COD_SETTLEMENT_METHOD.RAZORPAY_QR) {
    throw svcError("Online payment was already received for this order", 409, "ALREADY_PAID_ONLINE");
  }

  const due = outstandingAmountRupees(order);
  let received = due;
  if (amountReceived != null && amountReceived !== "") {
    received = roundCurrency(Number(amountReceived));
    if (!Number.isFinite(received) || received < due) {
      throw svcError(`Cash received must be at least ₹${due}`, 400, "CASH_AMOUNT_INVALID");
    }
  }

  // Make sure the customer has not already paid the QR before taking cash.
  const active = await CodQrPayment.findOne({ order: order._id, isActive: true });
  if (active) {
    try {
      const rec = await reconcileAttempt(active, { source: "STATUS_CHECK" });
      if (rec.completed) {
        throw svcError("Customer already paid online. Delivery is complete.", 409, "ALREADY_PAID_ONLINE");
      }
    } catch (error) {
      if (error.code === "ALREADY_PAID_ONLINE") throw error;
      // Razorpay unreachable: cash is the fallback. A late QR payment will
      // be flagged for refund review (paymentChoice=CASH blocks completion).
      logger.warn("cod cash: could not verify QR before cash, proceeding", { error: error.message });
    }
    const fresh = await CodQrPayment.findById(active._id);
    if (fresh) await closeAttempt(fresh, COD_QR_STATUS.CLOSED, "Switched to cash");
  }

  const claimed = await Order.findOneAndUpdate(
    {
      _id: order._id,
      "codHandoff.awaitingPayment": true,
      "codHandoff.paymentChoice": { $in: [null, COD_SETTLEMENT_METHOD.CASH] },
    },
    {
      $set: {
        "codHandoff.paymentChoice": COD_SETTLEMENT_METHOD.CASH,
        "codHandoff.cashReceived": received,
      },
    },
    { new: true },
  );
  if (!claimed) {
    throw svcError("Payment for this order was just settled online", 409, "ALREADY_PAID_ONLINE");
  }

  const now = new Date();
  // Cash path: the existing COD settlement (applyDeliveredSettlement →
  // handleCodOrderFinance) records the collection in the rider's cash float.
  const result = await completeOutForDeliveryOrder({
    orderId: claimed.orderId,
    deliveryId: claimed.deliveryBoy,
    isV2Out: isOutForDeliveryV2(claimed),
    images: claimed.codHandoff.proofImages || [],
    validationLocation: claimed.codHandoff.validationLocation?.lat != null
      ? { lat: claimed.codHandoff.validationLocation.lat, lng: claimed.codHandoff.validationLocation.lng }
      : null,
    now,
    otpValidatedAt: claimed.codHandoff.otpVerifiedAt,
    extraSet: {
      paymentMethod: COD_SETTLEMENT_METHOD.CASH,
      "codHandoff.awaitingPayment": false,
      "codHandoff.completedAt": now,
      "codHandoff.cashReceived": received,
    },
  });

  emitPaymentUpdate(result.order, "order:payment:paid", {
    codPaymentStatus: "PAID",
    paymentStatus: result.order.paymentStatus,
    method: COD_SETTLEMENT_METHOD.CASH,
  });
  return { ...result, cashReceived: received, change: roundCurrency(received - due) };
}

/**
 * Razorpay webhook handler for QR events (signature already verified by
 * the caller). Idempotent: replays and retries are safe.
 *
 * @returns {{ handled: boolean, reason?: string, completed?: boolean }}
 */
export async function processQrWebhookEvent({ event, payload, eventId = null }) {
  if (event !== "qr_code.credited" && event !== "qr_code.closed") {
    return { handled: false, reason: "unsupported_event" };
  }
  const qrEntity = payload?.qr_code?.entity;
  const paymentEntity = payload?.payment?.entity;
  const qrId = qrEntity?.id;
  if (!qrId) return { handled: false, reason: "missing_qr_id" };

  const doc = await CodQrPayment.findOne({ razorpayQrId: qrId });
  if (!doc) return { handled: false, reason: "unknown_qr" };

  await pushAudit(
    doc._id,
    auditEntry(COD_QR_AUDIT_EVENT.WEBHOOK_RECEIVED, "WEBHOOK", {
      event,
      eventId,
      paymentId: paymentEntity?.id || null,
    }),
  );

  if (event === "qr_code.closed") {
    const rec = await reconcileAttempt(doc, { source: "WEBHOOK" });
    return { handled: true, completed: !!rec.completed };
  }

  if (!paymentEntity?.id) return { handled: false, reason: "missing_payment" };
  const result = await settlePaidAttempt(doc, paymentEntity, { source: "WEBHOOK", webhookEventId: eventId });
  return {
    handled: true,
    completed: !!result.completed,
    duplicate: !!result.duplicate,
    mismatch: !!result.mismatch,
  };
}

/** Payment summary attached to order-details responses. */
export async function getOrderPaymentSummary(order, { includeQr = false } = {}) {
  if (!order?._id) return null;
  const latest = await CodQrPayment.findOne({ order: order._id }).sort({ createdAt: -1 }).lean();
  if (!latest && !order.codHandoff?.awaitingPayment) return null;
  return {
    awaitingPayment: !!order.codHandoff?.awaitingPayment,
    paymentChoice: order.codHandoff?.paymentChoice || null,
    paymentMethod: order.paymentMethod || null,
    outstandingAmount: order.codHandoff?.awaitingPayment ? outstandingAmountRupees(order) : 0,
    attempt: summarizeAttempt(latest, { includeQr }),
  };
}
