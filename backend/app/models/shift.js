import mongoose from "mongoose";
import { SHIFT_STATUS } from "../constants/cashSettlement.js";

const shiftSchema = new mongoose.Schema(
  {
    shiftId: { type: String, required: true, unique: true, immutable: true },
    captain: { type: mongoose.Schema.Types.ObjectId, ref: "Delivery", required: true, index: true, immutable: true },
    status: { type: String, enum: Object.values(SHIFT_STATUS), default: SHIFT_STATUS.ACTIVE, index: true },
    /** Server timestamps only — never taken from the client. */
    startedAt: { type: Date, required: true, immutable: true },
    endedAt: { type: Date, default: null },
    /** Cash from this shift must be deposited by this time, else OVERDUE. */
    dueAt: { type: Date, default: null },
    /** Frozen at End Shift for the settlement summary; live numbers are always recomputed. */
    closingSummary: { type: mongoose.Schema.Types.Mixed, default: null },
    /** Notification de-duplication flags (set atomically). */
    notified: {
      shiftReminderAt: { type: Date, default: null },
      endedAdminAt: { type: Date, default: null },
      depositRequiredAt: { type: Date, default: null },
      pendingReminderAt: { type: Date, default: null },
      overdueAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

// A captain can only ever have one ACTIVE shift (enforced by the database).
shiftSchema.index(
  { captain: 1 },
  { unique: true, partialFilterExpression: { status: SHIFT_STATUS.ACTIVE }, name: "uniq_active_shift_per_captain" },
);
shiftSchema.index({ captain: 1, startedAt: -1 });
shiftSchema.index({ status: 1, dueAt: 1 });

export default mongoose.model("Shift", shiftSchema);
