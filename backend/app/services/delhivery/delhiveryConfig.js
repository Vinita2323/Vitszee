import Setting from "../../models/setting.js";

/**
 * Resolves Delhivery configuration from environment variables and database settings.
 * Environment variables win over database settings.
 *
 * Delhivery (Express / B2C courier API):
 *   staging    https://staging-express.delhivery.com
 *   production https://track.delhivery.com
 * Auth is an account API token sent as `Authorization: Token <token>`.
 */
export async function getDelhiveryConfig() {
  let dbSettings = null;
  try {
    const settingDoc = await Setting.findOne().lean();
    dbSettings = settingDoc?.delhivery || {};
  } catch {
    dbSettings = {};
  }

  const environment = (process.env.DELHIVERY_ENVIRONMENT || dbSettings.environment || "production").toLowerCase();
  const isProduction = environment === "production";

  const defaultBaseUrl = isProduction
    ? "https://track.delhivery.com"
    : "https://staging-express.delhivery.com";

  const baseUrl = (process.env.DELHIVERY_BASE_URL || dbSettings.baseUrl || defaultBaseUrl).replace(/\/+$/, "");

  // Production uses its own token so switching environments never sends a staging
  // token to the live API (and vice versa).
  const apiToken = isProduction
    ? process.env.DELHIVERY_PROD_API_TOKEN || process.env.DELHIVERY_API_TOKEN || dbSettings.prodApiToken || ""
    : process.env.DELHIVERY_STAGING_API_TOKEN || dbSettings.stagingApiToken || "";

  const webhookSecret = isProduction
    ? process.env.DELHIVERY_WEBHOOK_PROD_SECRET || process.env.DELHIVERY_WEBHOOK_SECRET || dbSettings.webhookSecret || ""
    : process.env.DELHIVERY_WEBHOOK_SECRET || dbSettings.webhookSecret || "";

  // Name of the Delhivery client account (used for reference only in logs/admin).
  const clientName = process.env.DELHIVERY_CLIENT_NAME || dbSettings.clientName || "";

  // Warehouse used when a seller has no own pickup location registered yet.
  const fallbackPickupLocation =
    process.env.DELHIVERY_FALLBACK_PICKUP_LOCATION || dbSettings.fallbackPickupLocation || "";

  const boolEnv = (name, fallback) =>
    process.env[name] !== undefined ? String(process.env[name]).toLowerCase() === "true" : fallback;

  const forwardEnabled = boolEnv("DELHIVERY_FORWARD_ENABLED", dbSettings.forwardEnabled !== false);
  const autoServiceabilityCheck = boolEnv(
    "DELHIVERY_AUTO_SERVICEABILITY_CHECK",
    dbSettings.autoServiceabilityCheck !== false
  );
  const autoShipmentCreation = boolEnv("DELHIVERY_AUTO_SHIPMENT_CREATION", dbSettings.autoShipmentCreation !== false);
  // Register each seller's shop as a Delhivery pickup location (warehouse) on first dispatch.
  const autoRegisterSellerWarehouse = boolEnv(
    "DELHIVERY_AUTO_REGISTER_SELLER_WAREHOUSE",
    dbSettings.autoRegisterSellerWarehouse !== false
  );
  // Raise a pickup request after an order is manifested (needed when auto-pickup is OFF).
  const autoPickupRequest = boolEnv("DELHIVERY_AUTO_PICKUP_REQUEST", dbSettings.autoPickupRequest !== false);

  // Delhivery expects shipment weight in grams.
  const defaultWeightGrams = Number(process.env.DELHIVERY_DEFAULT_WEIGHT_GRAMS || dbSettings.defaultWeightGrams) || 500;
  // Time of day (24h, IST) used for the pickup request slot.
  const pickupTime = process.env.DELHIVERY_PICKUP_TIME || dbSettings.pickupTime || "16:00:00";
  // After this hour the pickup is requested for the next day instead of today.
  const pickupCutoffHour = Number(process.env.DELHIVERY_PICKUP_CUTOFF_HOUR || dbSettings.pickupCutoffHour) || 14;
  const shippingMode = process.env.DELHIVERY_SHIPPING_MODE || dbSettings.shippingMode || "Surface";

  const reconciliationIntervalMinutes = Number(dbSettings.reconciliationIntervalMinutes) || 15;

  return {
    environment: isProduction ? "production" : "staging",
    isProduction,
    baseUrl,
    apiToken,
    webhookSecret,
    clientName,
    fallbackPickupLocation,
    forwardEnabled,
    autoServiceabilityCheck,
    autoShipmentCreation,
    autoRegisterSellerWarehouse,
    autoPickupRequest,
    defaultWeightGrams,
    pickupTime,
    pickupCutoffHour,
    shippingMode,
    reconciliationIntervalMinutes,
  };
}

/**
 * Mask a secret for admin display.
 */
export function maskSecret(secret) {
  if (!secret || typeof secret !== "string") return "";
  if (secret.length <= 4) return "********";
  return `${secret.slice(0, 2)}****${secret.slice(-2)}`;
}

/**
 * Delhivery configuration without secrets, for the admin panel.
 */
export async function getAdminDelhiveryConfig() {
  const config = await getDelhiveryConfig();
  return {
    environment: config.environment,
    baseUrl: config.baseUrl,
    clientName: config.clientName,
    forwardEnabled: config.forwardEnabled,
    apiTokenMasked: maskSecret(config.apiToken),
    hasApiToken: Boolean(config.apiToken),
    hasWebhookSecret: Boolean(config.webhookSecret),
    fallbackPickupLocation: config.fallbackPickupLocation,
    autoServiceabilityCheck: config.autoServiceabilityCheck,
    autoShipmentCreation: config.autoShipmentCreation,
    autoRegisterSellerWarehouse: config.autoRegisterSellerWarehouse,
    autoPickupRequest: config.autoPickupRequest,
    defaultWeightGrams: config.defaultWeightGrams,
    pickupTime: config.pickupTime,
    pickupCutoffHour: config.pickupCutoffHour,
    shippingMode: config.shippingMode,
    reconciliationIntervalMinutes: config.reconciliationIntervalMinutes,
  };
}
