import Setting from "../models/setting.js";
import handleResponse from "../utils/helper.js";
import logger from "../services/logger.js";
import {
  getAdminDelhiveryLocalConfig,
  getDelhiveryLocalConfig,
} from "../services/delhiveryLocal/delhiveryLocalConfig.js";
import { getLocalAccessToken, clearLocalTokenCache } from "../services/delhiveryLocal/delhiveryLocalToken.js";
import {
  getLocalQuote,
  createLocalOrder,
  confirmLocalOrder,
  cancelLocalOrder,
  trackLocalOrder,
} from "../services/delhiveryLocal/delhiveryLocalService.js";
import { processLocalWebhook } from "../services/delhiveryLocal/delhiveryLocalWebhookService.js";

/** GET /api/delhivery/local/config (Admin) */
export const getDelhiveryLocalSettings = async (req, res) => {
  try {
    return handleResponse(res, 200, "Delhivery Local configuration retrieved", await getAdminDelhiveryLocalConfig());
  } catch (err) {
    return handleResponse(res, 500, err.message);
  }
};

/** PUT /api/delhivery/local/config (Admin). Env vars still win over these. */
export const updateDelhiveryLocalSettings = async (req, res) => {
  try {
    const allowed = [
      "enabled",
      "environment",
      "baseUrl",
      "authUrl",
      "clientId",
      "prodClientId",
      "stagingClientId",
      "clientCode",
      "audience",
      "webhookUrl",
      "defaultVehicleMode",
      "readyToShip",
      "autoServiceabilityCheck",
      "cityPincodePrefixes",
      "cityPincodes",
    ];
    const secrets = [
      "clientSecret",
      "prodClientSecret",
      "stagingClientSecret",
      "webhookApiKey",
      "webhookSignatureKey",
    ];

    const settingDoc = (await Setting.findOne()) || new Setting();
    if (!settingDoc.delhiveryLocal) settingDoc.delhiveryLocal = {};

    for (const key of allowed) {
      if (req.body?.[key] !== undefined) settingDoc.delhiveryLocal[key] = req.body[key];
    }
    for (const key of secrets) {
      const value = req.body?.[key];
      if (value && !String(value).includes("****")) settingDoc.delhiveryLocal[key] = value;
    }

    settingDoc.markModified?.("delhiveryLocal");
    await settingDoc.save();
    clearLocalTokenCache(); // credentials may have changed
    return handleResponse(res, 200, "Delhivery Local configuration updated", await getAdminDelhiveryLocalConfig());
  } catch (err) {
    return handleResponse(res, 500, err.message);
  }
};

/**
 * POST /api/delhivery/local/test-connection (Admin)
 * Mints a token (proves credentials) and runs a sample quote (proves the client code
 * is valid under the tenant). Surfaces the exact provider error otherwise.
 */
export const testLocalConnection = async (req, res) => {
  try {
    const config = await getDelhiveryLocalConfig();
    if (!config.hasCredentials) {
      return handleResponse(res, 400, "Delhivery Local credentials are not configured.", {
        hasCredentials: false,
      });
    }

    clearLocalTokenCache();
    await getLocalAccessToken({ forceRefresh: true });

    const sample = req.body?.quote || {
      pickupDetails: { address1: "Navrangpura", city: "Ahmedabad", state: "Gujarat", pinCode: "380009" },
      dropDetails: { address1: "Satellite", city: "Ahmedabad", state: "Gujarat", pinCode: "380015" },
      customerDetails: { customerName: "Test", countryCode: "+91", phoneNumber: "9876543210" },
    };

    try {
      const quote = await getLocalQuote(sample);
      return handleResponse(res, 200, "Delhivery Local connection OK (token + quote)", {
        tokenMinted: true,
        quoteOk: true,
        clientCode: config.clientCode,
        quote,
      });
    } catch (quoteErr) {
      return handleResponse(res, 200, "Token OK but quote failed", {
        tokenMinted: true,
        quoteOk: false,
        clientCode: config.clientCode,
        error: quoteErr.message,
        errorCode: quoteErr.code,
        hint:
          quoteErr.code === "DELHIVERY_LOCAL_CLIENT_VALIDATION"
            ? "The client code is not valid for these service credentials' tenant. Ask Delhivery to confirm the X-CLIENT-CODE that matches this client id."
            : undefined,
      });
    }
  } catch (err) {
    return handleResponse(res, 502, err.message, { code: err.code });
  }
};

/** POST /api/delhivery/local/quote (Admin) */
export const getLocalQuoteHandler = async (req, res) => {
  try {
    const quote = await getLocalQuote(req.body || {});
    return handleResponse(res, 200, "Quote retrieved", quote);
  } catch (err) {
    return handleResponse(res, err.httpStatus || 502, err.message, { code: err.code });
  }
};

/** POST /api/delhivery/local/orders/:orderId/create (Admin/Seller) */
export const triggerLocalOrderCreation = async (req, res) => {
  try {
    const shipment = await createLocalOrder(req.params.orderId);
    return handleResponse(res, 200, "Delhivery Local order created", {
      orderId: shipment.awbNumber,
      shipmentStatus: shipment.shipmentStatus,
    });
  } catch (err) {
    return handleResponse(res, err.httpStatus || 502, err.message, { code: err.code });
  }
};

/** POST /api/delhivery/local/orders/:orderId/confirm (Admin) */
export const confirmLocalOrderHandler = async (req, res) => {
  try {
    const shipment = await confirmLocalOrder(req.params.orderId);
    return handleResponse(res, 200, "Delhivery Local order confirmed", { orderId: shipment.awbNumber });
  } catch (err) {
    return handleResponse(res, err.httpStatus || 502, err.message, { code: err.code });
  }
};

/** POST /api/delhivery/local/orders/:orderId/cancel (Admin) */
export const triggerLocalCancellation = async (req, res) => {
  try {
    const reason = req.body?.reason || "service is no longer required";
    const shipment = await cancelLocalOrder(req.params.orderId, reason);
    if (!shipment) return handleResponse(res, 200, "No live Delhivery Local order to cancel", { cancelled: false });
    return handleResponse(res, 200, "Delhivery Local order cancelled", { cancelled: true, orderId: shipment.awbNumber });
  } catch (err) {
    return handleResponse(res, err.httpStatus || 502, err.message, { code: err.code });
  }
};

/** POST /api/delhivery/local/orders/:orderId/sync (Admin) */
export const syncLocalTracking = async (req, res) => {
  try {
    const result = await trackLocalOrder(req.params.orderId);
    return handleResponse(res, 200, "Delhivery Local tracking synced", result);
  } catch (err) {
    return handleResponse(res, err.httpStatus || 502, err.message, { code: err.code });
  }
};

/**
 * POST /api/delhivery/local-webhook (public — authenticated by the shared webhook key)
 * Always answers 200 for accepted events so Delhivery does not retry endlessly;
 * an auth failure returns 401.
 */
export const handleLocalWebhook = async (req, res) => {
  try {
    const result = await processLocalWebhook(req.body || {}, req.headers || {}, {
      rawBody: req.rawBody || "",
    });
    return res.status(200).json(result);
  } catch (err) {
    if (err.code === "DELHIVERY_LOCAL_WEBHOOK") {
      return res.status(401).json({ success: false, error: err.message });
    }
    logger.error(`[DelhiveryLocal Webhook] Handler error: ${err.message}`);
    return res.status(200).json({ success: false, error: err.message });
  }
};
