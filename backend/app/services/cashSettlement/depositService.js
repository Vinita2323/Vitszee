import crypto from "crypto";
import mongoose from "mongoose";
import CashDeposit from "../../models/cashDeposit.js";
import CashDiscrepancy from "../../models/cashDiscrepancy.js";
import Shift from "../../models/shift.js";
import Transaction from "../../models/transaction.js";
import {
  AUDIT_ACTOR,
  DEPOSIT_METHOD,
  DEPOSIT_STATUS,
  DISCREPANCY_TYPE,
} from "../../constants/cashSettlement.js";
import { roundCurrency } from "../../utils/money.js";
import { reconcileCodCash } from "../finance/orderFinanceService.js";
import { getCashPosition, toObjectId } from "./position.js";
import { writeAudit } from "./audit.js";
import { notifyAdmins, notifyCaptain } from "./notifier.js";
import { checkAndNotifyLimits } from "./limitService.js";

function svcError(message, statusCode, code, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

const newDepositId = () =>
  `DEP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

const UTR_RE = /^[A-Z0-9]{6,30}$/;
const RECEIPT_RE = /^[A-Z0-9][A-Z0-9\-/]{2,39}$/;
const MAX_DEPOSIT = 1_000_000;

/* ───────────────────────────── captain: submit ───────────────────────────── */

/**
 * Captain asks to hand in cash. Nothing is settled here — the deposit waits
 * for an admin to verify it (a screenshot alone never settles cash).
 */
export async function submitDeposit({
  captainId,
  method,
  amount,
  utr = null,
  proofUrl = null,
  receiptNumber = null,
  receivedBy = null,
  depositedAt = null,
  idempotencyKey = null,
}) {
  if (![DEPOSIT_METHOD.BANK_UPI, DEPOSIT_METHOD.PHYSICAL_CASH].includes(method)) {
    throw svcError("Choose bank/UPI transfer or physical cash deposit", 400, "INVALID_METHOD");
  }
  const claimed = roundCurrency(Number(amount));
  if (!Number.isFinite(claimed) || claimed <= 0 || claimed > MAX_DEPOSIT) {
    throw svcError("Enter a valid deposit amount", 400, "INVALID_AMOUNT");
  }

  let utrKey;
  let receiptKey;
  if (method === DEPOSIT_METHOD.BANK_UPI) {
    utrKey = String(utr || "").trim().toUpperCase();
    if (!UTR_RE.test(utrKey)) {
      throw svcError("Enter a valid UTR / transaction reference (6-30 letters or digits)", 400, "INVALID_UTR");
    }
    if (!/^https?:\/\//i.test(String(proofUrl || ""))) {
      throw svcError("Upload the payment screenshot or receipt", 400, "PROOF_REQUIRED");
    }
  } else {
    receiptKey = String(receiptNumber || "").trim().toUpperCase();
    if (!RECEIPT_RE.test(receiptKey)) {
      throw svcError("Enter the office cash receipt number", 400, "INVALID_RECEIPT");
    }
    if (!String(receivedBy || "").trim()) {
      throw svcError("Enter the receiving employee / admin ID", 400, "RECEIVER_REQUIRED");
    }
  }

  let claimedDepositedAt = null;
  if (depositedAt) {
    claimedDepositedAt = new Date(depositedAt);
    if (Number.isNaN(claimedDepositedAt.getTime())) {
      throw svcError("Invalid deposit time", 400, "INVALID_DEPOSIT_TIME");
    }
  }

  const captainOid = toObjectId(captainId);
  if (idempotencyKey) {
    const existing = await CashDeposit.findOne({ captain: captainOid, idempotencyKey: String(idempotencyKey) });
    if (existing) return { deposit: existing, duplicate: true };
  }

  const position = await getCashPosition(captainId);
  if (position.pendingCash <= 0) {
    throw svcError("You have no pending cash to deposit", 400, "NOTHING_TO_DEPOSIT");
  }

  const lastShift = await Shift.findOne({ captain: captainOid }).sort({ startedAt: -1 }).select("_id");

  let deposit;
  try {
    deposit = await CashDeposit.create({
      depositId: newDepositId(),
      captain: captainOid,
      shift: lastShift?._id || null,
      method,
      amount: claimed,
      idempotencyKey: idempotencyKey ? String(idempotencyKey) : undefined,
      utr: utrKey || null,
      utrKey,
      proofUrl: proofUrl || null,
      receiptNumber: receiptKey || null,
      receiptKey,
      receivedBy: receivedBy ? String(receivedBy).trim() : null,
      depositedAt: claimedDepositedAt,
      status: DEPOSIT_STATUS.SUBMITTED,
      submittedAt: new Date(), // server time
      pendingBefore: position.pendingCash,
    });
  } catch (error) {
    if (error?.code === 11000) {
      const field = Object.keys(error.keyPattern || error.keyValue || {})[0] || "";
      if (field === "idempotencyKey" || field === "captain") {
        const existing = await CashDeposit.findOne({ captain: captainOid, idempotencyKey: String(idempotencyKey) });
        if (existing) return { deposit: existing, duplicate: true };
      }
      throw svcError(
        "This deposit reference has already been used. Duplicate deposits are not accepted.",
        409,
        "DUPLICATE_REFERENCE",
      );
    }
    throw error;
  }

  await writeAudit({
    actorType: AUDIT_ACTOR.CAPTAIN,
    actorId: captainId,
    action: "DEPOSIT_SUBMITTED",
    entityType: "CashDeposit",
    entityId: deposit._id,
    captain: captainId,
    after: { depositId: deposit.depositId, method, amount: claimed, pendingBefore: position.pendingCash },
  });
  notifyAdmins({
    title: "New cash deposit submitted",
    message: `A captain submitted a ${method === DEPOSIT_METHOD.BANK_UPI ? "bank/UPI" : "physical cash"} deposit of ₹${claimed}. Verification needed.`,
    token: `deposit-submitted:${deposit._id}`,
  });
  if (claimed < position.pendingCash) {
    notifyAdmins({
      title: "Cash settlement pending",
      message: `Deposit ${deposit.depositId} (₹${claimed}) is less than the expected ₹${position.pendingCash}.`,
      token: `deposit-short:${deposit._id}`,
    });
  }
  return { deposit, duplicate: false };
}

/* ───────────────────────────── admin: approve ───────────────────────────── */

/**
 * Verifies a deposit and applies it to the captain's oldest unsettled cash
 * orders in ONE transaction (existing `reconcileCodCash` for every order,
 * plus the deposit, discrepancy and audit rows). A verified amount smaller
 * than the claim, or smaller than the pending cash, leaves the remainder
 * outstanding — nothing is cleared without verified money.
 */
export async function approveDeposit({ depositId, adminId, verifiedAmount = null, note = null }) {
  const claimedDeposit = await CashDeposit.findOneAndUpdate(
    { _id: depositId, status: DEPOSIT_STATUS.SUBMITTED },
    { $set: { status: DEPOSIT_STATUS.APPROVING, verifiedBy: adminId } },
    { new: true },
  );
  if (!claimedDeposit) {
    const existing = await CashDeposit.findById(depositId).select("status");
    if (!existing) throw svcError("Deposit not found", 404, "DEPOSIT_NOT_FOUND");
    throw svcError(`Deposit is already ${existing.status}`, 409, "DEPOSIT_ALREADY_PROCESSED");
  }

  const revert = () =>
    CashDeposit.updateOne(
      { _id: claimedDeposit._id, status: DEPOSIT_STATUS.APPROVING },
      { $set: { status: DEPOSIT_STATUS.SUBMITTED, verifiedBy: null } },
    );

  const claimed = claimedDeposit.amount;
  const verified = verifiedAmount == null || verifiedAmount === "" ? claimed : roundCurrency(Number(verifiedAmount));
  if (!Number.isFinite(verified) || verified <= 0 || verified > claimed) {
    await revert();
    throw svcError(
      `Verified amount must be between ₹0.01 and the claimed ₹${claimed}`,
      400,
      "INVALID_VERIFIED_AMOUNT",
    );
  }

  const session = await mongoose.startSession();
  let outcome;
  try {
    await session.withTransaction(async () => {
      const before = await getCashPosition(claimedDeposit.captain, { session });
      let remaining = verified;
      const allocations = [];
      for (const col of before.collections) {
        if (remaining <= 0) break;
        if (col.pending <= 0) continue;
        const amt = roundCurrency(Math.min(col.pending, remaining));
        await reconcileCodCash(col.order, amt, claimedDeposit.captain, {
          actorId: adminId,
          session,
          metadata: {
            source: "cash_settlement_deposit",
            depositId: claimedDeposit.depositId,
            method: claimedDeposit.method,
          },
        });
        allocations.push({ collection: col._id, order: col.order, orderId: col.orderId, amount: amt });
        remaining = roundCurrency(remaining - amt);
      }
      const allocated = roundCurrency(verified - remaining);
      const excess = remaining;
      const pendingAfter = roundCurrency(before.pendingCash - allocated);
      const status = verified < claimed ? DEPOSIT_STATUS.PARTIALLY_APPROVED : DEPOSIT_STATUS.APPROVED;

      const updated = await CashDeposit.findOneAndUpdate(
        { _id: claimedDeposit._id, status: DEPOSIT_STATUS.APPROVING },
        {
          $set: {
            status,
            verifiedAmount: verified,
            allocatedAmount: allocated,
            excessAmount: excess,
            allocations,
            pendingBefore: before.pendingCash,
            pendingAfter,
            verifiedBy: adminId,
            verifiedAt: new Date(),
            adminNote: note || null,
          },
        },
        { new: true, session },
      );
      if (!updated) throw svcError("Deposit changed during approval", 409, "DEPOSIT_ALREADY_PROCESSED");

      if (allocated > 0) {
        // Keep the legacy admin "cash settlement" history in step.
        await Transaction.create(
          [
            {
              user: claimedDeposit.captain,
              userModel: "Delivery",
              type: "Cash Settlement",
              amount: -Math.abs(allocated),
              status: "Settled",
              reference: `CSH-DEP-${claimedDeposit.depositId}`,
              meta: { source: "cash_settlement_deposit", depositId: claimedDeposit.depositId, orders: allocations.map((a) => a.orderId) },
            },
          ],
          { session },
        );
      }
      if (excess > 0) {
        await CashDiscrepancy.create(
          [
            {
              captain: claimedDeposit.captain,
              shift: claimedDeposit.shift,
              deposit: claimedDeposit._id,
              type: DISCREPANCY_TYPE.EXCESS_DEPOSIT,
              amount: excess,
              note: `Verified ₹${verified} but only ₹${allocated} was outstanding`,
            },
          ],
          { session },
        );
      }
      if (verified < claimed) {
        await CashDiscrepancy.create(
          [
            {
              captain: claimedDeposit.captain,
              shift: claimedDeposit.shift,
              deposit: claimedDeposit._id,
              type: DISCREPANCY_TYPE.VERIFIED_LESS_THAN_CLAIMED,
              amount: roundCurrency(claimed - verified),
              note: note || `Captain claimed ₹${claimed}, admin verified ₹${verified}`,
            },
          ],
          { session },
        );
      }
      await writeAudit(
        {
          actorType: AUDIT_ACTOR.ADMIN,
          actorId: adminId,
          action: status === DEPOSIT_STATUS.APPROVED ? "DEPOSIT_APPROVED" : "DEPOSIT_PARTIALLY_APPROVED",
          entityType: "CashDeposit",
          entityId: claimedDeposit._id,
          captain: claimedDeposit.captain,
          reason: note || null,
          before: { status: DEPOSIT_STATUS.SUBMITTED, pendingCash: before.pendingCash },
          after: { status, claimed, verified, allocated, excess, pendingAfter, allocations: allocations.length },
        },
        { session },
      );
      outcome = { deposit: updated, allocated, excess, pendingAfter, status };
    });
  } catch (error) {
    await revert();
    throw error;
  } finally {
    await session.endSession();
  }

  notifyCaptain(claimedDeposit.captain, {
    title: "Settlement approved",
    message:
      outcome.pendingAfter > 0
        ? `₹${outcome.allocated} verified. ₹${outcome.pendingAfter} is still pending — please deposit the remainder.`
        : `₹${outcome.allocated} verified. Your cash is fully settled.`,
    token: `deposit-approved:${claimedDeposit._id}`,
  });
  if (outcome.pendingAfter > 0 || outcome.excess > 0 || verified < claimed) {
    notifyAdmins({
      title: "Deposit discrepancy detected",
      message: `Deposit ${claimedDeposit.depositId}: claimed ₹${claimed}, verified ₹${verified}, still pending ₹${outcome.pendingAfter}.`,
      token: `deposit-discrepancy:${claimedDeposit._id}`,
    });
  }
  checkAndNotifyLimits(claimedDeposit.captain).catch(() => {});
  return outcome;
}

/* ───────────────────────────── admin: reject ───────────────────────────── */

export async function rejectDeposit({ depositId, adminId, reason, discrepancyType = null }) {
  const trimmed = String(reason || "").trim();
  if (trimmed.length < 3) throw svcError("A rejection reason is required", 400, "REASON_REQUIRED");

  const rejected = await CashDeposit.findOneAndUpdate(
    { _id: depositId, status: DEPOSIT_STATUS.SUBMITTED },
    {
      $set: {
        status: DEPOSIT_STATUS.REJECTED,
        rejectionReason: trimmed,
        verifiedBy: adminId,
        verifiedAt: new Date(),
        verifiedAmount: 0,
        allocatedAmount: 0,
      },
      // Free the UTR / receipt so the captain can resubmit with correct proof.
      $unset: { utrKey: "", receiptKey: "" },
    },
    { new: true },
  );
  if (!rejected) {
    const existing = await CashDeposit.findById(depositId).select("status");
    if (!existing) throw svcError("Deposit not found", 404, "DEPOSIT_NOT_FOUND");
    throw svcError(`Deposit is already ${existing.status}`, 409, "DEPOSIT_ALREADY_PROCESSED");
  }

  if (discrepancyType && Object.values(DISCREPANCY_TYPE).includes(discrepancyType)) {
    await CashDiscrepancy.create({
      captain: rejected.captain,
      shift: rejected.shift,
      deposit: rejected._id,
      type: discrepancyType,
      amount: rejected.amount,
      note: trimmed,
      createdBy: adminId,
    });
  }
  await writeAudit({
    actorType: AUDIT_ACTOR.ADMIN,
    actorId: adminId,
    action: "DEPOSIT_REJECTED",
    entityType: "CashDeposit",
    entityId: rejected._id,
    captain: rejected.captain,
    reason: trimmed,
    before: { status: DEPOSIT_STATUS.SUBMITTED },
    after: { status: DEPOSIT_STATUS.REJECTED, amount: rejected.amount },
  });
  notifyCaptain(rejected.captain, {
    title: "Settlement rejected",
    message: `Your deposit of ₹${rejected.amount} was rejected: ${trimmed}. The cash is still pending.`,
    token: `deposit-rejected:${rejected._id}`,
  });
  return rejected;
}

/* ─────────────────── admin: discrepancy + documented adjustment ─────────────────── */

export async function recordDiscrepancy({ adminId, captainId, shiftId = null, depositId = null, type, amount = 0, note }) {
  if (!Object.values(DISCREPANCY_TYPE).includes(type)) {
    throw svcError("Invalid discrepancy type", 400, "INVALID_TYPE");
  }
  if (!String(note || "").trim()) throw svcError("A note is required", 400, "NOTE_REQUIRED");
  const row = await CashDiscrepancy.create({
    captain: toObjectId(captainId),
    shift: shiftId ? toObjectId(shiftId) : null,
    deposit: depositId ? toObjectId(depositId) : null,
    type,
    amount: roundCurrency(Number(amount) || 0),
    note: String(note).trim(),
    createdBy: adminId,
  });
  await writeAudit({
    actorType: AUDIT_ACTOR.ADMIN,
    actorId: adminId,
    action: "DISCREPANCY_RECORDED",
    entityType: "CashDiscrepancy",
    entityId: row._id,
    captain: captainId,
    reason: row.note,
    after: { type, amount: row.amount },
  });
  notifyCaptain(captainId, {
    title: type === DISCREPANCY_TYPE.DISPUTED_TRANSACTION ? "Cash settlement disputed" : "Cash discrepancy recorded",
    message: row.note,
    token: `discrepancy:${row._id}`,
  });
  return row;
}

export async function resolveDiscrepancy({ discrepancyId, adminId, resolutionNote }) {
  if (!String(resolutionNote || "").trim()) throw svcError("A resolution note is required", 400, "NOTE_REQUIRED");
  const row = await CashDiscrepancy.findOneAndUpdate(
    { _id: discrepancyId, status: "OPEN" },
    { $set: { status: "RESOLVED", resolvedBy: adminId, resolvedAt: new Date(), resolutionNote: String(resolutionNote).trim() } },
    { new: true },
  );
  if (!row) throw svcError("Open discrepancy not found", 404, "DISCREPANCY_NOT_FOUND");
  await writeAudit({
    actorType: AUDIT_ACTOR.ADMIN,
    actorId: adminId,
    action: "DISCREPANCY_RESOLVED",
    entityType: "CashDiscrepancy",
    entityId: row._id,
    captain: row.captain,
    reason: row.resolutionNote,
  });
  return row;
}

/**
 * Authorised, documented adjustment (e.g. verified missing-cash write-off or a
 * cash handed over outside the app). Goes through the exact same allocation
 * path as a deposit, so the books stay consistent; reason is mandatory.
 */
export async function createAdjustment({ adminId, captainId, amount, reason }) {
  const trimmed = String(reason || "").trim();
  if (trimmed.length < 10) {
    throw svcError("An adjustment needs a documented reason (min 10 characters)", 400, "REASON_REQUIRED");
  }
  const value = roundCurrency(Number(amount));
  if (!Number.isFinite(value) || value <= 0 || value > MAX_DEPOSIT) {
    throw svcError("Enter a valid adjustment amount", 400, "INVALID_AMOUNT");
  }
  const deposit = await CashDeposit.create({
    depositId: newDepositId(),
    captain: toObjectId(captainId),
    method: DEPOSIT_METHOD.ADMIN_ADJUSTMENT,
    amount: value,
    status: DEPOSIT_STATUS.SUBMITTED,
    submittedAt: new Date(),
    adjustmentReason: trimmed,
  });
  await writeAudit({
    actorType: AUDIT_ACTOR.ADMIN,
    actorId: adminId,
    action: "CASH_ADJUSTMENT_CREATED",
    entityType: "CashDeposit",
    entityId: deposit._id,
    captain: captainId,
    reason: trimmed,
    after: { amount: value },
  });
  return approveDeposit({ depositId: deposit._id, adminId, verifiedAmount: value, note: `ADJUSTMENT: ${trimmed}` });
}
