import mongoose from "mongoose";
import { DEPOSIT_METHOD, DEPOSIT_STATUS } from "../constants/cashSettlement.js";

const allocationSchema = new mongoose.Schema(
  {
    collection: { type: mongoose.Schema.Types.ObjectId, ref: "CashCollection" },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    orderId: String,
    amount: Number,
  },
  { _id: false },
);

/**
 * A captain's request to hand in cash. Submitting (even with a screenshot)
 * never settles anything: only an admin approval allocates it to orders.
 */
const cashDepositSchema = new mongoose.Schema(
  {
    depositId: { type: String, required: true, unique: true, immutable: true },
    captain: { type: mongoose.Schema.Types.ObjectId, ref: "Delivery", required: true, index: true, immutable: true },
    shift: { type: mongoose.Schema.Types.ObjectId, ref: "Shift", default: null, index: true },
    method: { type: String, enum: Object.values(DEPOSIT_METHOD), required: true, immutable: true },
    /** Amount the captain says they deposited. */
    amount: { type: Number, required: true, min: 0.01, immutable: true },
    idempotencyKey: { type: String, default: undefined },

    // BANK_UPI
    utr: { type: String, default: null },
    proofUrl: { type: String, default: null },
    // PHYSICAL_CASH
    receiptNumber: { type: String, default: null },
    receivedBy: { type: String, default: null },
    depositedAt: { type: Date, default: null }, // as claimed by the captain (informational only)
    // Normalised keys, only present while the deposit reserves the reference.
    utrKey: { type: String, default: undefined },
    receiptKey: { type: String, default: undefined },

    status: { type: String, enum: Object.values(DEPOSIT_STATUS), default: DEPOSIT_STATUS.SUBMITTED, index: true },
    submittedAt: { type: Date, required: true, immutable: true }, // server time

    // Admin verification
    verifiedAmount: { type: Number, default: 0 },
    allocatedAmount: { type: Number, default: 0 },
    excessAmount: { type: Number, default: 0 },
    allocations: { type: [allocationSchema], default: [] },
    pendingBefore: { type: Number, default: null },
    pendingAfter: { type: Number, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    verifiedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    adminNote: { type: String, default: null },
    adjustmentReason: { type: String, default: null },
  },
  { timestamps: true },
);

cashDepositSchema.index(
  { captain: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);
cashDepositSchema.index({ utrKey: 1 }, { unique: true, partialFilterExpression: { utrKey: { $type: "string" } } });
cashDepositSchema.index({ receiptKey: 1 }, { unique: true, partialFilterExpression: { receiptKey: { $type: "string" } } });
cashDepositSchema.index({ status: 1, submittedAt: -1 });

export default mongoose.model("CashDeposit", cashDepositSchema);
