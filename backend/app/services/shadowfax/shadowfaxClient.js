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
 * Generates realistic simulation response for sandbox testing when external staging server is unreachable.
 */
function generateSandboxSimulation({ method, endpoint, type, data }) {
  const normEndpoint = String(endpoint || "").toLowerCase();
  const requestId = `sfx-sim-${crypto.randomUUID().slice(0, 8)}`;

  if (normEndpoint.includes("serviceability")) {
    return {
      success: true,
      status: 200,
      data: {
        serviceable: true,
        status: "success",
        message: "Pincode is serviceable (Sandbox Simulation)",
      },
      headers: {},
      requestId,
      simulated: true,
    };
  }

  if (normEndpoint.includes("orders/cancel") || normEndpoint.includes("requests/cancel")) {
    return {
      success: true,
      status: 200,
      data: {
        status: "success",
        message: "Cancellation processed successfully (Sandbox Simulation)",
      },
      headers: {},
      requestId,
      simulated: true,
    };
  }

  if (normEndpoint.includes("order_update")) {
    return {
      success: true,
      status: 200,
      data: {
        status: "success",
        message: "Order marked ready for dispatch (Sandbox Simulation)",
      },
      headers: {},
      requestId,
      simulated: true,
    };
  }

  if (normEndpoint.includes("/track") || normEndpoint.includes("/requests/")) {
    return {
      success: true,
      status: 200,
      data: {
        status: "success",
        data: {
          status: "out_for_delivery",
          rider_name: "Shadowfax Express Rider",
          rider_contact: "9876543210",
          latitude: 12.9716,
          longitude: 77.5946,
          updated_at: new Date().toISOString(),
        },
      },
      headers: {},
      requestId,
      simulated: true,
    };
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
  return {
    success: true,
    status: 200,
    data: {
      status: "success",
      order_id: `SFX-${Date.now().toString().slice(-6)}`,
      awb_number: `AWB-${randomDigits}`,
      message: "Shadowfax order created successfully (Sandbox Simulation)",
    },
    headers: {},
    requestId,
    simulated: true,
  };
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
  const isSandbox = config.environment === "sandbox";
  const baseUrl = overrideBaseUrl || (type === "reverse" ? config.reverseBaseUrl : config.forwardBaseUrl);
  const token = overrideToken || (type === "reverse" ? config.reverseToken : config.forwardToken);

  if (!token && !isSandbox) {
    throw new ShadowfaxAuthError(
      `Shadowfax ${type} token is not configured. Please check environment variables or Admin Settings.`
    );
  }

  const url = `${(baseUrl || "https://dale.staging.shadowfax.in").replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
  const requestId = `sfx-${crypto.randomUUID().slice(0, 8)}`;

  const headers = {
    "Content-Type": "application/json",
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
        data,
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

      // In Sandbox mode, if remote staging server is down/404/unreachable or auth-pending, provide sandbox simulation
      if (isSandbox && (httpStatus === 404 || httpStatus === 401 || !httpStatus || httpStatus >= 500)) {
        logger.info(`[Shadowfax Sandbox] External staging returned HTTP ${httpStatus || "ERR"}. Using Sandbox Simulation.`);
        return generateSandboxSimulation({ method, endpoint, type, data });
      }

      // Handle Non-Retryable Client Errors (400, 401, 403, 404, 422)
      if (httpStatus === 401 || httpStatus === 403) {
        throw new ShadowfaxAuthError(
          responseData?.message || responseData?.error || "Shadowfax authentication failed.",
          responseData
        );
      }

      if (httpStatus === 400 || httpStatus === 422) {
        throw new ShadowfaxInvalidRequestError(
          responseData?.message || responseData?.error || "Invalid request sent to Shadowfax.",
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
          responseData?.message || responseData?.error || err.message || "Shadowfax request failed.",
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

  if (isSandbox) {
    return generateSandboxSimulation({ method, endpoint, type, data });
  }

  throw new ShadowfaxError(
    lastError?.message || "Shadowfax request failed after retries.",
    "SHADOWFAX_RETRY_EXHAUSTED",
    502
  );
}
