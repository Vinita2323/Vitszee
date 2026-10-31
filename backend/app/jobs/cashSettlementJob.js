import Shift from "../models/shift.js";
import {
  AUDIT_ACTOR,
  SHIFT_STATUS,
  pendingReminderHours,
  shiftReminderHours,
} from "../constants/cashSettlement.js";
import { getShiftTotals } from "../services/cashSettlement/position.js";
import { writeAudit } from "../services/cashSettlement/audit.js";
import { notifyAdmins, notifyCaptain } from "../services/cashSettlement/notifier.js";
import logger from "../services/logger.js";

/**
 * Periodic cash-settlement housekeeping:
 *  - shift still running after N hours  → remind the captain to end it
 *  - closed shift with pending cash      → reminder every N hours
 *  - closed shift past its due time      → OVERDUE notice to captain + admin
 *
 * Every notification is gated by an atomic "notified" flag on the shift, so
 * running the job repeatedly (or on several instances) never double-sends.
 */
export async function runCashSettlementJob(now = new Date()) {
  const result = { shiftReminders: 0, pendingReminders: 0, overdue: 0 };

  // 1. Long-running shifts
  const longAgo = new Date(now.getTime() - shiftReminderHours() * 3600 * 1000);
  const longShifts = await Shift.find({
    status: SHIFT_STATUS.ACTIVE,
    startedAt: { $lt: longAgo },
    "notified.shiftReminderAt": null,
  }).lean();
  for (const s of longShifts) {
    const claimed = await Shift.findOneAndUpdate(
      { _id: s._id, "notified.shiftReminderAt": null },
      { $set: { "notified.shiftReminderAt": now } },
    );
    if (!claimed) continue;
    notifyCaptain(s.captain, {
      title: "Shift ending reminder",
      message: "Your shift has been running for a long time. End it and deposit any cash you hold.",
      token: `shift-reminder:${s._id}`,
    });
    result.shiftReminders += 1;
  }

  // 2 + 3. Closed shifts with pending cash
  const closed = await Shift.find({ status: SHIFT_STATUS.CLOSED, endedAt: { $ne: null } })
    .sort({ endedAt: -1 })
    .limit(2000)
    .lean();
  const reminderGap = new Date(now.getTime() - pendingReminderHours() * 3600 * 1000);
  for (const s of closed) {
    const totals = await getShiftTotals(s);
    if (totals.pendingCash <= 0) continue;

    if (s.dueAt && new Date(s.dueAt) < now) {
      const claimed = await Shift.findOneAndUpdate(
        { _id: s._id, "notified.overdueAt": null },
        { $set: { "notified.overdueAt": now } },
      );
      if (claimed) {
        notifyCaptain(s.captain, {
          title: "Cash settlement overdue",
          message: `₹${totals.pendingCash} from shift ${s.shiftId} is overdue. Deposit it now to keep receiving COD orders.`,
          token: `settlement-overdue:${s._id}`,
        });
        notifyAdmins({
          title: "Settlement overdue",
          message: `Shift ${s.shiftId}: ₹${totals.pendingCash} cash is overdue.`,
          token: `settlement-overdue-admin:${s._id}`,
        });
        await writeAudit({
          actorType: AUDIT_ACTOR.SYSTEM,
          action: "SETTLEMENT_MARKED_OVERDUE",
          entityType: "Shift",
          entityId: s._id,
          captain: s.captain,
          after: { shiftId: s.shiftId, pendingCash: totals.pendingCash, dueAt: s.dueAt },
        });
        result.overdue += 1;
      }
      continue;
    }

    const claimed = await Shift.findOneAndUpdate(
      {
        _id: s._id,
        $or: [{ "notified.pendingReminderAt": null }, { "notified.pendingReminderAt": { $lt: reminderGap } }],
      },
      { $set: { "notified.pendingReminderAt": now } },
    );
    if (claimed) {
      notifyCaptain(s.captain, {
        title: "Pending cash reminder",
        message: `₹${totals.pendingCash} from shift ${s.shiftId} is still pending deposit.`,
        token: `pending-reminder:${s._id}:${now.toISOString().slice(0, 13)}`,
      });
      result.pendingReminders += 1;
    }
  }
  return result;
}

export const getCashSettlementJobHandler = () => async () => {
  try {
    const res = await runCashSettlementJob();
    if (res.shiftReminders || res.pendingReminders || res.overdue) {
      logger.info("cashSettlementJob", { scope: "cashSettlementJob", ...res });
    }
  } catch (error) {
    logger.error("cashSettlementJob failed", { scope: "cashSettlementJob", error: error.message });
  }
};

export const getCashSettlementJobInterval = () =>
  Number.parseInt(process.env.CASH_SETTLEMENT_JOB_INTERVAL_MS || String(15 * 60 * 1000), 10);
