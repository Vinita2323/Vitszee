import Setting from "../models/setting.js";
import Shipment from "../models/shipment.js";
import Order from "../models/order.js";
import handleResponse from "../utils/helper.js";
import crypto from "crypto";
import {
  getAdminShadowfaxConfig,
  getShadowfaxConfig,
} from "../services/shadowfax/shadowfaxConfig.js";
import {
  checkForwardServiceability,
  createForwardOrder,
  cancelForwardOrder,
  trackForwardOrder,
  markDispatchReady,
} from "../services/shadowfax/shadowfaxForwardService.js";
import {
  checkReverseServiceability,
  createReversePickup,
  cancelReversePickup,
  trackReversePickup,
} from "../services/shadowfax/shadowfaxReverseService.js";
import { processShadowfaxWebhook } from "../services/shadowfax/shadowfaxWebhookService.js";
import { sendShadowfaxRequest } from "../services/shadowfax/shadowfaxClient.js";
import logger from "../services/logger.js";

/**
 * GET /api/shadowfax/config (Admin only)
 */
export const getShadowfaxSettings = async (req, res) => {
  try {
    const config = await getAdminShadowfaxConfig();
    return handleResponse(res, 200, "Shadowfax configuration retrieved", config);
  } catch (err) {
    return handleResponse(res, 500, err.message);
  }
};

/**
 * PUT /api/shadowfax/config (Admin only)
 */
export const updateShadowfaxSettings = async (req, res) => {
  try {
    const {
      forwardEnabled,
      reverseEnabled,
      environment,
      forwardBaseUrl,
      reverseBaseUrl,
      clientCode,
      forwardToken,
      reverseToken,
      forwardProdToken,
      reverseProdToken,
      webhookSecret,
      autoServiceabilityCheck,
      autoShipmentCreation,
      autoDispatchReady,
      qcEnabled,
      reconciliationIntervalMinutes,
    } = req.body || {};

    let settingDoc = await Setting.findOne();
    if (!settingDoc) {
      settingDoc = new Setting();
    }

    if (!settingDoc.shadowfax) {
      settingDoc.shadowfax = {};
    }

    if (forwardEnabled !== undefined) settingDoc.shadowfax.forwardEnabled = Boolean(forwardEnabled);
    if (reverseEnabled !== undefined) settingDoc.shadowfax.reverseEnabled = Boolean(reverseEnabled);
    if (environment) settingDoc.shadowfax.environment = environment;
    if (forwardBaseUrl) settingDoc.shadowfax.forwardBaseUrl = forwardBaseUrl;
    if (reverseBaseUrl) settingDoc.shadowfax.reverseBaseUrl = reverseBaseUrl;
    if (clientCode !== undefined) settingDoc.shadowfax.clientCode = clientCode;
    if (forwardToken && !forwardToken.includes("****")) settingDoc.shadowfax.forwardToken = forwardToken;
    if (reverseToken && !reverseToken.includes("****")) settingDoc.shadowfax.reverseToken = reverseToken;
    if (forwardProdToken && !forwardProdToken.includes("****")) settingDoc.shadowfax.forwardProdToken = forwardProdToken;
    if (reverseProdToken && !reverseProdToken.includes("****")) settingDoc.shadowfax.reverseProdToken = reverseProdToken;
    if (webhookSecret && !webhookSecret.includes("****")) settingDoc.shadowfax.webhookSecret = webhookSecret;
    if (autoServiceabilityCheck !== undefined) settingDoc.shadowfax.autoServiceabilityCheck = Boolean(autoServiceabilityCheck);
    if (autoShipmentCreation !== undefined) settingDoc.shadowfax.autoShipmentCreation = Boolean(autoShipmentCreation);
    if (autoDispatchReady !== undefined) settingDoc.shadowfax.autoDispatchReady = Boolean(autoDispatchReady);
    if (qcEnabled !== undefined) settingDoc.shadowfax.qcEnabled = Boolean(qcEnabled);
    if (reconciliationIntervalMinutes !== undefined) settingDoc.shadowfax.reconciliationIntervalMinutes = Number(reconciliationIntervalMinutes);

    await settingDoc.save();

    const safeConfig = await getAdminShadowfaxConfig();
    return handleResponse(res, 200, "Shadowfax configuration updated successfully", safeConfig);
  } catch (err) {
    return handleResponse(res, 500, err.message);
  }
};

/**
 * POST /api/shadowfax/test-connection (Admin only)
 * Tests connection against Shadowfax Sandbox or Production.
 */
export const testShadowfaxConnection = async (req, res) => {
  try {
    const { type = "forward", pickupPincode = "560001", deliveryPincode = "560002" } = req.body || {};

    if (type === "forward") {
      const result = await checkForwardServiceability({
        pickupPincode,
        deliveryPincode,
        orderValue: 100,
      });
      return handleResponse(res, 200, "Shadowfax Forward connection tested", result);
    } else {
      const result = await checkReverseServiceability({
        pickupPincode,
        destinationPincode: deliveryPincode,
      });
      return handleResponse(res, 200, "Shadowfax Reverse connection tested", result);
    }
  } catch (err) {
    return handleResponse(res, 400, err.message, { details: err.details });
  }
};

/**
 * GET /api/shadowfax/shipments (Admin only)
 */
export const getAdminShipments = async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "20", 10);
    const status = req.query.status;
    const providerType = req.query.providerType;
    const search = req.query.search;

    const filter = {};
    if (status) filter.shipmentStatus = status;
    if (providerType) filter.providerType = providerType;
    if (search) {
      filter.$or = [
        { internalOrderId: { $regex: search, $options: "i" } },
        { awbNumber: { $regex: search, $options: "i" } },
        { shadowfaxOrderId: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Shipment.countDocuments(filter);
    const shipments = await Shipment.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return handleResponse(res, 200, "Shipments retrieved", {
      items: shipments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    return handleResponse(res, 500, err.message);
  }
};

/**
 * GET /api/shadowfax/shipments/:orderId
 */
export const getShipmentByOrderId = async (req, res) => {
  try {
    const { orderId } = req.params;
    const shipment = await Shipment.findOne({ internalOrderId: orderId }).lean();
    if (!shipment) {
      return handleResponse(res, 404, "Shipment not found");
    }
    return handleResponse(res, 200, "Shipment details retrieved", shipment);
  } catch (err) {
    return handleResponse(res, 500, err.message);
  }
};

/**
 * POST /api/shadowfax/shipments/:orderId/create-forward
 */
export const triggerForwardOrderCreation = async (req, res) => {
  try {
    const { orderId } = req.params;
    const shipment = await createForwardOrder(orderId);
    return handleResponse(res, 200, "Shadowfax forward order created", shipment);
  } catch (err) {
    return handleResponse(res, err.statusCode || 400, err.message, { details: err.details });
  }
};

/**
 * POST /api/shadowfax/shipments/:orderId/dispatch-ready
 */
export const triggerDispatchReady = async (req, res) => {
  try {
    const { orderId } = req.params;
    const shipment = await markDispatchReady(orderId);
    return handleResponse(res, 200, "Shipment marked dispatch ready", shipment);
  } catch (err) {
    return handleResponse(res, err.statusCode || 400, err.message);
  }
};

/**
 * POST /api/shadowfax/shipments/:orderId/cancel
 */
export const triggerOrderCancellation = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason = "Cancelled by admin" } = req.body || {};
    const shipment = await cancelForwardOrder(orderId, reason);
    return handleResponse(res, 200, "Shipment cancelled", shipment);
  } catch (err) {
    return handleResponse(res, err.statusCode || 400, err.message);
  }
};

/**
 * GET /api/shadowfax/track/:identifier
 * Public / Normalized tracking for Customer & Seller.
 */
export const trackShipmentUnified = async (req, res) => {
  try {
    const { identifier } = req.params;
    const shipment = await Shipment.findOne({
      $or: [{ internalOrderId: identifier }, { awbNumber: identifier }, { shadowfaxOrderId: identifier }, { clientRequestId: identifier }],
    }).lean();

    if (!shipment) {
      return handleResponse(res, 404, "Tracking details not found");
    }

    const isCustomerOrSeller = req.user?.role !== "admin";

    // Safe normalized response for customer/seller
    const normalized = {
      provider: "shadowfax",
      internalOrderId: shipment.internalOrderId,
      awbNumber: shipment.awbNumber,
      providerType: shipment.providerType,
      shipmentStatus: shipment.shipmentStatus,
      status: shipment.shipmentStatus,
      rider: shipment.rider
        ? {
            name: shipment.rider.name,
            phone: isCustomerOrSeller && shipment.rider.phone ? `${shipment.rider.phone.slice(0, 3)}****${shipment.rider.phone.slice(-3)}` : shipment.rider.phone,
            latitude: shipment.rider.latitude,
            longitude: shipment.rider.longitude,
          }
        : null,
      timeline: shipment.timeline?.map((t) => ({
        status: t.status,
        description: t.description,
        timestamp: t.timestamp,
      })),
      lastSyncAt: shipment.lastProviderSyncAt,
    };

    return handleResponse(res, 200, "Tracking information", normalized);
  } catch (err) {
    return handleResponse(res, 500, err.message);
  }
};

/**
 * Verifies inbound Shadowfax webhook calls using a shared secret.
 * Shadowfax's "Token" auth type sends the configured token back on every call,
 * but the exact header name isn't documented, so this checks the common
 * variants (Authorization, token, x-webhook-secret) plus a `?token=` query param.
 * If no secret is configured, verification is skipped (dev/sandbox convenience)
 * but a warning is logged.
 */
function isWebhookAuthorized(req, config) {
  if (!config.webhookSecret) {
    logger.warn("[Shadowfax Webhook] SHADOWFAX_WEBHOOK_SECRET is not configured — webhook is unauthenticated.");
    return true;
  }

  const authHeader = req.headers["authorization"] || "";
  const provided =
    req.headers["x-webhook-secret"] ||
    req.headers["token"] ||
    req.headers["x-token"] ||
    authHeader.replace(/^Token\s+/i, "").replace(/^Bearer\s+/i, "") ||
    req.query?.token ||
    "";
  const expected = config.webhookSecret;

  if (!provided || provided.length !== expected.length) return false;

  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/**
 * POST /api/shadowfax/webhook/forward
 */
export const handleForwardWebhook = async (req, res) => {
  try {
    const config = await getShadowfaxConfig();
    if (!isWebhookAuthorized(req, config)) {
      logger.warn("[Shadowfax Webhook Inbound] Forward webhook rejected: invalid/missing secret");
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    logger.info("[Shadowfax Webhook Inbound] Forward Webhook received", {
      body: req.body,
      headers: req.headers,
    });

    const result = await processShadowfaxWebhook(req.body, req.headers, "forward");
    return res.status(200).json({ success: true, result });
  } catch (err) {
    logger.error(`[Shadowfax Webhook Inbound] Forward Webhook error: ${err.message}`);
    return res.status(200).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/shadowfax/webhook/reverse
 */
export const handleReverseWebhook = async (req, res) => {
  try {
    const config = await getShadowfaxConfig();
    if (!isWebhookAuthorized(req, config)) {
      logger.warn("[Shadowfax Webhook Inbound] Reverse webhook rejected: invalid/missing secret");
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    logger.info("[Shadowfax Webhook Inbound] Reverse Webhook received", {
      body: req.body,
      headers: req.headers,
    });

    const result = await processShadowfaxWebhook(req.body, req.headers, "reverse");
    return res.status(200).json({ success: true, result });
  } catch (err) {
    logger.error(`[Shadowfax Webhook Inbound] Reverse Webhook error: ${err.message}`);
    return res.status(200).json({ success: false, error: err.message });
  }
};
