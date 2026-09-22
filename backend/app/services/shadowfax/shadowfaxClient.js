import axios from "axios";
import crypto from "crypto";
import logger from "../logger.js";
import { getShadowfaxConfig } from "./shadowfaxConfig.js";
import {
  ShadowfaxAuthError,
  ShadowfaxInvalidRequestError,
  ShadowfaxRateLimitError,
  ShadowfaxTimeoutError,
  ShadowfaxError,
} from "./shadowfaxErrors.js";

const DEFAULT_TIMEOUT_MS = 15000;
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
      lowerKey.includes("secret") ||
      lowerKey.includes("otp")
    ) {
      clone[key] = "REDACTED";
    } else if (typeof clone[key] === "object" && clone[key] !== null) {
      clone[key] = sanitizeLogPayload(clone[key]);
    }
  }
  return clone;
}

/**
 * Builds a readable message from any Shadowfax error body. Shadowfax uses
 * `message`, `responseMsg`, `errors` (string, array or nested object) and `detail`.
 */
export function extractShadowfaxErrorMessage(body, fallback = "Shadowfax request failed.") {
  if (!body || typeof body !== "object") {
    return typeof body === "string" && body.trim() ? body.trim() : fallback;
  }

  const flatten = (value, prefix = "") => {
    if (value == null || value === "") return [];
    if (typeof value === "string" || typeof value === "number") {
      return [prefix ? `${prefix}: ${value}` : String(value)];
    }
    if (Array.isArray(value)) return value.flatMap((item) => flatten(item, prefix));
    if (typeof value === "object") {
      return Object.entries(value).flatMap(([key, nested]) =>
        flatten(nested, prefix ? `${prefix}.${key}` : key)
      );
    }
    return [];
  };

  const errors = flatten(body.errors);
  if (errors.length) return errors.join("; ");

  const message = body.responseMsg || body.detail || body.error || body.message;
  if (message && !["failure", "failed"].includes(String(message).toLowerCase())) {
    return String(message);
  }
  return fallback;
}

/**
 * Simulated responses for offline sandbox testing (SHADOWFAX_SANDBOX_SIMULATION=true only).
 * Shapes follow the documented Shadowfax responses so callers parse them like real ones.
 */
function generateSandboxSimulation({ method, endpoint, type, data, params }) {
  const normEndpoint = String(endpoint || "").toLowerCase();
  const requestId = `sfx-sim-${crypto.randomUUID().slice(0, 8)}`;
  const simulated = (body) => ({ success: true, status: 200, data: body, headers: {}, requestId, simulated: true });

  if (normEndpoint.includes("serviceability")) {
    if (method === "GET") {
      const pincodes = String(params?.pincodes || "").split(",").map((p) => p.trim()).filter(Boolean);
      return simulated(pincodes.map((code) => ({ code: Number(code), services: ["Regular"] })));
    }
    return simulated({ serviceable: true, status: "success", message: "Serviceable (Sandbox Simulation)" });
  }

  if (normEndpoint.includes("orders/cancel") || normEndpoint.includes("requests/cancel")) {
    return simulated({ responseMsg: "Request has been marked as cancelled", responseCode: 200 });
  }

  if (normEndpoint.includes("order_update")) {
    return simulated({ message: "Request accepted." });
  }

  if (normEndpoint.includes("/track")) {
    const awb = normEndpoint.split("/orders/")[1]?.split("/")[0] || "";
    return simulated({ message: "Success", order_details: { awb_number: awb, status: "new" }, tracking_details: [] });
  }

  if (type === "reverse" || normEndpoint.includes("requests")) {
    const randomDigits = Math.floor(1000000000 + Math.random() * 9000000000);
    return {
      success: true,
      status: 200,
      data: {
        status: "success",
        request_id: `SFX-REV-${Date.now().toString().slice(-6)}`,
        awb_number: `AWB-REV-${randomDigits}`,
        message: "Reverse pickup request created (Sandbox Simulation)",
      },
      headers: {},
      requestId,
      simulated: true,
    };
  }

  // Forward Order Creation
  const randomDigits = Math.floor(1000000000 + Math.random() * 9000000000);
  return simulated({
    message: "Success",
    errors: null,
    data: {
      id: Number(Date.now().toString().slice(-8)),
      client_order_id: data?.order_details?.client_order_id,
      awb_number: `SIM${randomDigits}`,
      status: "new",
    },
  });
}

/**
 * Execute HTTP request to Shadowfax with retries and timeout protection.
 */
export async function sendShadowfaxRequest({
  method = "POST",
  endpoint,
  type = "forward", // "forward" | "reverse"
  data = null,
  params = null,
  customHeaders = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  overrideToken = null,
  overrideBaseUrl = null,
}) {
  const config = await getShadowfaxConfig();
  const simulate = config.simulationEnabled;
  const baseUrl = overrideBaseUrl || (type === "reverse" ? config.reverseBaseUrl : config.forwardBaseUrl);
  const token = overrideToken || (type === "reverse" ? config.reverseToken : config.forwardToken);

  if (!token && !simulate) {
    throw new ShadowfaxAuthError(
      `Shadowfax ${type} token is not configured. Please check environment variables or Admin Settings.`
    );
  }

  const url = `${(baseUrl || "https://dale.staging.shadowfax.in").replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
  const requestId = `sfx-${crypto.randomUUID().slice(0, 8)}`;

  const headers = {
    ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
    Accept: "application/json",
    Authorization: `Token ${token || "sandbox_token"}`,
    "X-Request-Id": requestId,
    ...customHeaders,
  };

  let attempt = 0;
  let lastError = null;

  while (attempt <= MAX_RETRIES) {
    const startTime = Date.now();
    try {
      logger.info(`[Shadowfax] HTTP ${method} ${endpoint} (Attempt ${attempt + 1})`, {
        requestId,
        type,
        url,
        params,
        payload: sanitizeLogPayload(data),
      });

      const response = await axios({
        method,
        url,
        ...(method !== "GET" ? { data } : {}),
        params,
        headers,
        timeout: timeoutMs,
        validateStatus: (status) => status >= 200 && status < 300,
      });

      const durationMs = Date.now() - startTime;
      logger.info(`[Shadowfax] Response HTTP ${response.status} in ${durationMs}ms`, {
        requestId,
        status: response.status,
        response: sanitizeLogPayload(response.data),
      });

      return {
        success: true,
        status: response.status,
        data: response.data,
        headers: response.headers,
        requestId,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      lastError = err;

      const httpStatus = err.response?.status;
      const responseData = err.response?.data;

      logger.warn(`[Shadowfax] Request failed HTTP ${httpStatus || "ERR"} in ${durationMs}ms`, {
        requestId,
        error: err.message,
        status: httpStatus,
        response: sanitizeLogPayload(responseData),
      });

      // Opt-in offline testing only (SHADOWFAX_SANDBOX_SIMULATION=true, never in production).
      if (simulate && (httpStatus === 404 || httpStatus === 401 || !httpStatus || httpStatus >= 500)) {
        logger.info(`[Shadowfax Sandbox] External staging returned HTTP ${httpStatus || "ERR"}. Using Sandbox Simulation.`);
        return generateSandboxSimulation({ method, endpoint, type, data, params });
      }

      // Handle Non-Retryable Client Errors (400, 401, 403, 404, 422)
      if (httpStatus === 401 || httpStatus === 403) {
        throw new ShadowfaxAuthError(
          extractShadowfaxErrorMessage(responseData, "Shadowfax authentication failed."),
          responseData
        );
      }

      if (httpStatus === 400 || httpStatus === 422) {
        throw new ShadowfaxInvalidRequestError(
          extractShadowfaxErrorMessage(responseData, "Invalid request sent to Shadowfax."),
          responseData
        );
      }

      if (httpStatus === 429) {
        throw new ShadowfaxRateLimitError(
          responseData?.message || "Shadowfax API rate limit exceeded.",
          responseData
        );
      }

      const isTimeout = err.code === "ECONNABORTED" || err.message?.includes("timeout");
      const isRetryableNetwork =
        !httpStatus || httpStatus >= 500 || isTimeout || err.code === "ENOTFOUND" || err.code === "ECONNRESET";

      if (!isRetryableNetwork || attempt >= MAX_RETRIES) {
        if (isTimeout) {
          throw new ShadowfaxTimeoutError("Shadowfax API request timed out.", responseData);
        }
        throw new ShadowfaxError(
          extractShadowfaxErrorMessage(responseData, err.message || "Shadowfax request failed."),
          "SHADOWFAX_REQUEST_FAILED",
          httpStatus || 502,
          responseData
        );
      }

      // Exponential backoff before retry
      attempt++;
      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  if (simulate) {
    return generateSandboxSimulation({ method, endpoint, type, data, params });
  }

  throw new ShadowfaxError(
    lastError?.message || "Shadowfax request failed after retries.",
    "SHADOWFAX_RETRY_EXHAUSTED",
    502
  );
}
