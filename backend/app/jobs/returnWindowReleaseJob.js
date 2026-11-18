import dotenv from "dotenv";
import Order from "../models/order.js";
import logger from "../services/logger.js";
import Payout from "../models/payout.js";
import { processPayout } from "../services/finance/payoutService.js";

dotenv.config();

const DEFAULT_INTERVAL_MS = 60000;
const RETURN_HOLD_RELEASE_INTERVAL_MS = parseInt(
  process.env.RETURN_HOLD_RELEASE_INTERVAL_MS || `${DEFAULT_INTERVAL_MS}`,
  10,
);

const AUTO_RELEASE_SELLER_PAYOUT =
  String(process.env.AUTO_RELEASE_SELLER_PAYOUT || "true").toLowerCase() === "true";

const releaseExpiredSellerHolds = async () => {
  const startTime = Date.now();
  try {
    const now = new Date();
    const candidates = await Order.find({
      status: "delivered",
      returnStatus: "none",
      returnWindowExpiresAt: { $lte: now },
      $or: [
        { "settlementStatus.sellerPayout": "HOLD" },
        { "financeFlags.adminPayoutHeld": true },
      ],
    })
      .select("_id orderId settlementStatus financeFlags")
      .lean();

    for (const row of candidates) {
      try {
        const payouts = await Payout.find({
          payoutType: { $in: ["SELLER", "ADMIN"] },
          relatedOrderIds: row._id,
          status: { $in: ["PENDING", "PROCESSING"] },
        }).select("_id payoutType").lean();

        for (const payout of payouts) {
          if (payout.payoutType === "SELLER" && AUTO_RELEASE_SELLER_PAYOUT) {
            try {
              await processPayout(payout._id);
            } catch (err) {
              logger.warn("Auto-release seller payout failed", {
                jobName: "returnWindowReleaseJob",
                orderId: row.orderId,
                payoutId: String(payout._id),
                error: err.message,
              });
            }
          } else if (payout.payoutType === "SELLER") {
            await Order.updateOne(
              { _id: row._id },
              {
                $set: {
                  "settlementStatus.sellerPayout": "PENDING",
                  "financeFlags.sellerPayoutHeld": false,
                },
              },
            );
          } else if (payout.payoutType === "ADMIN") {
            try {
              await processPayout(payout._id);
              await Order.updateOne(
                { _id: row._id },
                {
                  $set: {
                    "financeFlags.adminPayoutHeld": false,
                  },
                },
              );
            } catch (err) {
              logger.warn("Auto-release admin payout failed", {
                jobName: "returnWindowReleaseJob",
                orderId: row.orderId,
                payoutId: String(payout._id),
                error: err.message,
              });
            }
          }
        }
      } catch (err) {
        logger.error("Failed to release seller payout hold", {
          jobName: "returnWindowReleaseJob",
          orderId: row.orderId,
          error: err.message,
        });
      }
    }

    const duration = Date.now() - startTime;
    if (candidates.length > 0) {
      logger.info("Return window release job completed", {
        jobName: "returnWindowReleaseJob",
        duration,
        releasedCount: candidates.length,
      });
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error("Return window release job failed", {
      jobName: "returnWindowReleaseJob",
      duration,
      error: err.message,
      stack: err.stack,
    });
  }
};

export const getReturnWindowReleaseJobHandler = () => releaseExpiredSellerHolds;

export const getReturnWindowReleaseJobInterval = () => RETURN_HOLD_RELEASE_INTERVAL_MS;

export default releaseExpiredSellerHolds;
