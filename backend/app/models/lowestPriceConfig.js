import mongoose from "mongoose";

const lowestPriceConfigSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      default: "Lowest Price ever",
    },
    subtitle: {
      type: String,
      trim: true,
      default: "Unbeatable Savings • Updated hourly",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    mode: {
      type: String,
      enum: ["curated", "automatic"],
      default: "curated",
    },
    productIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    maxDisplayCount: {
      type: Number,
      default: 12,
      min: 1,
      max: 50,
    },
    backgroundColor: {
      type: String,
      trim: true,
      default: "#E6F3E6",
    },
    accentColor: {
      type: String,
      trim: true,
      default: "#1A4516",
    },
  },
  { timestamps: true }
);

lowestPriceConfigSchema.index({ status: 1 });

export default mongoose.model("LowestPriceConfig", lowestPriceConfigSchema);
