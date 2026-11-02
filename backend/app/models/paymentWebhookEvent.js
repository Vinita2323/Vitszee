import mongoose from "mongoose";
import { ALL_PAYMENT_GATEWAYS, WEBHOOK_EVENT_STATUS } from "../constants/payment.js";

const paymentWebhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    gatewayName: {
      type: String,
      enum: ALL_PAYMENT_GATEWAYS,
      required: true,
      default: "PHONEPE",
    },
    eventType: {
      type: String,
      required: true,
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
      index: true,
    },
    publicOrderId: {
      type: String,
      default: null,
      index: true,
    },
    payloadHash: {
      type: String,
      required: true,
    },
    /**
     * PROCESSING → PROCESSED | IGNORED | UNMATCHED on success, or FAILED (the
     * gateway's redelivery then re-runs it). Rows created before this field
     * existed read as PROCESSED (they were recorded before processing, as before).
     */
    status: {
      type: String,
      enum: Object.values(WEBHOOK_EVENT_STATUS),
      default: WEBHOOK_EVENT_STATUS.PROCESSED,
      index: true,
    },
    attempts: { type: Number, default: 1 },
    lockedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    note: { type: String, default: null },
    alertedAt: { type: Date, default: null },
    processedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

paymentWebhookEventSchema.index({ gatewayName: 1, processedAt: -1 });

export default mongoose.model("PaymentWebhookEvent", paymentWebhookEventSchema);