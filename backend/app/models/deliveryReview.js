import mongoose from "mongoose";

const deliveryReviewSchema = new mongoose.Schema(
    {
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            required: true,
        },
        customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        deliveryBoyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Delivery",
            required: true,
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        },
        comment: {
            type: String,
            trim: true,
            default: "",
        },
    },
    { timestamps: true }
);

// Prevent multiple reviews from the same customer for the same order
deliveryReviewSchema.index({ orderId: 1, customerId: 1 }, { unique: true });
// Index for fast querying of a delivery boy's reviews
deliveryReviewSchema.index({ deliveryBoyId: 1, createdAt: -1 });

export default mongoose.model("DeliveryReview", deliveryReviewSchema);
