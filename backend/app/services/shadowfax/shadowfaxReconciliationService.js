import Shipment from "../../models/shipment.js";
import logger from "../logger.js";
import { trackForwardOrder } from "./shadowfaxForwardService.js";
import { trackReversePickup } from "./shadowfaxReverseService.js";
import { getShadowfaxConfig } from "./shadowfaxConfig.js";

const ACTIVE_FORWARD_STATUSES = [
  "ORDER_CREATED",
  "DISPATCH_READY",
  "RIDER_ASSIGNED",
  "RIDER_ARRIVED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
];

const ACTIVE_REVERSE_STATUSES = [
  "RETURN_REQUESTED",
  "RETURN_RIDER_ASSIGNED",
  "RETURN_QC_IN_PROGRESS",
  "RETURN_PICKED_UP",
];

/**
 * Reconciles active Shadowfax shipments with stale sync timestamps.
 */
export async function reconcileStaleShipments(batchLimit = 50) {
  const config = await getShadowfaxConfig();
  if (!config.forwardEnabled && !config.reverseEnabled) {
    return { reconciled: 0, skipped: true, reason: "Shadowfax disabled" };
  }

  const syncThresholdMinutes = config.reconciliationIntervalMinutes || 15;
  const staleThreshold = new Date(Date.now() - syncThresholdMinutes * 60 * 1000);

  const staleShipments = await Shipment.find({
    deliveryProvider: "shadowfax",
    $or: [
      { shipmentStatus: { $in: ACTIVE_FORWARD_STATUSES }, providerType: "forward" },
      { shipmentStatus: { $in: ACTIVE_REVERSE_STATUSES }, providerType: "reverse" },
    ],
    $and: [
      {
        $or: [
          { lastProviderSyncAt: { $lt: staleThreshold } },
          { lastProviderSyncAt: null },
        ],
      },
    ],
  })
    .limit(batchLimit)
    .lean();

  if (staleShipments.length === 0) {
    return { reconciled: 0, total: 0 };
  }

  logger.info(`[Shadowfax Reconciliation] Found ${staleShipments.length} stale shipments to reconcile`);

  let successCount = 0;
  let failCount = 0;

  for (const s of staleShipments) {
    try {
      if (s.providerType === "forward" && (s.awbNumber || s.shadowfaxOrderId)) {
        await trackForwardOrder(s.awbNumber || s.shadowfaxOrderId);
        successCount++;
      } else if (s.providerType === "reverse" && (s.clientRequestId || s.shadowfaxOrderId)) {
        await trackReversePickup(s.clientRequestId || s.shadowfaxOrderId);
        successCount++;
      }
    } catch (err) {
      failCount++;
      // Mark lastProviderSyncAt so failed reconciliations don't spam the API every minute
      await Shipment.updateOne(
        { _id: s._id },
        { $set: { lastProviderSyncAt: new Date() } }
      ).catch(() => {});
      logger.warn(`[Shadowfax Reconciliation] Failed to reconcile shipment #${s.internalOrderId}: ${err.message}`);
    }
  }

  logger.info(`[Shadowfax Reconciliation] Completed. Success: ${successCount}, Failed: ${failCount}`);
  return { reconciled: successCount, failed: failCount, total: staleShipments.length };
}
