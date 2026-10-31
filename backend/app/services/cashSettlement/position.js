import mongoose from "mongoose";
import Order from "../../models/order.js";
import CashCollection from "../../models/cashCollection.js";
import Shift from "../../models/shift.js";
import { roundCurrency } from "../../utils/money.js";
import {
  COLLECTION_METHOD,
  SETTLEMENT_STATUS,
  SHIFT_STATUS,
  settlementGraceHours,
} from "../../constants/cashSettlement.js";

export const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

const withSession = (q, session) => (session ? q.session(session) : q);

/**
 * Loads CASH collections (optionally scoped) with their *live* outstanding
 * amount. Outstanding is read from the order's existing COD fields
 * (`paymentBreakdown.codPendingAmount`) — the single source of truth the
 * rest of finance already maintains — so nothing here can drift from it.
 */
export async function loadCashCollections(filter, { session = null } = {}) {
  const cols = await withSession(
    CashCollection.find({ ...filter, countsTowardCash: true }).sort({ collectedAt: 1, _id: 1 }),
    session,
  ).lean();
  if (!cols.length) return [];
  const orders = await withSession(
    Order.find({ _id: { $in: cols.map((c) => c.order) } }).select("paymentBreakdown.codPendingAmount"),
    session,
  ).lean();
  const pendingByOrder = new Map(
    orders.map((o) => [String(o._id), roundCurrency(o.paymentBreakdown?.codPendingAmount || 0)]),
  );
  return cols.map((c) => ({
    ...c,
    pending: Math.max(0, pendingByOrder.get(String(c.order)) ?? 0),
  }));
}

/** Cash position of a captain across all shifts (carry-over included). */
export async function getCashPosition(captainId, { session = null, now = new Date() } = {}) {
  const collections = await loadCashCollections({ captain: toObjectId(captainId) }, { session });

  const shiftIds = [...new Set(collections.filter((c) => c.shift).map((c) => String(c.shift)))];
  const shifts = shiftIds.length
    ? await withSession(Shift.find({ _id: { $in: shiftIds } }).select("dueAt status"), session).lean()
    : [];
  const shiftById = new Map(shifts.map((s) => [String(s._id), s]));
  const graceMs = settlementGraceHours() * 3600 * 1000;

  let collected = 0;
  let pending = 0;
  let overduePending = 0;
  for (const c of collections) {
    collected = roundCurrency(collected + c.amount);
    pending = roundCurrency(pending + c.pending);
    if (c.pending > 0) {
      const dueAt = c.shift
        ? shiftById.get(String(c.shift))?.dueAt
        : new Date(new Date(c.collectedAt).getTime() + graceMs);
      if (dueAt && new Date(dueAt) < now) overduePending = roundCurrency(overduePending + c.pending);
    }
  }
  return {
    collections,
    cashOrders: collections.length,
    collectedCash: collected,
    pendingCash: pending,
    depositedCash: roundCurrency(collected - pending),
    overduePending,
  };
}

/** Totals for one shift (all payment methods). Live — never trusts a stored snapshot. */
export async function getShiftTotals(shiftDoc, { session = null } = {}) {
  const rows = await withSession(CashCollection.find({ shift: shiftDoc._id }), session).lean();
  const cash = rows.filter((r) => r.countsTowardCash);
  let pending = 0;
  if (cash.length) {
    const orders = await withSession(
      Order.find({ _id: { $in: cash.map((r) => r.order) } }).select("paymentBreakdown.codPendingAmount"),
      session,
    ).lean();
    pending = roundCurrency(
      orders.reduce((s, o) => s + Math.max(0, Number(o.paymentBreakdown?.codPendingAmount || 0)), 0),
    );
  }
  const sum = (arr) => roundCurrency(arr.reduce((s, r) => s + r.amount, 0));
  const collectedCash = sum(cash);
  return {
    completedOrders: rows.length,
    cashOrders: cash.length,
    totalCashCollected: collectedCash,
    totalOnlineQr: sum(rows.filter((r) => r.paymentMethod === COLLECTION_METHOD.RAZORPAY_QR)),
    totalOnlinePrepaid: sum(rows.filter((r) => r.paymentMethod === COLLECTION_METHOD.ONLINE_PREPAID)),
    totalOnlinePayments: sum(rows.filter((r) => !r.countsTowardCash)),
    previousDeposits: roundCurrency(collectedCash - pending),
    expectedCash: pending, // = collected cash - verified deposits allocated to those collections
    pendingCash: pending,
  };
}

export function deriveSettlementStatus({
  shift,
  pendingCash,
  depositedCash,
  openDispute = false,
  lastDepositRejected = false,
  now = new Date(),
}) {
  if (shift?.status === SHIFT_STATUS.ACTIVE) return SETTLEMENT_STATUS.ACTIVE;
  if (openDispute) return SETTLEMENT_STATUS.DISPUTED;
  if (pendingCash <= 0) return SETTLEMENT_STATUS.SETTLED;
  if (shift?.dueAt && new Date(shift.dueAt) < now) return SETTLEMENT_STATUS.OVERDUE;
  if (lastDepositRejected) return SETTLEMENT_STATUS.REJECTED;
  if (depositedCash > 0) return SETTLEMENT_STATUS.PARTIALLY_SETTLED;
  return SETTLEMENT_STATUS.PENDING;
}
