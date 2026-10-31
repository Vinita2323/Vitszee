import mongoose from "mongoose";

/** Admin-granted, time-boxed permission for a captain to keep taking COD despite overdue cash. */
const cashLimitOverrideSchema = new mongoose.Schema(
  {
    captain: { type: mongoose.Schema.Types.ObjectId, ref: "Delivery", required: true, index: true },
    reason: { type: String, required: true, minlength: 5 },
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true },
);

cashLimitOverrideSchema.index({ captain: 1, expiresAt: -1 });

export default mongoose.model("CashLimitOverride", cashLimitOverrideSchema);
