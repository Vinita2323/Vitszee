import mongoose from "mongoose";

const birthdayRewardHistorySchema = new mongoose.Schema(
    {
        recipientId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "role",
        },
        role: {
            type: String,
            enum: ["User", "Seller", "Delivery"],
            required: true,
        },
        rewardType: {
            type: String,
            required: true,
        },
        rewardValue: {
            type: Number,
            default: 0,
        },
        message: {
            type: String,
            trim: true,
        },
        sentBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
        sentDate: {
            type: Date,
            default: Date.now,
        },
        redeemedStatus: {
            type: Boolean,
            default: false,
        },
        year: {
            type: Number,
            required: true,
        },
    },
    { timestamps: true }
);

// Ensure only one reward per user per year
birthdayRewardHistorySchema.index({ recipientId: 1, role: 1, year: 1 }, { unique: true });

export default mongoose.model("BirthdayRewardHistory", birthdayRewardHistorySchema);
