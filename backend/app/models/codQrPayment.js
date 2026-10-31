import mongoose from "mongoose";
import { COD_QR_STATUS } from "../constants/codQr.js";

const auditEntrySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    event: { type: String, required: true },
    source: { type: String, default: "SYSTEM" }, // SYSTEM | WEBHOOK | STATUS_CHECK | RIDER
    detail: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const duplicatePaymentSchema = new mongoose.Schema(
  {
    paymentId: String,
    amountPaise: Number,
    reason: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

/**
 * One Razorpay Dynamic QR attempt for the outstanding amount of a COD order.
 * A new row is created per attempt (retry / regenerate after expiry) so the
 * full payment history of an order is preserved.
 */
const codQrPaymentSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    orderId: { type: String, required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    deliveryBoy: { type: mongoose.Schema.Types.ObjectId, ref: "Delivery", default: null },
    attempt: { type: Number, default: 1, min: 1 },

    amountPaise: { type: Number, required: true, min: 100 },
    currency: { type: String, default: "INR" },

    razorpayQrId: { type: String, default: null },
    qrImageUrl: { type: String, default: null },
    status: {
      type: String,
      enum: Object.values(COD_QR_STATUS),
      default: COD_QR_STATUS.CREATED,
      index: true,
    },
    /** true while this attempt is the order's single live QR (unique per order). */
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date, required: true },

    razorpayPaymentId: { type: String, default: null },
    paymentMethodUsed: { type: String, default: null }, // upi / card ...
    payerVpa: { type: String, default: null },
    capturedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
    /** Sanitised copy of the Razorpay payment entity that completed the order. */
    paymentSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },

    /** Set once the order itself has been moved to DELIVERED/PAID for this payment. */
    finalizedAt: { type: Date, default: null },
    /** Short-lived lock so a webhook and a status poll never finalize the same payment twice. */
    finalizingAt: { type: Date, default: null },

    /** Money received that must be reviewed / refunded by finance. */
    reviewRequired: { type: Boolean, default: false },
    duplicatePayments: { type: [duplicatePaymentSchema], default: [] },

    webhookEventIds: { type: [String], default: [] },
    auditLog: { type: [auditEntrySchema], default: [] },
  },
  { timestamps: true },
);

// Exactly one live QR per order — prevents concurrent double-generation.
codQrPaymentSchema.index(
  { order: 1 },
  { unique: true, partialFilterExpression: { isActive: true }, name: "uniq_active_qr_per_order" },
);
codQrPaymentSchema.index(
  { razorpayQrId: 1 },
  { unique: true, partialFilterExpression: { razorpayQrId: { $type: "string" } } },
);
// A Razorpay payment id can complete at most one attempt (idempotency).
codQrPaymentSchema.index(
  { razorpayPaymentId: 1 },
  { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: "string" } } },
);
codQrPaymentSchema.index({ order: 1, createdAt: -1 });
codQrPaymentSchema.index({ status: 1, expiresAt: 1 });

export default mongoose.model("CodQrPayment", codQrPaymentSchema);
