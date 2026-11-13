import Setting from "../models/setting.js";

/**
 * Single source of truth for return-window business rules.
 */

export function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return fallback;
}

export async function getReturnSettings() {
  const setting = await Setting.findOne().select("returnWindowMinutes returnEligibilityDelayMinutes").lean();
  
  return {
    eligibleDelay: parsePositiveInt(setting?.returnEligibilityDelayMinutes ?? process.env.RETURN_ELIGIBILITY_DELAY_MINUTES, 2),
    windowMinutes: parsePositiveInt(setting?.returnWindowMinutes ?? process.env.RETURN_WINDOW_MINUTES, 2880)
  };
}

export async function getReturnEligibilityDelayMinutes() {
  const settings = await getReturnSettings();
  return settings.eligibleDelay;
}

export async function getReturnWindowMinutes() {
  const settings = await getReturnSettings();
  return settings.windowMinutes;
}

/**
 * Order-aware variant: prefers persisted timestamps on the order and falls
 * back to deliveredAt → createdAt → now. Returns the configured delay/window
 * values alongside the computed dates for use in user-facing error messages.
 */
export async function computeReturnWindowForOrder(order) {
  const base = order?.deliveredAt || order?.createdAt || new Date();
  const deliveredAt = base instanceof Date ? base : new Date(base);
  
  const { eligibleDelay, windowMinutes } = await getReturnSettings();

  const eligibleAt =
    order?.returnEligibleAt ||
    new Date(deliveredAt.getTime() + eligibleDelay * 60 * 1000);
  let windowExpiresAt =
    order?.returnWindowExpiresAt ||
    new Date(deliveredAt.getTime() + windowMinutes * 60 * 1000);
  if (windowExpiresAt < eligibleAt) {
    windowExpiresAt = eligibleAt;
  }

  return {
    eligibleAt,
    windowExpiresAt,
    eligibleDelay,
    windowMinutes,
  };
}

/**
 * Date-only variant: derives the window strictly from a deliveredAt input,
 * ignoring any persisted order-level overrides. Used by the finance service
 * when stamping a freshly-delivered order.
 */
export async function computeReturnWindowDates(deliveredAt) {
  const { eligibleDelay, windowMinutes } = await getReturnSettings();
  const start = deliveredAt instanceof Date ? deliveredAt : new Date();
  const eligibleAt = new Date(start.getTime() + eligibleDelay * 60 * 1000);
  const windowExpiresAt = new Date(start.getTime() + windowMinutes * 60 * 1000);

  return {
    eligibleAt,
    windowExpiresAt,
  };
}
