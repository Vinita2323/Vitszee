import CashLimitOverride from "../../models/cashLimitOverride.js";
import { cashHoldingLimit, cashWarnRatio, AUDIT_ACTOR } from "../../constants/cashSettlement.js";
import { getCashPosition, toObjectId } from "./position.js";
import { writeAudit } from "./audit.js";
import { notifyAdmins, notifyCaptain } from "./notifier.js";

function svcError(message, statusCode, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

export async function getActiveOverride(captainId, now = new Date()) {
  return CashLimitOverride.findOne({
    captain: toObjectId(captainId),
    revokedAt: null,
    expiresAt: { $gt: now },
  })
    .sort({ expiresAt: -1 })
    .lean();
}

/** Where a captain stands against the cash holding limit. */
export async function getCaptainLimitState(captainId, { now = new Date() } = {}) {
  const limit = cashHoldingLimit();
  const position = await getCashPosition(captainId, { now });
  const override = await getActiveOverride(captainId, now);
  const overLimit = position.pendingCash > limit;
  return {
    limit,
    pendingCash: position.pendingCash,
    overduePending: position.overduePending,
    nearLimit: !overLimit && position.pendingCash >= limit * cashWarnRatio(),
    overLimit,
    // Block NEW COD assignments only when overdue cash exceeds the limit.
    blocked: position.overduePending > limit && !override,
    override: override
      ? { expiresAt: override.expiresAt, reason: override.reason }
      : null,
  };
}

/** Throws 403 CASH_LIMIT_EXCEEDED when the captain must not take new COD orders. */
export async function assertCodAssignmentAllowed(captainId) {
  const state = await getCaptainLimitState(captainId);
  if (state.blocked) {
    throw svcError(
      `You have ₹${state.overduePending} of overdue cash (limit ₹${state.limit}). Deposit it to receive new COD orders.`,
      403,
      "CASH_LIMIT_EXCEEDED",
    );
  }
  return state;
}

/**
 * Sends the "approaching" / "exceeded" notices. De-duplicated per captain per
 * day via the notification token; safe to call after every collection/deposit.
 */
export async function checkAndNotifyLimits(captainId, { now = new Date() } = {}) {
  const state = await getCaptainLimitState(captainId, { now });
  const day = now.toISOString().slice(0, 10);
  if (state.overLimit) {
    notifyCaptain(captainId, {
      title: "Cash holding limit exceeded",
      message: `You are holding ₹${state.pendingCash} of cash (limit ₹${state.limit}). Please deposit it.`,
      token: `cash-limit-exceeded:${captainId}:${day}`,
    });
    notifyAdmins({
      title: "Captain exceeded cash holding limit",
      message: `A captain is holding ₹${state.pendingCash} (limit ₹${state.limit}).`,
      token: `cash-limit-exceeded-admin:${captainId}:${day}`,
    });
  } else if (state.nearLimit) {
    notifyCaptain(captainId, {
      title: "Cash limit approaching",
      message: `You are holding ₹${state.pendingCash} of your ₹${state.limit} cash limit. Plan a deposit soon.`,
      token: `cash-limit-near:${captainId}:${day}`,
    });
  }
  return state;
}

/** Admin override: a documented, time-boxed exception. Reason is mandatory. */
export async function grantLimitOverride({ captainId, adminId, hours = 24, reason }) {
  const trimmed = String(reason || "").trim();
  if (trimmed.length < 5) {
    throw svcError("A reason (min 5 characters) is required for an override", 400, "REASON_REQUIRED");
  }
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0 || h > 24 * 14) {
    throw svcError("Override duration must be between 1 hour and 14 days", 400, "INVALID_DURATION");
  }
  const expiresAt = new Date(Date.now() + h * 3600 * 1000);
  const row = await CashLimitOverride.create({
    captain: toObjectId(captainId),
    reason: trimmed,
    grantedBy: adminId,
    expiresAt,
  });
  await writeAudit({
    actorType: AUDIT_ACTOR.ADMIN,
    actorId: adminId,
    action: "CASH_LIMIT_OVERRIDE_GRANTED",
    entityType: "CashLimitOverride",
    entityId: row._id,
    captain: captainId,
    reason: trimmed,
    after: { expiresAt, hours: h },
  });
  notifyCaptain(captainId, {
    title: "Cash limit override granted",
    message: `You can keep taking COD orders until ${expiresAt.toISOString()}. Please deposit your cash.`,
    token: `cash-override:${row._id}`,
  });
  return row;
}
