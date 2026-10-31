import crypto from "crypto";
import Shift from "../../models/shift.js";
import Order from "../../models/order.js";
import Delivery from "../../models/delivery.js";
import CashDeposit from "../../models/cashDeposit.js";
import CashDiscrepancy from "../../models/cashDiscrepancy.js";
import {
  AUDIT_ACTOR,
  DEPOSIT_STATUS,
  SHIFT_STATUS,
  settlementGraceHours,
  shiftRequiredForCod,
} from "../../constants/cashSettlement.js";
import { getCashPosition, getShiftTotals, deriveSettlementStatus, toObjectId } from "./position.js";
import { writeAudit } from "./audit.js";
import { notifyAdmins, notifyCaptain } from "./notifier.js";
import { getCaptainLimitState } from "./limitService.js";

function svcError(message, statusCode, code, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

const newShiftId = () =>
  `SHF-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

export async function getActiveShift(captainId) {
  return Shift.findOne({ captain: toObjectId(captainId), status: SHIFT_STATUS.ACTIVE });
}

/** Used before COD cash can be collected: cash must belong to a real active shift. */
export async function assertActiveShiftForCash(captainId) {
  if (!shiftRequiredForCod()) return null;
  const shift = await getActiveShift(captainId);
  if (!shift) {
    throw svcError(
      "Start your shift (My Account → My Shifts & Cash Settlement) before collecting COD cash.",
      409,
      "SHIFT_REQUIRED",
    );
  }
  return shift;
}

export async function startShift(captainId) {
  const captain = await Delivery.findById(captainId).select("name isActive isVerified").lean();
  if (!captain) throw svcError("Captain not found", 404, "CAPTAIN_NOT_FOUND");
  if (captain.isActive === false) throw svcError("Your account is not active", 403, "ACCOUNT_INACTIVE");

  let shift;
  try {
    shift = await Shift.create({
      shiftId: newShiftId(),
      captain: toObjectId(captainId),
      status: SHIFT_STATUS.ACTIVE,
      startedAt: new Date(), // server time
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw svcError("You already have an active shift", 409, "SHIFT_ALREADY_ACTIVE");
    }
    throw error;
  }
  await writeAudit({
    actorType: AUDIT_ACTOR.CAPTAIN,
    actorId: captainId,
    action: "SHIFT_STARTED",
    entityType: "Shift",
    entityId: shift._id,
    captain: captainId,
    after: { shiftId: shift.shiftId, startedAt: shift.startedAt },
  });
  notifyCaptain(captainId, {
    title: "Shift started",
    message: `Your shift ${shift.shiftId} has started. Cash you collect is tracked against it.`,
    token: `shift-started:${shift._id}`,
  });
  return shift;
}

export async function endShift(captainId) {
  const active = await getActiveShift(captainId);
  if (!active) throw svcError("You have no active shift", 409, "NO_ACTIVE_SHIFT");

  // Do not strand deliveries that are still in progress.
  const inProgress = await Order.countDocuments({
    deliveryBoy: toObjectId(captainId),
    status: { $nin: ["delivered", "cancelled"] },
    orderStatus: { $nin: ["delivered", "cancelled"] },
  });
  if (inProgress > 0) {
    throw svcError(
      `Finish your ${inProgress} active order${inProgress > 1 ? "s" : ""} before ending the shift`,
      409,
      "ACTIVE_ORDERS_PENDING",
      { activeOrders: inProgress },
    );
  }

  const endedAt = new Date(); // server time
  const dueAt = new Date(endedAt.getTime() + settlementGraceHours() * 3600 * 1000);
  const totals = await getShiftTotals(active);
  const position = await getCashPosition(captainId);

  const closed = await Shift.findOneAndUpdate(
    { _id: active._id, status: SHIFT_STATUS.ACTIVE },
    {
      $set: {
        status: SHIFT_STATUS.CLOSED,
        endedAt,
        dueAt,
        closingSummary: { ...totals, captainPendingCash: position.pendingCash, closedAt: endedAt },
      },
    },
    { new: true },
  );
  if (!closed) throw svcError("Shift was already ended", 409, "NO_ACTIVE_SHIFT");

  await writeAudit({
    actorType: AUDIT_ACTOR.CAPTAIN,
    actorId: captainId,
    action: "SHIFT_ENDED",
    entityType: "Shift",
    entityId: closed._id,
    captain: captainId,
    after: { shiftId: closed.shiftId, endedAt, dueAt, ...totals },
  });

  // Notifications (flags make sure each fires at most once per shift).
  const flagged = await Shift.findOneAndUpdate(
    { _id: closed._id, "notified.endedAdminAt": null },
    { $set: { "notified.endedAdminAt": new Date() } },
  );
  if (flagged) {
    notifyAdmins({
      title: "Captain ended shift",
      message: `Shift ${closed.shiftId} ended. Cash to be deposited: ₹${position.pendingCash}.`,
      token: `shift-ended-admin:${closed._id}`,
    });
  }
  if (position.pendingCash > 0) {
    const first = await Shift.findOneAndUpdate(
      { _id: closed._id, "notified.depositRequiredAt": null },
      { $set: { "notified.depositRequiredAt": new Date() } },
    );
    if (first) {
      notifyCaptain(captainId, {
        title: "Cash deposit required",
        message: `Please deposit ₹${position.pendingCash} by ${dueAt.toISOString()}.`,
        token: `deposit-required:${closed._id}`,
      });
    }
  }

  return buildSettlementSummary(closed);
}

/** Full End-of-shift settlement summary (backend-calculated). */
export async function buildSettlementSummary(shift) {
  const totals = await getShiftTotals(shift);
  const position = await getCashPosition(shift.captain);
  const awaiting = await CashDeposit.find({
    captain: shift.captain,
    status: DEPOSIT_STATUS.SUBMITTED,
  }).lean();
  const awaitingVerification = awaiting.reduce((s, d) => s + d.amount, 0);
  const depositedStatusInfo = await shiftSettlementState(shift, totals);
  return {
    shift: serializeShift(shift),
    totals,
    expectedCashDeposit: totals.expectedCash,
    pendingSettlementAmount: totals.pendingCash,
    captainPendingCash: position.pendingCash, // incl. carry-over from earlier shifts
    awaitingVerification,
    settlementStatus: depositedStatusInfo.status,
    dueAt: shift.dueAt,
  };
}

async function shiftSettlementState(shift, totals) {
  const [openDispute, lastDeposit] = await Promise.all([
    CashDiscrepancy.exists({ shift: shift._id, status: "OPEN", type: "DISPUTED_TRANSACTION" }),
    CashDeposit.findOne({ captain: shift.captain }).sort({ submittedAt: -1 }).select("status").lean(),
  ]);
  const hasOpenSubmission = await CashDeposit.exists({
    captain: shift.captain,
    status: DEPOSIT_STATUS.SUBMITTED,
  });
  return {
    status: deriveSettlementStatus({
      shift,
      pendingCash: totals.pendingCash,
      depositedCash: totals.previousDeposits,
      openDispute: !!openDispute,
      lastDepositRejected: lastDeposit?.status === DEPOSIT_STATUS.REJECTED && !hasOpenSubmission,
    }),
  };
}

export function serializeShift(shift) {
  return {
    id: String(shift._id),
    shiftId: shift.shiftId,
    status: shift.status,
    startedAt: shift.startedAt,
    endedAt: shift.endedAt,
    dueAt: shift.dueAt,
  };
}

/** Captain's "My Shifts & Cash Settlement" overview. */
export async function getCaptainOverview(captainId) {
  const active = await getActiveShift(captainId);
  const position = await getCashPosition(captainId);
  const limit = await getCaptainLimitState(captainId);
  const shifts = await Shift.find({ captain: toObjectId(captainId) })
    .sort({ startedAt: -1 })
    .limit(30);
  const history = [];
  for (const s of shifts) {
    const totals = await getShiftTotals(s);
    const { status } = await shiftSettlementState(s, totals);
    history.push({ ...serializeShift(s), totals, settlementStatus: status });
  }
  const deposits = await CashDeposit.find({ captain: toObjectId(captainId) })
    .sort({ submittedAt: -1 })
    .limit(30)
    .lean();
  return {
    currentShift: active ? { ...serializeShift(active), totals: await getShiftTotals(active) } : null,
    cash: {
      totalCollected: position.collectedCash,
      totalDeposited: position.depositedCash,
      outstanding: position.pendingCash,
      overdue: position.overduePending,
      cashOrders: position.cashOrders,
    },
    limit,
    shifts: history,
    deposits: deposits.map(serializeDeposit),
  };
}

export function serializeDeposit(d) {
  return {
    id: String(d._id),
    depositId: d.depositId,
    method: d.method,
    amount: d.amount,
    status: d.status,
    utr: d.utr,
    receiptNumber: d.receiptNumber,
    proofUrl: d.proofUrl,
    submittedAt: d.submittedAt,
    verifiedAmount: d.verifiedAmount,
    allocatedAmount: d.allocatedAmount,
    excessAmount: d.excessAmount,
    verifiedAt: d.verifiedAt,
    rejectionReason: d.rejectionReason,
    pendingAfter: d.pendingAfter,
  };
}
