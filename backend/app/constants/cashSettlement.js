/**
 * Captain end-of-shift cash settlement constants + configuration.
 *
 * Delivery status, payment status and settlement status are deliberately
 * separate: an order being DELIVERED / PAID(CASH) says nothing about whether
 * the captain has handed the cash in. Settlement is tracked here.
 */
export const SHIFT_STATUS = { ACTIVE: "ACTIVE", CLOSED: "CLOSED" };

export const COLLECTION_METHOD = {
  CASH: "CASH",
  RAZORPAY_QR: "RAZORPAY_QR",
  ONLINE_PREPAID: "ONLINE_PREPAID",
};

export const DEPOSIT_METHOD = {
  BANK_UPI: "BANK_UPI",
  PHYSICAL_CASH: "PHYSICAL_CASH",
  ADMIN_ADJUSTMENT: "ADMIN_ADJUSTMENT",
};

export const DEPOSIT_STATUS = {
  SUBMITTED: "SUBMITTED", // awaiting admin verification — NOT a settlement
  APPROVING: "APPROVING", // claimed by an admin, allocation in progress
  APPROVED: "APPROVED",
  PARTIALLY_APPROVED: "PARTIALLY_APPROVED", // verified < claimed
  REJECTED: "REJECTED",
};

export const SETTLEMENT_STATUS = {
  ACTIVE: "ACTIVE",
  PENDING: "PENDING",
  PARTIALLY_SETTLED: "PARTIALLY_SETTLED",
  SETTLED: "SETTLED",
  OVERDUE: "OVERDUE",
  REJECTED: "REJECTED",
  DISPUTED: "DISPUTED",
};

export const DISCREPANCY_TYPE = {
  UNDERPAYMENT: "UNDERPAYMENT",
  EXCESS_DEPOSIT: "EXCESS_DEPOSIT",
  MISSING_CASH: "MISSING_CASH",
  INVALID_PROOF: "INVALID_PROOF",
  DUPLICATE_REFERENCE: "DUPLICATE_REFERENCE",
  DISPUTED_TRANSACTION: "DISPUTED_TRANSACTION",
  VERIFIED_LESS_THAN_CLAIMED: "VERIFIED_LESS_THAN_CLAIMED",
};

export const AUDIT_ACTOR = { ADMIN: "ADMIN", CAPTAIN: "CAPTAIN", SYSTEM: "SYSTEM" };

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/** Max pending (unsettled) cash a captain may hold, in rupees. */
export const cashHoldingLimit = () => num(process.env.CASH_HOLDING_LIMIT, 5000);
/** Fraction of the limit at which the captain gets a warning. */
export const cashWarnRatio = () => num(process.env.CASH_LIMIT_WARN_RATIO, 0.8);
/** Hours after shift end by which cash must be deposited before it is OVERDUE. */
export const settlementGraceHours = () => num(process.env.CASH_SETTLEMENT_GRACE_HOURS, 24);
/** COD cash can only be collected while a shift is active. */
export const shiftRequiredForCod = () =>
  String(process.env.CASH_SHIFT_REQUIRED ?? "true").toLowerCase() !== "false";
/** Hours into a shift after which the captain is reminded to end it. */
export const shiftReminderHours = () => num(process.env.CASH_SHIFT_REMINDER_HOURS, 10);
/** Minimum hours between "pending cash" reminders per shift. */
export const pendingReminderHours = () => num(process.env.CASH_PENDING_REMINDER_HOURS, 12);
