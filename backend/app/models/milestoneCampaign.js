import mongoose from "mongoose";

const milestoneCampaignSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        triggerType: {
            type: String,
            required: true,
            enum: [
                "total_orders",
                "total_products",
                "total_spending",
                "category_purchase",
                "brand_purchase",
                "first_order",
                "account_anniversary",
            ],
        },
        targetValue: {
            type: Number,
            required: true,
            min: 1,
        },
        // For category_purchase or brand_purchase
        targetRef: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "targetModel",
        },
        targetModel: {
            type: String,
            enum: ["Category", "Brand"],
        },
        rewardType: {
            type: String,
            required: true,
            enum: [
                "percentage_discount",
                "flat_discount",
                "free_delivery",
                "free_product",
                "wallet_credit",
                "loyalty_points",
            ],
        },
        // Coupon Configuration (If reward generates a coupon)
        couponConfig: {
            discountValue: Number,
            maxDiscount: Number,
            minOrderValue: Number,
            applicableCategories: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Category",
                },
            ],
            usageLimitPerUser: {
                type: Number,
                default: 1,
            },
            validityDays: {
                type: Number,
                default: 30, // Coupon is valid for 30 days from issue
            },
        },
        // Wallet Credit Configuration
        walletConfig: {
            amount: Number,
        },
        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active",
        },
        startDate: {
            type: Date,
            default: Date.now,
        },
        endDate: {
            type: Date,
        },
        metadata: {
            type: Object,
        },
    },
    { timestamps: true }
);

// Index for fast evaluation
milestoneCampaignSchema.index({ status: 1, triggerType: 1 });

export default mongoose.model("MilestoneCampaign", milestoneCampaignSchema);
