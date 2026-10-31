import CashSettlementAudit, { auditHash } from "../../models/cashSettlementAudit.js";

/**
 * Appends one immutable audit row. Pass `{ session }` to make the audit row
 * part of the same transaction as the financial change it describes.
 */
export async function writeAudit(entry, { session = null } = {}) {
  const row = {
    actorType: entry.actorType,
    actorId: entry.actorId || null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId || null,
    captain: entry.captain || null,
    reason: entry.reason || null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    meta: entry.meta ?? null,
    at: new Date(),
  };
  row.hash = auditHash(row);
  const [created] = await CashSettlementAudit.create([row], session ? { session } : {});
  return created;
}
