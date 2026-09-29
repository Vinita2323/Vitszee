import Shipment from "../../models/shipment.js";
import logger from "../logger.js";
import { trackForwardOrder, LIVE_FORWARD_STATUSES } from "./delhiveryForwardService.js";
import { getDelhiveryConfig } from "./delhiveryConfig.js";

/**
 * Pulls fresh statuses for Delhivery shipments that have not been synced recently.
 * This is the safety net for scans that never arrive by webhook.
 */
export async function reconcileStaleShipments(batchLimit = 50) {
  const config = await getDelhiveryConfig();
  if (!config.forwardEnabled) {
    return { reconciled: 0, skipped: true, reason: "Delhivery disabled" };
  }

  const staleThreshold = new Date(Date.now() - (config.reconciliationIntervalMinutes || 15) * 60 * 1000);

  const staleShipments = await Shipment.find({
    deliveryProvider: "delhivery",
    providerType: "forward",
    shipmentStatus: { $in: LIVE_FORWARD_STATUSES },
    awbNumber: { $nin: [null, ""] },
    $or: [{ lastProviderSyncAt: { $lt: staleThreshold } }, { lastProviderSyncAt: null }],
  })
    .limit(batchLimit)
    .lean();

  if (staleShipments.length === 0) {
    return { reconciled: 0, total: 0 };
  }

  logger.info(`[Delhivery Reconciliation] Found ${staleShipments.length} shipments to sync`);

  let successCount = 0;
  let failCount = 0;

  for (const s of staleShipments) {
    try {
      await trackForwardOrder(s.awbNumber);
      successCount++;
    } catch (err) {
      failCount++;
      // Stamp the sync time so a failing shipment is not retried every minute.
      await Shipment.updateOne({ _id: s._id }, { $set: { lastProviderSyncAt: new Date() } }).catch(() => {});
      logger.warn(`[Delhivery Reconciliation] Failed to sync #${s.internalOrderId}: ${err.message}`);
    }
  }

  logger.info(`[Delhivery Reconciliation] Completed. Success: ${successCount}, Failed: ${failCount}`);
  return { reconciled: successCount, failed: failCount, total: staleShipments.length };
}
