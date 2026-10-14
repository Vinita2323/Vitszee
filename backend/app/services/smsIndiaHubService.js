import axios from "axios";
import { buildMessage, toIndianNumber } from "../utils/smsHelpers.js";

const SMS_INDIA_SUCCESS_CODE = "000";
const DEFAULT_URL = "http://cloud.smsindiahub.in/vendorsms/pushsms.aspx";

function getSmsIndiaConfig() {
  const templateId = String(
    process.env.SMS_INDIA_HUB_TEMPLATE_ID ||
      process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID ||
      "",
  ).trim();

  return {
    provider: String(process.env.SMS_PROVIDER || "smsindia").trim().toLowerCase(),
    apiKey: String(process.env.SMS_INDIA_HUB_API_KEY || "").trim(),
    senderId: String(process.env.SMS_INDIA_HUB_SENDER_ID || "").trim(),
    dltTemplateId: templateId,
    gatewayId: String(process.env.SMS_INDIA_HUB_GWID || "2").trim(),
    peId: String(process.env.SMS_INDIA_HUB_PE_ID || "").trim(),
    brandName: String(process.env.SMS_INDIA_HUB_BRAND_NAME || "Vitszee").trim(),
    url: String(process.env.SMS_INDIA_HUB_URL || DEFAULT_URL).trim(),
    timeoutMs: parseInt(process.env.SMS_INDIA_HUB_TIMEOUT_MS || "10000", 10),
  };
}

function normalizeProviderPayload(payload) {
  return typeof payload === "string" ? payload : JSON.stringify(payload || {});
}

function parseSmsIndiaResponse(payload) {
  const raw = normalizeProviderPayload(payload);
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  const directCode = trimmed.slice(0, 3);
  if (/^\d{3}$/.test(directCode)) {
    return { code: directCode, raw };
  }

  const xmlStatusMatch = trimmed.match(/<status>\s*([^<]+)\s*<\/status>/i);
  if (xmlStatusMatch) {
    const statusValue = String(xmlStatusMatch[1] || "").trim();
    if (/^\d{3}$/.test(statusValue)) {
      return { code: statusValue, raw };
    }
    if (["success", "ok", "done", "submitted"].includes(statusValue.toLowerCase())) {
      return { code: SMS_INDIA_SUCCESS_CODE, raw };
    }
  }

  const jsonStatusMatch = trimmed.match(
    /"status"\s*:\s*"?(success|ok|done|submitted|000)"?/i,
  );
  if (jsonStatusMatch) {
    return { code: SMS_INDIA_SUCCESS_CODE, raw };
  }

  const errorCodeMatch = trimmed.match(/"ErrorCode"\s*:\s*"?(\d{3})"?/i);
  if (errorCodeMatch) {
    return { code: errorCodeMatch[1], raw };
  }

  const matched = trimmed.match(/\b(\d{3})\b/);
  if (matched) {
    return { code: matched[1], raw };
  }

  if (
    lower === "success" ||
    lower === "ok" ||
    lower === "done" ||
    lower.startsWith("success#") ||
    lower.startsWith("done#") ||
    lower.includes("message submitted")
  ) {
    return { code: SMS_INDIA_SUCCESS_CODE, raw };
  }

  return { code: null, raw };
}

function providerSnippet(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/APIKey[=:][^&\s"]+/gi, "APIKey=[REDACTED]")
    .trim()
    .slice(0, 180);
}

function mapSmsIndiaError(code) {
  const messages = {
    "001": "SMS India HUB configuration issue",
    "006": "SMS India HUB DLT template mismatch",
    "007": "SMS India HUB API key is invalid",
    "021": "SMS India HUB credits exhausted",
  };
  const error = new Error(messages[code] || "SMS India HUB request failed");
  error.isKnownProviderCode = Boolean(messages[code]);
  error.statusCode = code === "001" || code === "006" || code === "007" ? 500 : 502;
  error.providerCode = code;
  return error;
}

/**
 * Send an OTP SMS via SMS India Hub vendorsms/pushsms.aspx.
 * Message body must match the approved DLT template exactly.
 */
export async function sendSmsIndiaHubOtp({ phone, otp, message }) {
  const config = getSmsIndiaConfig();
  const requiredConfig = {
    apiKey: config.apiKey,
    senderId: config.senderId,
    dltTemplateId: config.dltTemplateId,
    url: config.url,
  };
  const missing = Object.entries(requiredConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    const error = new Error(`Missing SMS India HUB config: ${missing.join(", ")}`);
    error.statusCode = 500;
    throw error;
  }

  const msisdn = toIndianNumber(phone);
  if (!/^\d{12}$/.test(msisdn)) {
    const error = new Error("Invalid mobile number for SMS delivery");
    error.statusCode = 400;
    throw error;
  }

  // DLT requires the submitted text to match the approved template exactly.
  // Always build from the registered template; ignore free-form overrides.
  const msg = config.dltTemplateId ? buildMessage(otp) : message || buildMessage(otp);

  let response;
  try {
    response = await axios.get(config.url, {
      params: {
        APIKey: config.apiKey,
        msisdn,
        sid: config.senderId,
        msg,
        fl: "0",
        gwid: config.gatewayId,
        DLT_TE_ID: config.dltTemplateId,
        TE_ID: config.dltTemplateId,
        ...(config.peId
          ? {
              PE_ID: config.peId,
              EntityId: config.peId,
            }
          : {}),
      },
      timeout: config.timeoutMs,
    });
  } catch (networkError) {
    const error = new Error(
      networkError.code === "ECONNABORTED"
        ? "SMS India HUB request timed out"
        : "SMS India HUB network failure",
    );
    error.statusCode = 502;
    error.cause = networkError;
    throw error;
  }

  const body = response.data;
  const inlineErrorCode = body && typeof body === "object" ? body.ErrorCode : null;
  const { code: providerCode, raw } = parseSmsIndiaResponse(body);
  const effectiveCode = String(inlineErrorCode || providerCode || "");

  if (effectiveCode !== SMS_INDIA_SUCCESS_CODE) {
    const error = mapSmsIndiaError(effectiveCode || null);
    if (!error.isKnownProviderCode && raw) {
      error.message = `${error.message}: ${providerSnippet(raw)}`;
    }
    throw error;
  }

  return {
    provider: "sms_india_hub",
    providerCode: effectiveCode,
    jobId:
      (body && typeof body === "object" && (body.JobId || body.jobid)) ||
      null,
  };
}

export const __testables = {
  getSmsIndiaConfig,
  mapSmsIndiaError,
  parseSmsIndiaResponse,
  buildMessage,
};
