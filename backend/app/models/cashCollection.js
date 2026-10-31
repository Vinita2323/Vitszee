import mongoose from "mongoose";
import { COLLECTION_METHOD } from "../constants/cashSettlement.js";

/**
 * One row per delivered order per captain. Amounts and method are immutable:
 * captains have no API to change them, and Mongoose rejects updates to them.
 *
 * Outstanding cash is NOT stored here — the source of truth stays the order's
 * `paymentBreakdown.codPendingAmount` (existing finance), so there is no
 * second ledger that could drift.
 */
const cashCollectionSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, unique: true, immutable: true },
    orderId: { type: String, required: true, index: true, immutable: true },
    captain: { type: mongoose.Schema.Types.ObjectId, ref: "Delivery", required: true, index: true, immutable: true },
    shift: { type: mongoose.Schema.Types.ObjectId, ref: "Shift", default: null, index: true, immutable: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
    amount: { type: Number, required: true, min: 0, immutable: true },
    paymentMethod: { type: String, enum: Object.values(COLLECTION_METHOD), required: true, immutable: true },
    /** Only CASH rows are part of the physical cash balance. */
    countsTowardCash: { type: Boolean, required: true, immutable: true },
    collectedAt: { type: Date, required: true, immutable: true },
    reference: { type: String, required: true, unique: true, immutable: true },
    verification: { type: mongoose.Schema.Types.Mixed, default: {}, immutable: true },
  },
  { timestamps: true },
);

cashCollectionSchema.index({ captain: 1, countsTowardCash: 1, collectedAt: 1 });

export default mongoose.model("CashCollection", cashCollectionSchema);
