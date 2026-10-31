import crypto from "crypto";
import mongoose from "mongoose";
import { AUDIT_ACTOR } from "../constants/cashSettlement.js";

/**
 * Append-only audit trail for the cash settlement module. The model refuses
 * every update/delete path, and each row stores a content hash so tampering
 * with a stored row is detectable. (For database-level immutability, also
 * restrict the application's Mongo role to insert/find on this collection.)
 */
const auditSchema = new mongoose.Schema(
  {
    actorType: { type: String, enum: Object.values(AUDIT_ACTOR), required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    captain: { type: mongoose.Schema.Types.ObjectId, ref: "Delivery", default: null, index: true },
    reason: { type: String, default: null },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
    at: { type: Date, required: true },
    hash: { type: String, required: true },
  },
  { versionKey: false },
);

export function auditHash(doc) {
  const canonical = JSON.stringify([
    doc.actorType,
    String(doc.actorId || ""),
    doc.action,
    doc.entityType,
    String(doc.entityId || ""),
    String(doc.captain || ""),
    doc.reason || "",
    JSON.stringify(doc.before ?? null),
    JSON.stringify(doc.after ?? null),
    JSON.stringify(doc.meta ?? null),
    new Date(doc.at).toISOString(),
  ]);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

const blocked = function blocked() {
  throw new Error("CashSettlementAudit is append-only");
};
[
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "findOneAndReplace",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
].forEach((op) => auditSchema.pre(op, blocked));
auditSchema.pre("save", function guardSave(next) {
  if (!this.isNew) return next(new Error("CashSettlementAudit is append-only"));
  return next();
});

export default mongoose.model("CashSettlementAudit", auditSchema);
