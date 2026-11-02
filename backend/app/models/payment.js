import mongoose from "mongoose";
import {
  ALL_PAYMENT_EVENT_SOURCES,
  ALL_PAYMENT_GATEWAYS,
  ALL_PAYMENT_STATUSES,
  PAYMENT_STATUS,
} from "../constants/payment.js";

const paymentStateChangeSchema = new mongoose.Schema(
  {
    fromStatus: {
      type: String,
      enum: ALL_PAYMENT_STATUSES,
      required: true,
    },
    toStatus: {
      type: String,
      enum: ALL_PAYMENT_STATUSES,
      required: true,
    },
    source: {
      type: String,
      enum: ALL_PAYMENT_EVENT_SOURCES,
      required: true,
    },
    reason: {
      type: String,
      default: "",
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const refundSchema = new mongoose.Schema(
  {
    refundId: { type: String, required: true },
    gatewayPaymentId: { type: String, default: null },
    amount: { type: Number, required: true, min: 0 }, // paise
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["pending", "processed", "failed"], required: true },
    speed: { type: String, default: null },
    notes: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAtGateway: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    failureAlertedAt: { type: Date, default: null },
    lastEvent: { type: String, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const reconciliationItemSchema = new mongoose.Schema(
  {
    reason: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    flaggedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const failedAttemptSchema = new mongoose.Schema(
  {
    paymentId: { type: String, required: true },
    reason: { type: String, default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    checkoutGroupId: {
      type: String,
      default: null,
      index: true,
    },
    orderIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
    publicOrderId: {
      type: String,
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    gatewayName: {
      type: String,
      enum: ALL_PAYMENT_GATEWAYS,
      required: true,
      default: "PHONEPE",
      index: true,
    },
    gatewayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    gatewayPaymentId: {
      type: String,
      default: null,
      index: true,
    },
    /** Razorpay Payment Link id (plink_...) returned when the link was created. */
    gatewayLinkId: { type: String, default: null, index: true },
    /** Razorpay order id (order_...) learned from webhook events, used to match later events. */
    gatewayRazorpayOrderId: { type: String, default: null, index: true },
    /** Failed attempts on this link. The link stays usable, so these never cancel the order. */
    failedAttempts: { type: [failedAttemptSchema], default: [] },
    /** Set once the capture side effects (finance, order progression, notifications) have run exactly once. */
    captureProcessedAt: { type: Date, default: null },
    captureLockedAt: { type: Date, default: null },
    /** Money received that needs a person: late capture after cancel, duplicate payment, mismatch... */
    reconciliation: {
      required: { type: Boolean, default: false },
      items: { type: [reconciliationItemSchema], default: [] },
      resolvedAt: { type: Date, default: null },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
      resolutionNote: { type: String, default: null },
    },
    reconciliationKeys: { type: [String], default: [] },
    refundState: { type: String, enum: ["NONE", "PARTIAL", "FULL"], default: "NONE" },
    refunds: { type: [refundSchema], default: [] },
    gatewaySignature: {
      type: String,
      default: null,
      select: false,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
    },
    status: {
      type: String,
      enum: ALL_PAYMENT_STATUSES,
      default: PAYMENT_STATUS.CREATED,
      index: true,
    },
    attemptCount: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    idempotencyKey: {
      type: String,
      default: undefined,
      index: true,
    },
    correlationId: {
      type: String,
      default: null,
      index: true,
    },
    rawGatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    failureReason: {
      type: String,
      default: null,
    },
    refundedAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    capturedAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },
    refundedAt: {
      type: Date,
      default: null,
    },
    statusHistory: {
      type: [paymentStateChangeSchema],
      default: [],
    },
  },
  { timestamps: true },
);

paymentSchema.index(
  { order: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string" },
    },
  },
);
paymentSchema.index({ order: 1, createdAt: -1 });
paymentSchema.index({ checkoutGroupId: 1, createdAt: -1 });
paymentSchema.index({ checkoutGroupId: 1, status: 1, createdAt: -1 });
paymentSchema.index({ customer: 1, createdAt: -1 });
paymentSchema.index({ status: 1, updatedAt: -1 });
paymentSchema.index({ "reconciliation.required": 1, updatedAt: -1 });
paymentSchema.index({ "refunds.refundId": 1 });

export default mongoose.model("Payment", paymentSchema);
