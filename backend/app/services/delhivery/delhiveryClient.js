import axios from "axios";
import logger from "../logger.js";
import { getDelhiveryConfig } from "./delhiveryConfig.js";

export class DelhiveryError extends Error {
  constructor(message, details = null, statusCode = 400) {
    super(message);
    this.name = "DelhiveryError";
    this.details = details;
    this.statusCode = statusCode;
  }
}

function errorMessage(body, fallback) {
  if (!body) return fallback;
  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 500);
  if (typeof body !== "object") return fallback;
  const remarks = body.rmk || body.error || body.message || body.detail;
  if (remarks) return String(remarks);
  const packages = Array.isArray(body.packages) ? body.packages : [];
  const packageRemarks = packages
    .flatMap((pkg) => (Array.isArray(pkg.remarks) ? pkg.remarks : [pkg.remarks]))
    .filter(Boolean)
    .join("; ");
  return packageRemarks || fallback;
}

export async function delhiveryRequest({ method = "GET", path, params, data, form }) {
  const config = getDelhiveryConfig();
  if (!config.apiToken) {
    throw new DelhiveryError("Delhivery API token is not configured.");
  }

  const headers = {
    Authorization: `Token ${config.apiToken}`,
    Accept: "application/json",
  };

  let body = data;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  } else if (data) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await axios({
      method,
      url: `${config.baseUrl}${path}`,
      params,
      data: body,
      headers,
      timeout: 20000,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      throw new DelhiveryError(
        errorMessage(response.data, `Delhivery request failed (${response.status}).`),
        response.data,
        response.status,
      );
    }

    return response.data;
  } catch (error) {
    if (error instanceof DelhiveryError) throw error;
    logger.warn("[Delhivery] Request failed", { path, error: error.message });
    throw new DelhiveryError(error.message || "Delhivery request failed.");
  }
}
