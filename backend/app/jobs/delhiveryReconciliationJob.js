import { reconcileStaleShipments } from "../services/delhivery/delhiveryReconciliationService.js";
import logger from "../services/logger.js";

const DEFAULT_RECONCILIATION_INTERVAL_MS = 60000; // check every minute for stale shipments

export const getDelhiveryReconciliationJobHandler = () => {
  return async () => {
    try {
      await reconcileStaleShipments();
    } catch (err) {
      logger.error("[DelhiveryReconciliationJob] Job execution error", { error: err.message });
    }
  };
};

export const getDelhiveryReconciliationJobInterval = () => {
  return parseInt(
    process.env.DELHIVERY_RECONCILIATION_INTERVAL_MS || `${DEFAULT_RECONCILIATION_INTERVAL_MS}`,
    10
  );
};
