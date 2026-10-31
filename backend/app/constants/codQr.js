/**
 * COD → Razorpay Dynamic QR payment constants.
 *
 * Lifecycle of one QR attempt (CodQrPayment):
 *   CREATED  → row inserted, Razorpay QR not created yet
 *   PENDING  → QR is live, waiting for the customer to pay
 *   PAID     → captured payment verified (exact amount); order completes
 *   FAILED   → payment attempt failed; rider can retry with a fresh QR
 *   EXPIRED  → QR expired unpaid; rider can generate a new QR
 *   CLOSED   → superseded / closed on demand (e.g. rider switched to cash)
 */
export const COD_QR_STATUS = {
  CREATED: "CREATED",
  PENDING: "PENDING",
  PAID: "PAID",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
  CLOSED: "CLOSED",
};

export const COD_QR_OPEN_STATUSES = [COD_QR_STATUS.CREATED, COD_QR_STATUS.PENDING];

/** Canonical detailed payment method written on the order once settled. */
export const COD_SETTLEMENT_METHOD = {
  CASH: "CASH",
  RAZORPAY_QR: "RAZORPAY_QR",
};

export const COD_QR_AUDIT_EVENT = {
  QR_CREATED: "QR_CREATED",
  QR_CREATE_FAILED: "QR_CREATE_FAILED",
  WEBHOOK_RECEIVED: "WEBHOOK_RECEIVED",
  STATUS_CHECKED: "STATUS_CHECKED",
  PAYMENT_VERIFIED: "PAYMENT_VERIFIED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  AMOUNT_MISMATCH: "AMOUNT_MISMATCH",
  PAYMENT_NOT_CAPTURED: "PAYMENT_NOT_CAPTURED",
  DUPLICATE_PAYMENT: "DUPLICATE_PAYMENT",
  LATE_PAYMENT_ACCEPTED: "LATE_PAYMENT_ACCEPTED",
  EXPIRED: "EXPIRED",
  CLOSED: "CLOSED",
  ORDER_COMPLETED: "ORDER_COMPLETED",
  ORDER_COMPLETION_FAILED: "ORDER_COMPLETION_FAILED",
};

export const codQrEnabled = () =>
  String(process.env.COD_QR_PAYMENT_ENABLED ?? "true").toLowerCase() !== "false";

/** Minutes a dynamic QR stays valid. Razorpay requires close_by >= 2 minutes. */
export const codQrExpiryMinutes = () => {
  const n = Number.parseInt(process.env.COD_QR_EXPIRY_MINUTES || "15", 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 3), 60) : 15;
};
