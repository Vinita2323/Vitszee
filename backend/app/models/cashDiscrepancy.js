import mongoose from "mongoose";
import { DISCREPANCY_TYPE } from "../constants/cashSettlement.js";

const cashDiscrepancySchema = new mongoose.Schema(
  {
    captain: { type: mongoose.Schema.Types.ObjectId, ref: "Delivery", required: true, index: true },
    shift: { type: mongoose.Schema.Types.ObjectId, ref: "Shift", default: null, index: true },
    deposit: { type: mongoose.Schema.Types.ObjectId, ref: "CashDeposit", default: null },
    type: { type: String, enum: Object.values(DISCREPANCY_TYPE), required: true },
    amount: { type: Number, default: 0 },
    status: { type: String, enum: ["OPEN", "RESOLVED"], default: "OPEN", index: true },
    note: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null }, // null = system
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    resolvedAt: { type: Date, default: null },
    resolutionNote: { type: String, default: null },
  },
  { timestamps: true },
);

export default mongoose.model("CashDiscrepancy", cashDiscrepancySchema);
