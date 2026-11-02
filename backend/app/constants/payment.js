export const PAYMENT_GATEWAY = {
  RAZORPAY: "RAZORPAY",
  PHONEPE: "PHONEPE",
};

export const PAYMENT_STATUS = {
  CREATED: "CREATED",
  PENDING: "PENDING",
  AUTHORIZED: "AUTHORIZED",
  CAPTURED: "CAPTURED",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
  CANCELLED: "CANCELLED",
};

export const PAYMENT_EVENT_SOURCE = {
  CLIENT_VERIFY: "CLIENT_VERIFY",
  WEBHOOK: "WEBHOOK",
  SYSTEM: "SYSTEM",
};

export const ALL_PAYMENT_GATEWAYS = Object.values(PAYMENT_GATEWAY);
export const ALL_PAYMENT_STATUSES = Object.values(PAYMENT_STATUS);
export const ALL_PAYMENT_EVENT_SOURCES = Object.values(PAYMENT_EVENT_SOURCE);

const TRANSITIONS = {
  [PAYMENT_STATUS.CREATED]: new Set([
    PAYMENT_STATUS.PENDING,
    PAYMENT_STATUS.AUTHORIZED,
    PAYMENT_STATUS.CAPTURED,
    PAYMENT_STATUS.FAILED,
    PAYMENT_STATUS.CANCELLED,
  ]),
  [PAYMENT_STATUS.PENDING]: new Set([
    PAYMENT_STATUS.AUTHORIZED,
    PAYMENT_STATUS.CAPTURED,
    PAYMENT_STATUS.FAILED,
    PAYMENT_STATUS.CANCELLED,
  ]),
  [PAYMENT_STATUS.AUTHORIZED]: new Set([
    PAYMENT_STATUS.CAPTURED,
    PAYMENT_STATUS.FAILED,
    PAYMENT_STATUS.REFUNDED,
  ]),
  [PAYMENT_STATUS.CAPTURED]: new Set([PAYMENT_STATUS.REFUNDED]),
  // A payment link allows retries, so a payment that was marked FAILED/CANCELLED
  // can still be captured later (customer paid on the same link). Such late
  // captures are accepted and, if the order is already cancelled, flagged for
  // manual reconciliation instead of being dropped.
  [PAYMENT_STATUS.FAILED]: new Set([PAYMENT_STATUS.CAPTURED, PAYMENT_STATUS.CANCELLED]),
  [PAYMENT_STATUS.CANCELLED]: new Set([PAYMENT_STATUS.CAPTURED]),
  [PAYMENT_STATUS.REFUNDED]: new Set(),
};

export function canTransitionPaymentStatus(fromStatus, toStatus) {
  if (!fromStatus || !toStatus) return false;
  if (fromStatus === toStatus) return true;
  return TRANSITIONS[fromStatus]?.has(toStatus) || false;
}

/** Why a payment needs a human to look at it (Payment.reconciliation). */
export const RECONCILIATION_REASON = {
  LATE_CAPTURE_AFTER_CANCEL: "LATE_CAPTURE_AFTER_CANCEL",
  DUPLICATE_PAYMENT: "DUPLICATE_PAYMENT",
  AMOUNT_MISMATCH: "AMOUNT_MISMATCH",
  UNMATCHED_CAPTURE: "UNMATCHED_CAPTURE",
  REFUND_FAILED: "REFUND_FAILED",
  REFUND_EXCEEDS_PAYMENT: "REFUND_EXCEEDS_PAYMENT",
};

/** Razorpay webhook event → what the payment domain should do. */
export const WEBHOOK_KIND = {
  CAPTURED: "CAPTURED",
  ATTEMPT_FAILED: "ATTEMPT_FAILED",
  LINK_CLOSED: "LINK_CLOSED",
  REFUND: "REFUND",
  QR: "QR",
  IGNORED: "IGNORED",
};

export const WEBHOOK_EVENT_STATUS = {
  PROCESSING: "PROCESSING",
  PROCESSED: "PROCESSED",
  FAILED: "FAILED",
  IGNORED: "IGNORED",
  UNMATCHED: "UNMATCHED",
};

export const REFUND_STATUS = {
  PENDING: "pending",
  PROCESSED: "processed",
  FAILED: "failed",
};
