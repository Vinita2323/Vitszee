import Order from "../../models/order.js";
import Shift from "../../models/shift.js";
import Delivery from "../../models/delivery.js";
import CashCollection from "../../models/cashCollection.js";
import CashDeposit from "../../models/cashDeposit.js";
import CashDiscrepancy from "../../models/cashDiscrepancy.js";
import CashSettlementAudit from "../../models/cashSettlementAudit.js";
import {
  DEPOSIT_STATUS,
  SETTLEMENT_STATUS,
} from "../../constants/cashSettlement.js";
import { roundCurrency } from "../../utils/money.js";
import { deriveSettlementStatus, getShiftTotals, loadCashCollections } from "./position.js";
import { serializeDeposit, serializeShift } from "./shiftService.js";
import mongoose from "mongoose";

function svcError(message, statusCode, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

/** One row per (shift | carry-over bucket) per captain, computed from live order data. */
async function aggregateRows(match = {}) {
  const grouped = await CashCollection.aggregate([
    { $match: { countsTowardCash: true, ...match } },
    {
      $lookup: {
        from: Order.collection.name,
        localField: "order",
        foreignField: "_id",
        as: "o",
        pipeline: [{ $project: { p: "$paymentBreakdown.codPendingAmount" } }],
      },
    },
    { $unwind: "$o" },
    {
      $group: {
        _id: { shift: "$shift", captain: "$captain" },
        collected: { $sum: "$amount" },
        pending: { $sum: { $max: [0, "$o.p"] } },
        orders: { $sum: 1 },
        lastCollectedAt: { $max: "$collectedAt" },
      },
    },
  ]);
  if (!grouped.length) return [];

  const shiftIds = grouped.map((g) => g._id.shift).filter(Boolean);
  const captainIds = [...new Set(grouped.map((g) => String(g._id.captain)))];
  const [shifts, captains, disputes, deposits] = await Promise.all([
    Shift.find({ _id: { $in: shiftIds } }).lean(),
    Delivery.find({ _id: { $in: captainIds } }).select("name phone").lean(),
    CashDiscrepancy.find({ status: "OPEN", type: "DISPUTED_TRANSACTION", shift: { $in: shiftIds } })
      .select("shift")
      .lean(),
    CashDeposit.find({ captain: { $in: captainIds } }).sort({ submittedAt: -1 }).select("captain status method").lean(),
  ]);
  const shiftById = new Map(shifts.map((s) => [String(s._id), s]));
  const captainById = new Map(captains.map((c) => [String(c._id), c]));
  const disputed = new Set(disputes.map((d) => String(d.shift)));
  const lastDepositByCaptain = new Map();
  const openSubmission = new Set();
  for (const d of deposits) {
    if (!lastDepositByCaptain.has(String(d.captain))) lastDepositByCaptain.set(String(d.captain), d);
    if (d.status === DEPOSIT_STATUS.SUBMITTED) openSubmission.add(String(d.captain));
  }

  const now = new Date();
  return grouped.map((g) => {
    const shift = g._id.shift ? shiftById.get(String(g._id.shift)) : null;
    const captain = captainById.get(String(g._id.captain));
    const collected = roundCurrency(g.collected);
    const pending = roundCurrency(g.pending);
    const deposited = roundCurrency(collected - pending);
    const last = lastDepositByCaptain.get(String(g._id.captain));
    const graceShift = shift || {
      status: "CLOSED",
      dueAt: new Date(new Date(g.lastCollectedAt).getTime() + 24 * 3600 * 1000),
    };
    const status = deriveSettlementStatus({
      shift: graceShift,
      pendingCash: pending,
      depositedCash: deposited,
      openDispute: shift ? disputed.has(String(shift._id)) : false,
      lastDepositRejected: last?.status === DEPOSIT_STATUS.REJECTED && !openSubmission.has(String(g._id.captain)),
      now,
    });
    return {
      shiftDbId: shift ? String(shift._id) : null,
      shiftId: shift?.shiftId || "CARRY-OVER",
      captainId: String(g._id.captain),
      captainName: captain?.name || "Unknown",
      captainPhone: captain?.phone || "",
      shiftDate: shift?.startedAt || g.lastCollectedAt,
      shiftStatus: shift?.status || "CLOSED",
      dueAt: shift?.dueAt || null,
      cashOrders: g.orders,
      expectedCash: collected,
      depositedCash: deposited,
      pendingCash: pending,
      settlementStatus: status,
      awaitingVerification: openSubmission.has(String(g._id.captain)),
      depositMethod: last?.method || null,
    };
  });
}

export async function getDashboard() {
  const rows = await aggregateRows();
  const sum = (arr, k) => roundCurrency(arr.reduce((s, r) => s + r[k], 0));
  const [openDiscrepancies, awaiting] = await Promise.all([
    CashDiscrepancy.find({ status: "OPEN" }).select("amount").lean(),
    CashDeposit.countDocuments({ status: DEPOSIT_STATUS.SUBMITTED }),
  ]);
  const overdue = rows.filter((r) => r.settlementStatus === SETTLEMENT_STATUS.OVERDUE);
  return {
    totalCashCollected: sum(rows, "expectedCash"),
    totalCashDeposited: sum(rows, "depositedCash"),
    totalPendingCash: sum(rows, "pendingCash"),
    partialSettlements: rows.filter((r) => r.settlementStatus === SETTLEMENT_STATUS.PARTIALLY_SETTLED).length,
    overdueSettlements: overdue.length,
    overdueAmount: sum(overdue, "pendingCash"),
    cashDiscrepancies: openDiscrepancies.length,
    cashDiscrepancyAmount: roundCurrency(openDiscrepancies.reduce((s, d) => s + (d.amount || 0), 0)),
    depositsAwaitingVerification: awaiting,
  };
}

export async function listSettlements({ status = null, captainId = null, from = null, to = null, page = 1, limit = 20 } = {}) {
  const match = captainId ? { captain: new mongoose.Types.ObjectId(String(captainId)) } : {};
  let rows = await aggregateRows(match);
  if (status) rows = rows.filter((r) => r.settlementStatus === status);
  if (from) rows = rows.filter((r) => new Date(r.shiftDate) >= new Date(from));
  if (to) rows = rows.filter((r) => new Date(r.shiftDate) <= new Date(to));
  rows.sort((a, b) => new Date(b.shiftDate) - new Date(a.shiftDate));
  const total = rows.length;
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  return { rows: rows.slice((p - 1) * l, p * l), total, page: p, limit: l };
}

export async function getSettlementDetail(idOrShiftId) {
  const isOid = mongoose.Types.ObjectId.isValid(String(idOrShiftId));
  const shift = await Shift.findOne(isOid ? { $or: [{ _id: idOrShiftId }, { shiftId: idOrShiftId }] } : { shiftId: idOrShiftId });
  if (!shift) throw svcError("Shift not found", 404, "SHIFT_NOT_FOUND");
  const [captain, totals, collections, deposits, discrepancies, audit] = await Promise.all([
    Delivery.findById(shift.captain).select("name phone").lean(),
    getShiftTotals(shift),
    CashCollection.find({ shift: shift._id }).sort({ collectedAt: 1 }).lean(),
    CashDeposit.find({ captain: shift.captain }).sort({ submittedAt: -1 }).limit(50).lean(),
    CashDiscrepancy.find({ captain: shift.captain }).sort({ createdAt: -1 }).limit(50).lean(),
    CashSettlementAudit.find({ captain: shift.captain }).sort({ at: -1 }).limit(100).lean(),
  ]);
  const cash = await loadCashCollections({ shift: shift._id });
  const pendingByOrder = new Map(cash.map((c) => [String(c.order), c.pending]));
  const rows = await aggregateRows({ shift: shift._id });
  return {
    shift: serializeShift(shift),
    captain,
    totals,
    settlementStatus: rows[0]?.settlementStatus || SETTLEMENT_STATUS.SETTLED,
    collections: collections.map((c) => ({
      orderId: c.orderId,
      amount: c.amount,
      paymentMethod: c.paymentMethod,
      countsTowardCash: c.countsTowardCash,
      collectedAt: c.collectedAt,
      reference: c.reference,
      pending: c.countsTowardCash ? pendingByOrder.get(String(c.order)) ?? 0 : 0,
    })),
    deposits: deposits.map(serializeDeposit),
    discrepancies,
    audit,
  };
}

export async function listDeposits({ status = null, page = 1, limit = 20 } = {}) {
  const query = status ? { status } : {};
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const [items, total] = await Promise.all([
    CashDeposit.find(query).populate("captain", "name phone").sort({ submittedAt: -1 }).skip((p - 1) * l).limit(l).lean(),
    CashDeposit.countDocuments(query),
  ]);
  return {
    total,
    page: p,
    limit: l,
    items: items.map((d) => ({ ...serializeDeposit(d), captain: d.captain, adminNote: d.adminNote, adjustmentReason: d.adjustmentReason, receivedBy: d.receivedBy })),
  };
}

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function exportSettlementsCsv(filters = {}) {
  const { rows } = await listSettlements({ ...filters, page: 1, limit: 100000 });
  const header = [
    "Captain", "Captain ID", "Shift ID", "Shift Date", "Cash Orders", "Expected Cash",
    "Deposited Cash", "Pending Cash", "Settlement Status", "Deposit Method",
  ];
  const lines = rows.map((r) =>
    [
      r.captainName, r.captainId, r.shiftId, new Date(r.shiftDate).toISOString(), r.cashOrders,
      r.expectedCash, r.depositedCash, r.pendingCash, r.settlementStatus, r.depositMethod || "",
    ].map(csvCell).join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
