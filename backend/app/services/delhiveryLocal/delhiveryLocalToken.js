import axios from "axios";
import crypto from "crypto";
import logger from "../logger.js";
import { getDelhiveryLocalConfig } from "./delhiveryLocalConfig.js";
import { DelhiveryLocalAuthError, DelhiveryLocalConfigError } from "./delhiveryLocalErrors.js";

const TOKEN_PATH = "/core/api/v1/aaa/auth/client-credentials";
const REFRESH_BUFFER_MS = 60 * 1000; // refresh a minute before expiry

// Cache keyed by `${authUrl}|${clientId}` so switching environment/credentials never
// serves a stale token. Value: { token, expiresAt }.
const tokenCache = new Map();
// In-flight mint promises, so concurrent callers share one request (single-flight).
const inFlight = new Map();

async function mintToken(config, cacheKey) {
  const url = `${config.authUrl}${TOKEN_PATH}`;
  const requestId = `dlvl-auth-${crypto.randomUUID().slice(0, 8)}`;

  try {
    logger.info("[DelhiveryLocal] Minting CoreOS access token", { requestId, clientId: config.clientId });
    const response = await axios({
      method: "POST",
      url,
      data: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        audience: config.audience,
      },
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-COREOS-REQUEST-ID": crypto.randomUUID(),
      },
      timeout: 20000,
      validateStatus: (s) => s >= 200 && s < 300,
    });

    const data = response.data?.data || {};
    const token = data.accessToken;
    const expiresInSec = Number(data.expiresIn) || 86400;
    if (!token) {
      throw new DelhiveryLocalAuthError("Delhivery Local auth returned no access token.", response.data);
    }

    const expiresAt = Date.now() + expiresInSec * 1000 - REFRESH_BUFFER_MS;
    tokenCache.set(cacheKey, { token, expiresAt });
    logger.info("[DelhiveryLocal] Access token minted", { requestId, expiresInSec });
    return token;
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    const message =
      body?.error?.message || body?.message || err.message || "Delhivery Local authentication failed.";
    logger.error("[DelhiveryLocal] Token mint failed", { requestId, status, error: message });
    throw new DelhiveryLocalAuthError(message, body || { error: err.message });
  }
}

/**
 * Returns a valid CoreOS access token, minting or refreshing as needed.
 * @param {object} [opts]
 * @param {boolean} [opts.forceRefresh] Ignore the cache (used after a 401).
 */
export async function getLocalAccessToken({ forceRefresh = false } = {}) {
  const config = await getDelhiveryLocalConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new DelhiveryLocalConfigError(
      "Delhivery Local credentials are not configured. Set DELHIVERY_LOCAL_CLIENT_ID and DELHIVERY_LOCAL_CLIENT_SECRET."
    );
  }

  const cacheKey = `${config.authUrl}|${config.clientId}`;

  if (!forceRefresh) {
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.token;
  } else {
    tokenCache.delete(cacheKey);
  }

  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const promise = mintToken(config, cacheKey).finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, promise);
  return promise;
}

/** Clears cached tokens (test helper / manual invalidation). */
export function clearLocalTokenCache() {
  tokenCache.clear();
  inFlight.clear();
}
