import Setting from "../../models/setting.js";

/**
 * Resolves Shadowfax configuration from database settings and environment variables.
 * Environment variables override database settings if provided.
 */
export async function getShadowfaxConfig() {
  let dbSettings = null;
  try {
    const settingDoc = await Setting.findOne().lean();
    dbSettings = settingDoc?.shadowfax || {};
  } catch {
    dbSettings = {};
  }

  const envEnvironment = (process.env.SHADOWFAX_ENVIRONMENT || dbSettings.environment || "sandbox").toLowerCase();
  const isProduction = envEnvironment === "production";

  // Base URLs
  const defaultForwardBaseUrl = isProduction
    ? "https://dale.shadowfax.in"
    : "https://dale.staging.shadowfax.in";

  const defaultReverseBaseUrl = isProduction
    ? "https://dale.shadowfax.in"
    : "https://dale.staging.shadowfax.in";

  const forwardBaseUrl = (
    process.env.SHADOWFAX_FORWARD_BASE_URL ||
    dbSettings.forwardBaseUrl ||
    defaultForwardBaseUrl
  ).replace(/\/+$/, "");

  const reverseBaseUrl = (
    process.env.SHADOWFAX_REVERSE_BASE_URL ||
    dbSettings.reverseBaseUrl ||
    defaultReverseBaseUrl
  ).replace(/\/+$/, "");

  // Tokens & Client Code
  // In production, prefer the dedicated *_PROD_TOKEN vars so switching
  // SHADOWFAX_ENVIRONMENT doesn't accidentally send staging tokens to the live API.
  const forwardToken = isProduction
    ? process.env.SHADOWFAX_FORWARD_PROD_TOKEN || dbSettings.forwardProdToken || ""
    : process.env.SHADOWFAX_FORWARD_TOKEN || dbSettings.forwardToken || "";

  const reverseToken = isProduction
    ? process.env.SHADOWFAX_REVERSE_PROD_TOKEN || dbSettings.reverseProdToken || forwardToken || ""
    : process.env.SHADOWFAX_REVERSE_TOKEN || dbSettings.reverseToken || forwardToken || "";

  // Shadowfax configures a separate callback secret per environment, so production
  // prefers SHADOWFAX_WEBHOOK_PROD_SECRET (falling back to the shared variable).
  const webhookSecret = isProduction
    ? process.env.SHADOWFAX_WEBHOOK_PROD_SECRET || process.env.SHADOWFAX_WEBHOOK_SECRET || dbSettings.webhookSecret || ""
    : process.env.SHADOWFAX_WEBHOOK_SECRET || dbSettings.webhookSecret || "";

  // Shadowfax expects weights in grams (actual_weight / volumetric_weight).
  const defaultWeightGrams = Number(process.env.SHADOWFAX_DEFAULT_WEIGHT_GRAMS) || 500;

  // Fake "sandbox simulation" responses hide real API failures, so they are opt-in.
  const simulationEnabled =
    !isProduction && String(process.env.SHADOWFAX_SANDBOX_SIMULATION || "").toLowerCase() === "true";

  const clientCode =
    process.env.SHADOWFAX_CLIENT_CODE || dbSettings.clientCode || "";

  const forwardEnabled =
    process.env.SHADOWFAX_FORWARD_ENABLED !== undefined
      ? String(process.env.SHADOWFAX_FORWARD_ENABLED).toLowerCase() === "true"
      : Boolean(dbSettings.forwardEnabled);

  const reverseEnabled =
    process.env.SHADOWFAX_REVERSE_ENABLED !== undefined
      ? String(process.env.SHADOWFAX_REVERSE_ENABLED).toLowerCase() === "true"
      : Boolean(dbSettings.reverseEnabled);

  const autoServiceabilityCheck =
    dbSettings.autoServiceabilityCheck !== undefined
      ? Boolean(dbSettings.autoServiceabilityCheck)
      : true;

  const autoShipmentCreation =
    dbSettings.autoShipmentCreation !== undefined
      ? Boolean(dbSettings.autoShipmentCreation)
      : true;

  const autoDispatchReady =
    dbSettings.autoDispatchReady !== undefined
      ? Boolean(dbSettings.autoDispatchReady)
      : true;

  const qcEnabled =
    dbSettings.qcEnabled !== undefined ? Boolean(dbSettings.qcEnabled) : true;

  const reconciliationIntervalMinutes =
    Number(dbSettings.reconciliationIntervalMinutes) || 15;

  return {
    environment: isProduction ? "production" : "sandbox",
    isProduction,
    forwardBaseUrl,
    reverseBaseUrl,
    forwardToken,
    reverseToken,
    webhookSecret,
    clientCode,
    forwardEnabled,
    reverseEnabled,
    autoServiceabilityCheck,
    autoShipmentCreation,
    autoDispatchReady,
    qcEnabled,
    reconciliationIntervalMinutes,
    defaultWeightGrams,
    simulationEnabled,
  };
}

/**
 * Mask sensitive token for admin UI display.
 */
export function maskSecret(secret) {
  if (!secret || typeof secret !== "string") return "";
  if (secret.length <= 4) return "********";
  return `${secret.slice(0, 2)}****${secret.slice(-2)}`;
}

/**
 * Returns safe Shadowfax configuration for Admin panel display.
 */
export async function getAdminShadowfaxConfig() {
  const config = await getShadowfaxConfig();
  return {
    forwardEnabled: config.forwardEnabled,
    reverseEnabled: config.reverseEnabled,
    environment: config.environment,
    forwardBaseUrl: config.forwardBaseUrl,
    reverseBaseUrl: config.reverseBaseUrl,
    clientCode: config.clientCode,
    forwardTokenMasked: maskSecret(config.forwardToken),
    reverseTokenMasked: maskSecret(config.reverseToken),
    hasForwardToken: Boolean(config.forwardToken),
    hasReverseToken: Boolean(config.reverseToken),
    hasWebhookSecret: Boolean(config.webhookSecret),
    autoServiceabilityCheck: config.autoServiceabilityCheck,
    autoShipmentCreation: config.autoShipmentCreation,
    autoDispatchReady: config.autoDispatchReady,
    qcEnabled: config.qcEnabled,
    reconciliationIntervalMinutes: config.reconciliationIntervalMinutes,
  };
}
