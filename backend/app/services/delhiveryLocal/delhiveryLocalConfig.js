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

  // Client id + secret are tenant-specific (prod vs staging differ). The client code
  // is the same for both. Env wins over DB; a generic var is the last-resort fallback.
  const clientId = isProduction
    ? process.env.DELHIVERY_LOCAL_PROD_CLIENT_ID ||
      process.env.DELHIVERY_LOCAL_CLIENT_ID ||
      dbSettings.prodClientId ||
      dbSettings.clientId ||
      ""
    : process.env.DELHIVERY_LOCAL_STAGING_CLIENT_ID ||
      process.env.DELHIVERY_LOCAL_CLIENT_ID ||
      dbSettings.stagingClientId ||
      dbSettings.clientId ||
      "";
  const clientSecret = isProduction
    ? process.env.DELHIVERY_LOCAL_PROD_CLIENT_SECRET ||
      process.env.DELHIVERY_LOCAL_CLIENT_SECRET ||
      dbSettings.prodClientSecret ||
      dbSettings.clientSecret ||
      ""
    : process.env.DELHIVERY_LOCAL_STAGING_CLIENT_SECRET ||
      process.env.DELHIVERY_LOCAL_CLIENT_SECRET ||
      dbSettings.stagingClientSecret ||
      dbSettings.clientSecret ||
      "";
  const clientCode = process.env.DELHIVERY_LOCAL_CLIENT_CODE || dbSettings.clientCode || "";
  const audience = process.env.DELHIVERY_LOCAL_AUDIENCE || dbSettings.audience || "platform:app:coreos";

  // Quick (intracity) delivery is gated to Ahmedabad: an order qualifies only when BOTH
  // the seller pickup and customer drop pincodes are within these prefixes/pincodes.
  // Default prefix "380" = Ahmedabad city proper. Extend via env as Local coverage grows.
  const parseList = (value) =>
    String(value || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  const cityPincodePrefixes = (() => {
    const list = parseList(process.env.DELHIVERY_LOCAL_CITY_PINCODE_PREFIXES || dbSettings.cityPincodePrefixes);
    return list.length ? list : ["380", "382"];
  })();
  const cityPincodes = parseList(process.env.DELHIVERY_LOCAL_CITY_PINCODES || dbSettings.cityPincodes);

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
    cityPincodePrefixes,
    cityPincodes,
    hasCredentials: Boolean(clientId && clientSecret && clientCode),
  };
}

/**
 * True when a pincode is inside the quick-delivery (Ahmedabad) service area:
 * an exact match in `cityPincodes` or a prefix match in `cityPincodePrefixes`.
 */
export function isLocalCityPincode(pincode, config) {
  const pin = String(pincode || "").trim();
  if (!/^\d{6}$/.test(pin)) return false;
  if (Array.isArray(config?.cityPincodes) && config.cityPincodes.includes(pin)) return true;
  return Array.isArray(config?.cityPincodePrefixes) && config.cityPincodePrefixes.some((p) => pin.startsWith(p));
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
    cityPincodePrefixes: config.cityPincodePrefixes,
    cityPincodes: config.cityPincodes,
  };
}
