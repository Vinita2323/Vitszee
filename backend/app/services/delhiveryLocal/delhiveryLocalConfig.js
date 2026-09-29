import Setting from "../../models/setting.js";

/**
 * Configuration for the Delhivery Direct Intracity ("Local" / quick-delivery) API.
 *
 * This is a different platform from the Delhivery Express / B2C courier API
 * (see ../delhivery/*). It runs on Delhivery's CoreOS gateway:
 *   production  https://ztietgya0i.logistax.io
 *   sandbox     https://delvjkninl.sandbox.getos1.com
 *
 * Auth is a two-step flow:
 *   1. POST /core/api/v1/aaa/auth/client-credentials  -> Bearer access token (24h)
 *   2. Every call sends  X-COREOS-ACCESS: <token>,  X-CLIENT-CODE: <clientCode>,
 *      X-COREOS-REQUEST-ID: <uuid>
 *
 * Delhivery issues the Client ID, Client Secret and Client Code per account.
 */
export async function getDelhiveryLocalConfig() {
  let dbSettings = null;
  try {
    const settingDoc = await Setting.findOne().lean();
    dbSettings = settingDoc?.delhiveryLocal || {};
  } catch {
    dbSettings = {};
  }

  const environment = (
    process.env.DELHIVERY_LOCAL_ENVIRONMENT ||
    dbSettings.environment ||
    "production"
  ).toLowerCase();
  const isProduction = environment === "production";

  const defaultBaseUrl = isProduction
    ? "https://ztietgya0i.logistax.io"
    : "https://delvjkninl.sandbox.getos1.com";

  const baseUrl = (process.env.DELHIVERY_LOCAL_BASE_URL || dbSettings.baseUrl || defaultBaseUrl).replace(/\/+$/, "");

  const authUrl = (process.env.DELHIVERY_LOCAL_AUTH_URL || dbSettings.authUrl || baseUrl).replace(/\/+$/, "");

  const clientId = process.env.DELHIVERY_LOCAL_CLIENT_ID || dbSettings.clientId || "";
  const clientSecret = process.env.DELHIVERY_LOCAL_CLIENT_SECRET || dbSettings.clientSecret || "";
  const clientCode = process.env.DELHIVERY_LOCAL_CLIENT_CODE || dbSettings.clientCode || "";
  const audience = process.env.DELHIVERY_LOCAL_AUDIENCE || dbSettings.audience || "platform:app:coreos";

  // Public URL Delhivery calls with fulfilment webhooks. A webhook URL is mandatory
  // on every create-order request, so this must be reachable from the internet.
  const webhookUrl =
    process.env.DELHIVERY_LOCAL_WEBHOOK_URL ||
    dbSettings.webhookUrl ||
    "https://vitszee.com/api/delhivery/local-webhook";

  // Authenticate inbound webhooks with either an echoed API key (X-Api-Key) or a
  // base64 signature key (X-WEBHOOK-SIGNATURE). At least one is sent on create.
  const webhookApiKey = process.env.DELHIVERY_LOCAL_WEBHOOK_API_KEY || dbSettings.webhookApiKey || "";
  const webhookSignatureKey =
    process.env.DELHIVERY_LOCAL_WEBHOOK_SIGNATURE_KEY || dbSettings.webhookSignatureKey || "";

  const boolEnv = (name, fallback) =>
    process.env[name] !== undefined ? String(process.env[name]).toLowerCase() === "true" : fallback;

  // Master switch: when true, order dispatch uses Local (quick) delivery instead of
  // the Express courier flow. Off by default until Delhivery confirms the client code.
  const enabled = boolEnv("DELHIVERY_LOCAL_ENABLED", dbSettings.enabled === true);

  // Vehicle requested for pickup. Valid: 2-wheeler, 3-wheeler, tata-ace, mini-3w, 8ft-pickup.
  const defaultVehicleMode =
    process.env.DELHIVERY_LOCAL_VEHICLE_MODE || dbSettings.defaultVehicleMode || "2-wheeler";

  // readyToShip=true starts fulfilment immediately; false requires a later confirm call.
  const readyToShip = boolEnv("DELHIVERY_LOCAL_READY_TO_SHIP", dbSettings.readyToShip !== false);

  const autoServiceabilityCheck = boolEnv(
    "DELHIVERY_LOCAL_AUTO_SERVICEABILITY_CHECK",
    dbSettings.autoServiceabilityCheck !== false
  );

  return {
    environment: isProduction ? "production" : "sandbox",
    isProduction,
    baseUrl,
    authUrl,
    clientId,
    clientSecret,
    clientCode,
    audience,
    webhookUrl,
    webhookApiKey,
    webhookSignatureKey,
    enabled,
    defaultVehicleMode,
    readyToShip,
    autoServiceabilityCheck,
    hasCredentials: Boolean(clientId && clientSecret && clientCode),
  };
}

function maskSecret(secret) {
  if (!secret || typeof secret !== "string") return "";
  if (secret.length <= 6) return "********";
  return `${secret.slice(0, 3)}****${secret.slice(-3)}`;
}

/**
 * Local config without secrets, for the admin panel.
 */
export async function getAdminDelhiveryLocalConfig() {
  const config = await getDelhiveryLocalConfig();
  return {
    environment: config.environment,
    baseUrl: config.baseUrl,
    enabled: config.enabled,
    clientId: config.clientId,
    clientCode: config.clientCode,
    clientSecretMasked: maskSecret(config.clientSecret),
    hasCredentials: config.hasCredentials,
    webhookUrl: config.webhookUrl,
    hasWebhookApiKey: Boolean(config.webhookApiKey),
    hasWebhookSignatureKey: Boolean(config.webhookSignatureKey),
    defaultVehicleMode: config.defaultVehicleMode,
    readyToShip: config.readyToShip,
    autoServiceabilityCheck: config.autoServiceabilityCheck,
  };
}
