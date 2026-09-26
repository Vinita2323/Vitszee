import mongoose from "mongoose";

const shipmentSchema = new mongoose.Schema(
  {
    orderMongoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    internalOrderId: {
      type: String,
      required: true,
      index: true,
    },
    deliveryProvider: {
      type: String,
      // "shadowfax" is kept only so shipment records created before the Delhivery
      // migration still validate; nothing writes it any more.
      enum: ["delhivery", "internal", "shadowfax"],
      default: "delhivery",
      index: true,
    },
    providerType: {
      type: String,
      enum: ["forward", "reverse"],
      default: "forward",
      index: true,
    },
    // Delhivery pickup location (warehouse) this parcel is collected from.
    pickupLocationName: {
      type: String,
      trim: true,
    },
    // Pickup request raised with Delhivery so the parcel gets collected.
    pickupRequestId: {
      type: String,
      trim: true,
    },
    // Delhivery's manifestation batch reference (upload_wbn).
    delhiveryUploadWbn: {
      type: String,
      trim: true,
    },
    clientOrderId: {
      type: String,
      index: true,
      sparse: true,
    },
    clientRequestId: {
      type: String,
      index: true,
      sparse: true,
    },
    awbNumber: {
      type: String,
      index: true,
      sparse: true,
    },
    shipmentStatus: {
      type: String,
      enum: [
        "PENDING",
        "SERVICEABILITY_CHECKED",
        "ORDER_CREATED",
        "DISPATCH_READY",
        "RIDER_ASSIGNED",
        "RIDER_ARRIVED",
        "PICKED_UP",
        "IN_TRANSIT",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "CANCELLED",
        "FAILED",
        "RETURN_REQUESTED",
        "RETURN_RIDER_ASSIGNED",
        "RETURN_QC_IN_PROGRESS",
        "RETURN_QC_PASSED",
        "RETURN_QC_FAILED",
        "RETURN_PICKED_UP",
        "RETURN_RECEIVED",
        "RETURN_CANCELLED",
      ],
      default: "PENDING",
      index: true,
    },
    providerStatus: {
      type: String,
      default: null,
    },
    serviceabilityStatus: {
      type: String,
      enum: ["unverified", "serviceable", "unserviceable", "failed"],
      default: "unverified",
    },
    serviceabilityDetails: {
      service: String,
      estimatedDeliveryTime: Date,
      quote: mongoose.Schema.Types.Mixed,
      checkedAt: Date,
    },
    deliveryOtpEnabled: {
      type: Boolean,
      default: false,
    },
    deliveryOtp: {
      type: String,
      default: null,
    },
    pickupDetails: {
      name: String,
      phone: String,
      contact: String,
      address: String,
      addressLine1: String,
      addressLine2: String,
      city: String,
      state: String,
      pincode: String,
      latitude: Number,
      longitude: Number,
    },
    dropDetails: {
      name: String,
      phone: String,
      contact: String,
      address: String,
      addressLine1: String,
      addressLine2: String,
      city: String,
      state: String,
      pincode: String,
      latitude: Number,
      longitude: Number,
      instructions: String,
    },
    rider: {
      id: String,
      name: String,
      phone: String,
      latitude: Number,
      longitude: Number,
      lastLocationAt: Date,
    },
    qcDetails: {
      qcRequired: {
        type: Boolean,
        default: false,
      },
      qcStatus: {
        type: String,
        enum: ["NOT_REQUIRED", "PENDING", "IN_PROGRESS", "PASSED", "FAILED"],
        default: "NOT_REQUIRED",
      },
      qcResult: {
        type: String,
        default: null,
      },
      qcFailedReason: {
        type: String,
        default: null,
      },
      qcRules: [
        {
          type: {
            type: String,
            required: true,
          },
          expected: mongoose.Schema.Types.Mixed,
          description: String,
        },
      ],
      qcImages: [{ type: String }],
      qcVerifiedBy: String,
      qcTimestamp: Date,
    },
    dispatchReadyAt: Date,
    pickedUpAt: Date,
    arrivedAt: Date,
    deliveredAt: Date,
    cancelledAt: Date,
    failedAt: Date,
    failureReason: String,
    lastProviderResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    lastProviderSyncAt: Date,
    retryCount: {
      type: Number,
      default: 0,
    },
    environment: {
      type: String,
      enum: ["sandbox", "production"],
      default: "sandbox",
    },
    timeline: [
      {
        status: String,
        providerStatus: String,
        description: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        source: {
          type: String,
          enum: ["api", "webhook", "reconciliation", "manual"],
          default: "api",
        },
        metadata: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  {
    timestamps: true,
  }
);

shipmentSchema.index({ internalOrderId: 1, providerType: 1 });
shipmentSchema.index({ deliveryProvider: 1, shipmentStatus: 1 });
shipmentSchema.index({ lastProviderSyncAt: 1, shipmentStatus: 1 });

export default mongoose.model("Shipment", shipmentSchema);
