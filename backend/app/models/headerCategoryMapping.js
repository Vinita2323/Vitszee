import mongoose from "mongoose";

const headerCategoryMappingSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      unique: true,
    },
    customName: {
      type: String,
      trim: true,
    },
    iconId: {
      type: String,
      trim: true,
    },
    image: {
      type: String, // Cloudinary URL
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Populate category details when queried
headerCategoryMappingSchema.pre(/^find/, function (next) {
  this.populate({
    path: "categoryId",
    select: "name slug type status image iconId headerColor headerFontColor headerIconColor",
  });
  next();
});

export default mongoose.model("HeaderCategoryMapping", headerCategoryMappingSchema);
