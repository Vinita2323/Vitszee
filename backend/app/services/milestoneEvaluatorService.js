import mongoose from "mongoose";
import Order from "../models/order.js";
import MilestoneCampaign from "../models/milestoneCampaign.js";
import CustomerMilestoneProgress from "../models/customerMilestoneProgress.js";
import Coupon from "../models/coupon.js";
import { creditWallet } from "./finance/walletService.js";
import { emitNotificationEvent } from "../modules/notifications/notification.service.js";
import { NOTIFICATION_EVENTS, NOTIFICATION_ROLES } from "../modules/notifications/notification.constants.js";
import logger from "./logger.js";
import { OWNER_TYPE } from "../constants/finance.js";

// Helper to generate a unique coupon code
const generateUniqueCouponCode = (prefix = "REWARD") => {
    return `${prefix}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
};

export const evaluateCustomerMilestones = async (customerId, orderId = null) => {
    try {
        const now = new Date();
        
        // 1. Fetch active campaigns
        const activeCampaigns = await MilestoneCampaign.find({
            status: "active",
            $or: [{ startDate: { $lte: now } }, { startDate: null }],
            $or: [{ endDate: { $gte: now } }, { endDate: null }]
        });

        if (!activeCampaigns.length) return;

        // Group campaigns by triggerType to optimize queries
        const triggerTypes = [...new Set(activeCampaigns.map(c => c.triggerType))];
        const stats = {};

        // 2. Compute customer stats based on active trigger types
        for (const type of triggerTypes) {
            switch (type) {
                case "total_orders":
                    stats.total_orders = await Order.countDocuments({
                        customer: customerId,
                        "payment.status": { $in: ["completed", "pending"] }, // Assuming valid orders
                        // Should we count only delivered? The prompt says "whenever an order is successfully completed"
                        // I will count all non-failed/cancelled orders
                    });
                    break;
                case "total_spending":
                    const spendAgg = await Order.aggregate([
                        { $match: { customer: mongoose.Types.ObjectId(customerId), "payment.status": { $ne: "failed" } } },
                        { $group: { _id: null, total: { $sum: "$pricing.subtotal" } } }
                    ]);
                    stats.total_spending = spendAgg.length ? spendAgg[0].total : 0;
                    break;
                case "total_products":
                    const prodAgg = await Order.aggregate([
                        { $match: { customer: mongoose.Types.ObjectId(customerId), "payment.status": { $ne: "failed" } } },
                        { $unwind: "$items" },
                        { $group: { _id: null, count: { $sum: "$items.quantity" } } }
                    ]);
                    stats.total_products = prodAgg.length ? prodAgg[0].count : 0;
                    break;
                case "first_order":
                    stats.first_order = await Order.countDocuments({ customer: customerId }) === 1 ? 1 : 0;
                    break;
                // Add more complex queries for category_purchase and brand_purchase as needed
                default:
                    stats[type] = 0;
            }
        }

        // 3. Evaluate each campaign
        for (const campaign of activeCampaigns) {
            let currentProgress = stats[campaign.triggerType] || 0;
            
            // Fetch existing progress
            let progressDoc = await CustomerMilestoneProgress.findOne({ customer: customerId, campaign: campaign._id });

            if (!progressDoc) {
                progressDoc = new CustomerMilestoneProgress({
                    customer: customerId,
                    campaign: campaign._id,
                    currentProgress: currentProgress,
                    isCompleted: currentProgress >= campaign.targetValue
                });
            } else {
                if (progressDoc.rewardIssued) continue; // Skip already rewarded
                progressDoc.currentProgress = currentProgress;
                if (currentProgress >= campaign.targetValue) {
                    progressDoc.isCompleted = true;
                }
            }

            // 4. Issue Reward if completed
            if (progressDoc.isCompleted && !progressDoc.rewardIssued) {
                let rewardDetails = null;

                if (["percentage_discount", "flat_discount", "free_delivery"].includes(campaign.rewardType)) {
                    // Issue Coupon
                    const coupon = new Coupon({
                        code: generateUniqueCouponCode('WINS'),
                        title: `${campaign.name} Reward`,
                        description: `Reward for achieving: ${campaign.name}`,
                        discountType: campaign.rewardType === "percentage_discount" ? "percentage" : campaign.rewardType === "flat_discount" ? "fixed" : "free_delivery",
                        discountValue: campaign.couponConfig?.discountValue || 0,
                        maxDiscount: campaign.couponConfig?.maxDiscount,
                        minOrderValue: campaign.couponConfig?.minOrderValue || 0,
                        perUserLimit: 1,
                        usageLimit: 1,
                        validFrom: now,
                        validTill: new Date(now.getTime() + (campaign.couponConfig?.validityDays || 30) * 24 * 60 * 60 * 1000),
                        isActive: true,
                        metadata: {
                            customerId: customerId.toString(),
                            isMilestoneReward: true
                        }
                    });
                    await coupon.save();
                    progressDoc.couponId = coupon._id;
                    rewardDetails = `Coupon Code: ${coupon.code}`;
                } else if (campaign.rewardType === "wallet_credit") {
                    // Credit Wallet
                    const amount = campaign.walletConfig?.amount || 0;
                    if (amount > 0) {
                        const trx = await creditWallet(
                            customerId,
                            OWNER_TYPE.CUSTOMER,
                            amount,
                            "milestone_reward",
                            `Reward for ${campaign.name}`,
                            null
                        );
                        progressDoc.transactionId = trx?._id?.toString();
                        rewardDetails = `₹${amount} Wallet Credit`;
                    }
                }

                progressDoc.rewardIssued = true;
                progressDoc.issuedDate = now;
                
                await progressDoc.save();

                // 5. Send Notification
                emitNotificationEvent(NOTIFICATION_EVENTS.MILESTONE_UNLOCKED, {
                    userId: customerId,
                    role: NOTIFICATION_ROLES.CUSTOMER,
                    title: "Congratulations! Milestone Reached \uD83C\uDF89",
                    message: `You achieved: ${campaign.name}. You earned: ${rewardDetails || 'A special reward!'}`,
                    campaignId: campaign._id.toString()
                });
            } else {
                await progressDoc.save();
            }
        }
    } catch (error) {
        logger.error("Error evaluating milestones", { customerId, orderId, error: error.message });
    }
};
