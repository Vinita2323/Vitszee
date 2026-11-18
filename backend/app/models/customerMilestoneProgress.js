import mongoose from "mongoose";

const customerMilestoneProgressSchema = new mongoose.Schema(
    {
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        campaign: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MilestoneCampaign",
            required: true,
        },
        currentProgress: {
            type: Number,
            default: 0,
        },
        isCompleted: {
            type: Boolean,
            default: false,
        },
        rewardIssued: {
            type: Boolean,
            default: false,
        },
        rewardClaimed: {
            type: Boolean,
            default: false,
        },
        issuedDate: {
            type: Date,
        },
        // If the reward was a coupon
        couponId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Coupon",
        },
        // If the reward was wallet credit, store the ledger entry or transaction id
        transactionId: {
            type: String,
        },
    },
    { timestamps: true }
);

// Unique compound index to prevent duplicate rewards for the same campaign per user
customerMilestoneProgressSchema.index({ customer: 1, campaign: 1 }, { unique: true });

export default mongoose.model("CustomerMilestoneProgress", customerMilestoneProgressSchema);
