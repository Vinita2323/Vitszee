import { reconcileStaleShipments } from "../services/shadowfax/shadowfaxReconciliationService.js";
import logger from "../services/logger.js";

const DEFAULT_RECONCILIATION_INTERVAL_MS = 60000; // Run every minute to check for stale shipments

export const getShadowfaxReconciliationJobHandler = () => {
  return async () => {
    try {
      await reconcileStaleShipments();
    } catch (err) {
      logger.error("[ShadowfaxReconciliationJob] Job execution error", { error: err.message });
    }
  };
};

export const getShadowfaxReconciliationJobInterval = () => {
  return parseInt(
    process.env.SHADOWFAX_RECONCILIATION_INTERVAL_MS || `${DEFAULT_RECONCILIATION_INTERVAL_MS}`,
    10
  );
};
