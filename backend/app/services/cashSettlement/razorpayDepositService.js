import crypto from "crypto";
import CashDeposit from "../../models/cashDeposit.js";
import Shift from "../../models/shift.js";
import {
  AUDIT_ACTOR,
  DEPOSIT_METHOD,
  DEPOSIT_PAYMENT_STATUS,
  DEPOSIT_STATUS,
} from "../../constants/cashSettlement.js";
import { roundCurrency } from "../../utils/money.js";
import { getRazorpayClient, signaturesMatch } from "../payment/providers/razorpay.adapter.js";
import { alertAdmins } from "../paymentAlerts.js";
import { getCashPosition, toObjectId } from "./position.js";
import { writeAudit } from "./audit.js";
import { notifyCaptain } from "./notifier.js";
import { approveDeposit } from "./depositService.js";
import { serializeDeposit } from "./shiftService.js";
import logger from "../logger.js";

/**
 * Captain cash deposit paid online through Razorpay Checkout.
 *
 * Trust model: the browser is never believed. A deposit is only settled when
 *  - the Razorpay ORDER was created by this backend for this captain and amount,
 *  - and the backend itself confirmed a CAPTURED payment of that exact amount
 *    on that order (Razorpay API lookup after a valid checkout signature, or a
 *    signed Razorpay webhook).
 * A settled deposit then flows through the same transactional allocation as an
 * admin approval (oldest unsettled cash orders first).
 */

const MAX_DEPOSIT = 1_000_000;
const ABANDON_AFTER_MS = () => Number.parseInt(process.env.RAZORPAY_DEPOSIT_ABANDON_MS || String(30 * 60 * 1000), 10);

function svcError(message, statusCode, code, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

const newDepositId = () =>
  `DEP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

const toPaise = (rupees) => Math.round(Number(rupees) * 100);

function requireKeys() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const secret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  if (!keyId || !secret) {
    throw svcError("Online payment is not configured. Please use another deposit method.", 503, "RAZORPAY_NOT_CONFIGURED");
  }
  return { keyId, secret };
}

/** Attempts the captain started but never paid are closed as FAILED (a late payment can still recover them). */
export async function sweepAbandonedRazorpayDeposits(captainId = null) {
  const filter = {
    method: DEPOSIT_METHOD.RAZORPAY,
    status: DEPOSIT_STATUS.PAYMENT_PENDING,
    paymentStatus: DEPOSIT_PAYMENT_STATUS.PENDING,
    createdAt: { $lt: new Date(Date.now() - ABANDON_AFTER_MS()) },
  };
  if (captainId) filter.captain = toObjectId(captainId);
  const res = await CashDeposit.updateMany(filter, {
    $set: {
      status: DEPOSIT_STATUS.PAYMENT_FAILED,
      paymentStatus: DEPOSIT_PAYMENT_STATUS.FAILED,
      failureReason: "Payment not completed",
    },
  });
  return res.modifiedCount || 0;
}

/* ─────────────────────────────── create ─────────────────────────────── */

export async function createRazorpayDeposit({ captainId, amount, idempotencyKey = null }) {
  const { keyId } = requireKeys();

  const claimed = roundCurrency(Number(amount));
  if (!Number.isFinite(claimed) || claimed < 1 || claimed > MAX_DEPOSIT) {
    throw svcError("Enter a valid deposit amount (minimum ₹1)", 400, "INVALID_AMOUNT");
  }
  const captainOid = toObjectId(captainId);

  const position = await getCashPosition(captainId);
  if (position.pendingCash <= 0) {
    throw svcError("You have no pending cash to deposit", 400, "NOTHING_TO_DEPOSIT");
  }
  if (claimed > position.pendingCash) {
    throw svcError(`You can pay up to ₹${position.pendingCash} (your pending cash)`, 400, "AMOUNT_EXCEEDS_PENDING");
  }

  await sweepAbandonedRazorpayDeposits(captainId);

  if (idempotencyKey) {
    const existing = await CashDeposit.findOne({ captain: captainOid, idempotencyKey: String(idempotencyKey) });
    if (existing) return { deposit: existing, checkout: checkoutFor(existing, keyId), duplicate: true };
  }
  // The same amount is already waiting for payment: reuse that Razorpay order (no duplicate records).
  const open = await CashDeposit.findOne({
    captain: captainOid,
    method: DEPOSIT_METHOD.RAZORPAY,
    status: DEPOSIT_STATUS.PAYMENT_PENDING,
    paymentStatus: DEPOSIT_PAYMENT_STATUS.PENDING,
    amount: claimed,
    razorpayOrderId: { $type: "string" },
  });
  if (open) return { deposit: open, checkout: checkoutFor(open, keyId), duplicate: true };

  const lastShift = await Shift.findOne({ captain: captainOid }).sort({ startedAt: -1 }).select("_id");
  let deposit;
  try {
    deposit = await CashDeposit.create({
      depositId: newDepositId(),
      captain: captainOid,
      shift: lastShift?._id || null,
      method: DEPOSIT_METHOD.RAZORPAY,
      amount: claimed,
      idempotencyKey: idempotencyKey ? String(idempotencyKey) : undefined,
      status: DEPOSIT_STATUS.PAYMENT_PENDING,
      paymentStatus: DEPOSIT_PAYMENT_STATUS.PENDING,
      submittedAt: new Date(), // server time
      pendingBefore: position.pendingCash,
    });
  } catch (error) {
    if (error?.code === 11000 && idempotencyKey) {
      const existing = await CashDeposit.findOne({ captain: captainOid, idempotencyKey: String(idempotencyKey) });
      if (existing) return { deposit: existing, checkout: checkoutFor(existing, keyId), duplicate: true };
    }
    throw error;
  }

  try {
    const order = await getRazorpayClient().orders.create({
      amount: toPaise(claimed),
      currency: "INR",
      receipt: deposit.depositId,
      notes: { purpose: "captain_cash_deposit", depositId: deposit.depositId, captainId: String(captainId) },
    });
    deposit = await CashDeposit.findOneAndUpdate(
      { _id: deposit._id },
      { $set: { razorpayOrderId: order.id } },
      { new: true },
    );
  } catch (error) {
    const reason = error?.error?.description || error.message || "Could not create the Razorpay order";
    await CashDeposit.updateOne(
      { _id: deposit._id },
      { $set: { status: DEPOSIT_STATUS.PAYMENT_FAILED, paymentStatus: DEPOSIT_PAYMENT_STATUS.FAILED, failureReason: reason } },
    );
    logger.error("razorpay deposit order creation failed", { scope: "razorpayDeposit", depositId: deposit.depositId, reason });
    throw svcError(`Could not start the online payment: ${reason}`, 502, "RAZORPAY_ORDER_FAILED");
  }

  await writeAudit({
    actorType: AUDIT_ACTOR.CAPTAIN,
    actorId: captainId,
    action: "RAZORPAY_DEPOSIT_STARTED",
    entityType: "CashDeposit",
    entityId: deposit._id,
    captain: captainId,
    after: { depositId: deposit.depositId, amount: claimed, razorpayOrderId: deposit.razorpayOrderId },
  });
  return { deposit, checkout: checkoutFor(deposit, keyId), duplicate: false };
}

/** Public data the browser needs to open Checkout. Never includes the secret. */
function checkoutFor(deposit, keyId) {
  return {
    keyId,
    orderId: deposit.razorpayOrderId,
    amount: toPaise(deposit.amount),
    currency: "INR",
    name: process.env.APP_NAME || "Vitszee",
    description: `Cash deposit ${deposit.depositId}`,
    depositId: deposit.depositId,
  };
}

/* ─────────────────────────────── settle ─────────────────────────────── */

/** Records the verified payment exactly once, then allocates the money to the captain's cash orders. */
async function settleVerifiedPayment(deposit, payment, source) {
  let current;
  try {
    current = await CashDeposit.findOneAndUpdate(
      { _id: deposit._id, razorpayPaymentId: null },
      {
        $set: {
          razorpayPaymentId: payment.id,
          paymentStatus: DEPOSIT_PAYMENT_STATUS.PAID,
          paidAt: new Date(), // server time
          failureReason: null,
        },
      },
      { new: true },
    );
  } catch (error) {
    if (error?.code === 11000) {
      throw svcError("This payment is already recorded against another deposit", 409, "DUPLICATE_PAYMENT");
    }
    throw error;
  }

  if (!current) {
    current = await CashDeposit.findById(deposit._id);
    if (current.razorpayPaymentId !== payment.id) {
      // A different payment on an already-paid deposit: keep the first, flag the second.
      await writeAudit({
        actorType: AUDIT_ACTOR.SYSTEM,
        action: "RAZORPAY_DUPLICATE_PAYMENT",
        entityType: "CashDeposit",
        entityId: deposit._id,
        captain: deposit.captain,
        after: { firstPaymentId: current.razorpayPaymentId, secondPaymentId: payment.id, amount: payment.amount },
      });
      alertAdmins({
        title: "Duplicate deposit payment",
        message: `Deposit ${deposit.depositId} was paid twice (${current.razorpayPaymentId}, ${payment.id}). Refund the duplicate.`,
        token: `deposit-duplicate:${payment.id}`,
      });
      return { deposit: current, duplicate: true };
    }
  } else {
    await writeAudit({
      actorType: AUDIT_ACTOR.SYSTEM,
      action: "RAZORPAY_PAYMENT_VERIFIED",
      entityType: "CashDeposit",
      entityId: deposit._id,
      captain: deposit.captain,
      after: { paymentId: payment.id, amount: payment.amount, source },
    });
  }

  if ([DEPOSIT_STATUS.APPROVED, DEPOSIT_STATUS.PARTIALLY_APPROVED].includes(current.status)) {
    return { deposit: current, duplicate: false };
  }
  try {
    await approveDeposit({
      depositId: deposit._id,
      adminId: null,
      gatewayVerified: true,
      note: `Razorpay payment ${payment.id}`,
    });
  } catch (error) {
    if (error.code !== "DEPOSIT_ALREADY_PROCESSED") throw error; // concurrent settle: already done
  }
  return { deposit: await CashDeposit.findById(deposit._id), duplicate: false };
}

async function markFailedAttempt(deposit, paymentId, reason) {
  if (deposit.paymentStatus === DEPOSIT_PAYMENT_STATUS.PAID) return { recorded: false };
  const attemptId = paymentId || `attempt:${Date.now()}`;
  const updated = await CashDeposit.findOneAndUpdate(
    {
      _id: deposit._id,
      paymentStatus: { $ne: DEPOSIT_PAYMENT_STATUS.PAID },
      "failedAttempts.paymentId": { $ne: attemptId },
    },
    {
      $push: { failedAttempts: { paymentId: attemptId, reason: reason || null, at: new Date() } },
      $set: {
        paymentStatus: DEPOSIT_PAYMENT_STATUS.FAILED,
        status: DEPOSIT_STATUS.PAYMENT_FAILED,
        failureReason: reason || "Payment failed",
      },
    },
    { new: true },
  );
  if (updated) {
    notifyCaptain(deposit.captain, {
      title: "Deposit payment failed",
      message: `Your online payment of ₹${deposit.amount} failed. You can try again.`,
      token: `deposit-failed:${deposit._id}:${attemptId}`,
    });
  }
  return { recorded: !!updated };
}

/* ─────────────────────────────── verify ─────────────────────────────── */

/**
 * Called by the app after Checkout. The signature only proves Checkout's
 * result was not tampered with; settlement still requires the backend to see a
 * captured payment of the exact amount on Razorpay's side.
 */
export async function verifyRazorpayDeposit({ captainId, razorpayOrderId, razorpayPaymentId = null, razorpaySignature = null }) {
  const { secret } = requireKeys();
  if (!razorpayOrderId) throw svcError("razorpayOrderId is required", 400, "ORDER_ID_REQUIRED");

  // Ownership: a captain can only verify their own deposit.
  const deposit = await CashDeposit.findOne({ razorpayOrderId: String(razorpayOrderId), captain: toObjectId(captainId) });
  if (!deposit) throw svcError("Deposit not found", 404, "DEPOSIT_NOT_FOUND");

  if ([DEPOSIT_STATUS.APPROVED, DEPOSIT_STATUS.PARTIALLY_APPROVED].includes(deposit.status)) {
    return { deposit: serializeDeposit(deposit), settled: true };
  }

  if (razorpaySignature || razorpayPaymentId) {
    const ok =
      razorpayPaymentId &&
      razorpaySignature &&
      signaturesMatch(`${razorpayOrderId}|${razorpayPaymentId}`, String(razorpaySignature), secret);
    if (!ok) {
      await writeAudit({
        actorType: AUDIT_ACTOR.CAPTAIN,
        actorId: captainId,
        action: "RAZORPAY_SIGNATURE_REJECTED",
        entityType: "CashDeposit",
        entityId: deposit._id,
        captain: captainId,
        after: { razorpayOrderId, razorpayPaymentId },
      });
      throw svcError("Payment verification failed", 400, "INVALID_SIGNATURE");
    }
  }

  let items;
  try {
    const res = await getRazorpayClient().orders.fetchPayments(String(razorpayOrderId));
    items = Array.isArray(res?.items) ? res.items : [];
  } catch (error) {
    logger.error("razorpay deposit verify: lookup failed", {
      scope: "razorpayDeposit",
      depositId: deposit.depositId,
      error: error?.error?.description || error.message,
    });
    throw svcError("Could not confirm the payment with Razorpay. Please check again in a moment.", 502, "GATEWAY_UNAVAILABLE");
  }

  const expected = toPaise(deposit.amount);
  const exact = (p) => p.status === "captured" && Number(p.amount) === expected && String(p.currency || "INR").toUpperCase() === "INR";
  const paid = items.find((p) => exact(p) && (!razorpayPaymentId || p.id === razorpayPaymentId)) || items.find(exact);

  if (paid) {
    const result = await settleVerifiedPayment(deposit, paid, "CLIENT_VERIFY");
    return { deposit: serializeDeposit(result.deposit), settled: true, duplicate: !!result.duplicate };
  }

  const wrongAmount = items.find((p) => p.status === "captured");
  if (wrongAmount) {
    alertAdmins({
      title: "Deposit payment amount mismatch",
      message: `Deposit ${deposit.depositId} expected ₹${deposit.amount} but Razorpay captured ${wrongAmount.amount / 100} (${wrongAmount.id}).`,
      token: `deposit-mismatch:${wrongAmount.id}`,
    });
    throw svcError("Payment amount does not match this deposit. Support has been notified.", 409, "AMOUNT_MISMATCH");
  }

  const failed = items.find((p) => p.status === "failed");
  if (failed && !items.some((p) => ["authorized", "created"].includes(p.status))) {
    await markFailedAttempt(deposit, failed.id, failed.error_description || failed.error_reason);
  }
  const fresh = await CashDeposit.findById(deposit._id);
  return { deposit: serializeDeposit(fresh), settled: false };
}

/* ─────────────────────────────── webhook ─────────────────────────────── */

/**
 * Handles payment.captured / order.paid / payment.failed for a Razorpay
 * deposit order. The signature was verified by the caller. Idempotent.
 *
 * @returns {{ handled: boolean }} handled=false → not a deposit order.
 */
export async function processDepositPaymentEvent({ decoded, eventId = null }) {
  if (!decoded?.razorpayOrderId) return { handled: false };
  const deposit = await CashDeposit.findOne({ razorpayOrderId: decoded.razorpayOrderId });
  if (!deposit) return { handled: false };

  const payment = decoded.raw?.payload?.payment?.entity || null;
  if (decoded.kind === "ATTEMPT_FAILED") {
    const r = await markFailedAttempt(deposit, payment?.id, decoded.failureReason);
    return { handled: true, outcome: r.recorded ? "FAILED_RECORDED" : "FAILED_ALREADY_RECORDED" };
  }

  // CAPTURED (payment.captured / order.paid)
  if (!payment?.id) return { handled: true, outcome: "NO_PAYMENT_ENTITY" };
  const expected = toPaise(deposit.amount);
  if (
    payment.status !== "captured" ||
    Number(payment.amount) !== expected ||
    String(payment.currency || "INR").toUpperCase() !== "INR"
  ) {
    if (payment.status === "captured") {
      alertAdmins({
        title: "Deposit payment amount mismatch",
        message: `Deposit ${deposit.depositId} expected ₹${deposit.amount} but Razorpay captured ${payment.amount / 100} (${payment.id}).`,
        token: `deposit-mismatch:${payment.id}`,
      });
    }
    return { handled: true, outcome: "NOT_SETTLED" };
  }
  const result = await settleVerifiedPayment(deposit, payment, `WEBHOOK:${eventId || ""}`);
  return { handled: true, outcome: result.duplicate ? "DUPLICATE_PAYMENT" : "SETTLED" };
}
