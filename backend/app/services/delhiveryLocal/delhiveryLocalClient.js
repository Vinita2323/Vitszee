import axios from "axios";
import crypto from "crypto";
import logger from "../logger.js";
import { getDelhiveryLocalConfig } from "./delhiveryLocalConfig.js";
import { getLocalAccessToken } from "./delhiveryLocalToken.js";
import {
  DelhiveryLocalError,
  DelhiveryLocalAuthError,
  DelhiveryLocalClientValidationError,
  DelhiveryLocalInvalidRequestError,
  DelhiveryLocalServiceabilityError,
  DelhiveryLocalTimeoutError,
  DelhiveryLocalConfigError,
} from "./delhiveryLocalErrors.js";

const DEFAULT_TIMEOUT_MS = 25000;

/**
 * Pulls a human message out of any Delhivery Local error body.
 * The CoreOS APIs answer with `{ success:false, error:{ code, message } }`.
 */
export function extractLocalErrorMessage(body, fallback = "Delhivery Local request failed.") {
  if (!body) return fallback;
  if (typeof body === "string") return body.trim() || fallback;
  if (body.error?.message) return String(body.error.message);
  if (body.message) return String(body.message);
  return fallback;
}

function sanitizeHeaders(headers) {
  const clone = { ...headers };
  for (const key of Object.keys(clone)) {
    if (/access|authorization|client-code|token|secret|api-key/i.test(key)) clone[key] = "REDACTED";
  }
  return clone;
}

function classifyError(status, body, fallbackMessage) {
  const message = extractLocalErrorMessage(body, fallbackMessage);
  if (status === 401) return new DelhiveryLocalAuthError(message, body);
  if (status === 403) return new DelhiveryLocalClientValidationError(message, body);
  if (status === 424) return new DelhiveryLocalServiceabilityError(message, body);
  if (status === 400 || status === 404 || status === 422) return new DelhiveryLocalInvalidRequestError(message, body);
  return new DelhiveryLocalError(message, "DELHIVERY_LOCAL_REQUEST_FAILED", status || 502, body);
}

/**
 * Executes an authenticated request against the Delhivery Local API.
 * Adds the CoreOS auth headers, retries once on a 401 by refreshing the token.
 *
 * @param {object}  options
 * @param {string}  options.method  HTTP method
 * @param {string}  options.path    Path, e.g. "/local/api/proxy/v1/shipper/orders/create"
 * @param {object} [options.json]   JSON request body
 * @param {number} [options.timeoutMs]
 */
export async function sendDelhiveryLocalRequest({ method = "POST", path, json = null, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const config = await getDelhiveryLocalConfig();
  if (!config.clientCode) {
    throw new DelhiveryLocalConfigError(
      "Delhivery Local client code is not configured. Set DELHIVERY_LOCAL_CLIENT_CODE."
    );
  }

  const url = `${config.baseUrl}/${String(path).replace(/^\/+/, "")}`;
  const requestId = crypto.randomUUID();

  const run = async (token) => {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-COREOS-ACCESS": token,
      "X-COREOS-REQUEST-ID": requestId,
      "X-CLIENT-CODE": config.clientCode,
    };

    logger.info(`[DelhiveryLocal] HTTP ${method} ${path}`, {
      requestId,
      headers: sanitizeHeaders(headers),
    });

    return axios({
      method,
      url,
      ...(json != null ? { data: json } : {}),
      headers,
      timeout: timeoutMs,
      validateStatus: (s) => s >= 200 && s < 300,
    });
  };

  let token = await getLocalAccessToken();

  try {
    const response = await run(token);
    logger.info(`[DelhiveryLocal] Response HTTP ${response.status} for ${path}`, { requestId });
    return { success: true, status: response.status, data: response.data, requestId };
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;

    // Token expired mid-flight (401): refresh once and retry.
    if (status === 401) {
      logger.warn(`[DelhiveryLocal] 401 on ${path}; refreshing token and retrying once`, { requestId });
      try {
        token = await getLocalAccessToken({ forceRefresh: true });
        const retry = await run(token);
        return { success: true, status: retry.status, data: retry.data, requestId };
      } catch (retryErr) {
        const rStatus = retryErr.response?.status;
        const rBody = retryErr.response?.data;
        logger.error(`[DelhiveryLocal] Retry after refresh failed HTTP ${rStatus} on ${path}`, { requestId });
        throw classifyError(rStatus, rBody, retryErr.message);
      }
    }

    const isTimeout = err.code === "ECONNABORTED" || /timeout/i.test(err.message || "");
    if (isTimeout) {
      throw new DelhiveryLocalTimeoutError("Delhivery Local request timed out.", { path });
    }

    logger.warn(`[DelhiveryLocal] Request failed HTTP ${status || "ERR"} on ${path}`, {
      requestId,
      error: err.message,
      body,
    });
    throw classifyError(status, body, err.message);
  }
}
