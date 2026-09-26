import axios from "axios";
import crypto from "crypto";
import logger from "../logger.js";
import { getDelhiveryConfig } from "./delhiveryConfig.js";
import {
  DelhiveryAuthError,
  DelhiveryInvalidRequestError,
  DelhiveryRateLimitError,
  DelhiveryTimeoutError,
  DelhiveryError,
} from "./delhiveryErrors.js";

const DEFAULT_TIMEOUT_MS = 20000;
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 500;

/**
 * Redacts sensitive fields from objects before logging.
 */
function sanitizeLogPayload(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(clone)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("token") ||
      lowerKey.includes("authorization") ||
      lowerKey.includes("password") ||
      lowerKey.includes("secret")
    ) {
      clone[key] = "REDACTED";
    } else if (typeof clone[key] === "object" && clone[key] !== null) {
      clone[key] = sanitizeLogPayload(clone[key]);
    }
  }
  return clone;
}

/**
 * Builds a readable message out of any Delhivery error body. Delhivery answers with
 * `rmk`, `error`, `Error`, `detail`, `remarks` or per-package `remarks` arrays, and
 * often returns HTTP 200 with `success: false`.
 */
export function extractDelhiveryErrorMessage(body, fallback = "Delhivery request failed.") {
  if (!body) return fallback;
  if (typeof body === "string") return body.trim() || fallback;

  const flatten = (value) => {
    if (value == null || value === "") return [];
    if (typeof value === "string" || typeof value === "number") return [String(value)];
    if (Array.isArray(value)) return value.flatMap(flatten);
    if (typeof value === "object") return Object.values(value).flatMap(flatten);
    return [];
  };

  const packageRemarks = Array.isArray(body.packages)
    ? body.packages.flatMap((pkg) => flatten(pkg?.remarks)).filter(Boolean)
    : [];
  if (packageRemarks.length) return packageRemarks.join("; ");

  for (const key of ["rmk", "error", "Error", "detail", "message", "remark", "remarks", "pickup_location"]) {
    const value = body[key];
    const text = flatten(value).filter(Boolean).join("; ");
    if (text && text.toLowerCase() !== "false") return text;
  }
  return fallback;
}

/**
 * Executes an HTTP request against the Delhivery API with retries and timeout protection.
 *
 * @param {object}  options
 * @param {string}  options.method  HTTP method
 * @param {string}  options.path    Path on the Delhivery host, e.g. "/api/cmu/create.json"
 * @param {object} [options.params] Query string parameters
 * @param {object} [options.json]   JSON request body
 * @param {object} [options.form]   Form-encoded body (Delhivery's manifestation API needs this)
 */
export async function sendDelhiveryRequest({
  method = "POST",
  path,
  params = null,
  json = null,
  form = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const config = await getDelhiveryConfig();

  if (!config.apiToken) {
    throw new DelhiveryAuthError(
      "Delhivery API token is not configured. Set DELHIVERY_API_TOKEN (production) or DELHIVERY_STAGING_API_TOKEN."
    );
  }

  const url = `${config.baseUrl}/${String(path).replace(/^\/+/, "")}`;
  const requestId = `dlv-${crypto.randomUUID().slice(0, 8)}`;

  const headers = {
    Accept: "application/json",
    Authorization: `Token ${config.apiToken}`,
    ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };

  const data = form ? new URLSearchParams(form).toString() : json;

  let attempt = 0;
  let lastError = null;

  while (attempt <= MAX_RETRIES) {
    const startTime = Date.now();
    try {
      logger.info(`[Delhivery] HTTP ${method} ${path} (Attempt ${attempt + 1})`, {
        requestId,
        url,
        params,
        payload: sanitizeLogPayload(json || form),
      });

      const response = await axios({
        method,
        url,
        ...(data != null ? { data } : {}),
        params,
        headers,
        timeout: timeoutMs,
        validateStatus: (status) => status >= 200 && status < 300,
      });

      logger.info(`[Delhivery] Response HTTP ${response.status} in ${Date.now() - startTime}ms`, {
        requestId,
        status: response.status,
        response: sanitizeLogPayload(response.data),
      });

      return { success: true, status: response.status, data: response.data, headers: response.headers, requestId };
    } catch (err) {
      lastError = err;
      const httpStatus = err.response?.status;
      const responseData = err.response?.data;

      logger.warn(`[Delhivery] Request failed HTTP ${httpStatus || "ERR"} in ${Date.now() - startTime}ms`, {
        requestId,
        error: err.message,
        status: httpStatus,
        response: sanitizeLogPayload(responseData),
      });

      if (httpStatus === 401 || httpStatus === 403) {
        throw new DelhiveryAuthError(
          extractDelhiveryErrorMessage(responseData, "Delhivery authentication failed."),
          responseData
        );
      }

      if (httpStatus === 400 || httpStatus === 404 || httpStatus === 415 || httpStatus === 422) {
        throw new DelhiveryInvalidRequestError(
          extractDelhiveryErrorMessage(responseData, "Invalid request sent to Delhivery."),
          responseData
        );
      }

      if (httpStatus === 429) {
        throw new DelhiveryRateLimitError(
          extractDelhiveryErrorMessage(responseData, "Delhivery API rate limit exceeded."),
          responseData
        );
      }

      const isTimeout = err.code === "ECONNABORTED" || err.message?.includes("timeout");
      const isRetryable =
        !httpStatus || httpStatus >= 500 || isTimeout || err.code === "ENOTFOUND" || err.code === "ECONNRESET";

      if (!isRetryable || attempt >= MAX_RETRIES) {
        if (isTimeout) {
          throw new DelhiveryTimeoutError("Delhivery API request timed out.", responseData);
        }
        throw new DelhiveryError(
          extractDelhiveryErrorMessage(responseData, err.message || "Delhivery request failed."),
          "DELHIVERY_REQUEST_FAILED",
          httpStatus || 502,
          responseData
        );
      }

      attempt++;
      await new Promise((resolve) => setTimeout(resolve, INITIAL_BACKOFF_MS * Math.pow(2, attempt)));
    }
  }

  throw new DelhiveryError(
    lastError?.message || "Delhivery request failed after retries.",
    "DELHIVERY_RETRY_EXHAUSTED",
    502
  );
}
