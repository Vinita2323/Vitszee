import mongoose from "mongoose";

const webhookEventLogSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
    },
    eventId: {
      type: String,
      index: true,
      sparse: true,
    },
    providerOrderId: {
      type: String,
      index: true,
      sparse: true,
    },
    internalOrderId: {
      type: String,
      index: true,
      sparse: true,
    },
    awbNumber: {
      type: String,
      index: true,
      sparse: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    headers: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    processed: {
      type: Boolean,
      default: false,
      index: true,
    },
    processedAt: Date,
    error: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

webhookEventLogSchema.index({ provider: 1, eventId: 1 }, { unique: true, sparse: true });
webhookEventLogSchema.index({ provider: 1, providerOrderId: 1, eventType: 1 });

export default mongoose.model("WebhookEventLog", webhookEventLogSchema);
