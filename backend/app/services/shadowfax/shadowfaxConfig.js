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
  const forwardToken =
    process.env.SHADOWFAX_FORWARD_TOKEN || dbSettings.forwardToken || "";

  const reverseToken =
    process.env.SHADOWFAX_REVERSE_TOKEN ||
    dbSettings.reverseToken ||
    forwardToken ||
    "";

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
    clientCode,
    forwardEnabled,
    reverseEnabled,
    autoServiceabilityCheck,
    autoShipmentCreation,
    autoDispatchReady,
    qcEnabled,
    reconciliationIntervalMinutes,
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
    autoServiceabilityCheck: config.autoServiceabilityCheck,
    autoShipmentCreation: config.autoShipmentCreation,
    autoDispatchReady: config.autoDispatchReady,
    qcEnabled: config.qcEnabled,
    reconciliationIntervalMinutes: config.reconciliationIntervalMinutes,
  };
}
