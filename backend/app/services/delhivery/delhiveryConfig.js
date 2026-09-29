function flag(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1";
}

export function getDelhiveryConfig() {
  const environment =
    String(process.env.DELHIVERY_ENVIRONMENT || "staging").toLowerCase() === "production"
      ? "production"
      : "staging";

  const baseUrl =
    environment === "production"
      ? "https://track.delhivery.com"
      : "https://staging-express.delhivery.com";

  const apiToken =
    environment === "production"
      ? process.env.DELHIVERY_API_TOKEN || ""
      : process.env.DELHIVERY_STAGING_API_TOKEN || process.env.DELHIVERY_API_TOKEN || "";

  return {
    environment,
    baseUrl,
    apiToken: String(apiToken).trim(),
    forwardEnabled: flag("DELHIVERY_FORWARD_ENABLED"),
    clientName: String(process.env.DELHIVERY_CLIENT_NAME || "").trim(),
    fallbackPickupLocation: String(process.env.DELHIVERY_FALLBACK_PICKUP_LOCATION || "").trim(),
    autoShipmentCreation: flag("DELHIVERY_AUTO_SHIPMENT_CREATION", true),
    autoServiceabilityCheck: flag("DELHIVERY_AUTO_SERVICEABILITY_CHECK", true),
    autoRegisterSellerWarehouse: flag("DELHIVERY_AUTO_REGISTER_SELLER_WAREHOUSE", true),
    autoPickupRequest: flag("DELHIVERY_AUTO_PICKUP_REQUEST", true),
    defaultWeightGrams: Number(process.env.DELHIVERY_DEFAULT_WEIGHT_GRAMS) || 500,
    shippingMode: String(process.env.DELHIVERY_SHIPPING_MODE || "Express").trim() || "Express",
    pickupTime: String(process.env.DELHIVERY_PICKUP_TIME || "16:00:00").trim() || "16:00:00",
    pickupCutoffHour: Number(process.env.DELHIVERY_PICKUP_CUTOFF_HOUR || 14),
  };
}
