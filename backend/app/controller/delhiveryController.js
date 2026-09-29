import crypto from "crypto";
import Setting from "../models/setting.js";
import Shipment from "../models/shipment.js";
import Order from "../models/order.js";
import Seller from "../models/seller.js";
import handleResponse from "../utils/helper.js";
import logger from "../services/logger.js";
import { getAdminDelhiveryConfig, getDelhiveryConfig } from "../services/delhivery/delhiveryConfig.js";
import {
  checkForwardServiceability,
  createForwardOrder,
  cancelForwardOrder,
  trackForwardOrder,
  createPickupRequest,
} from "../services/delhivery/delhiveryForwardService.js";
import { ensureSellerPickupLocation } from "../services/delhivery/delhiveryWarehouseService.js";
import { processDelhiveryWebhook } from "../services/delhivery/delhiveryWebhookService.js";

/**
 * GET /api/delhivery/config (Admin only)
 */
export const getDelhiverySettings = async (req, res) => {
  try {
    const config = await getAdminDelhiveryConfig();
    return handleResponse(res, 200, "Delhivery configuration retrieved", config);
  } catch (err) {
    return handleResponse(res, 500, err.message);
  }
};

/**
 * PUT /api/delhivery/config (Admin only)
 * Values set through environment variables continue to win over these.
 */
export const updateDelhiverySettings = async (req, res) => {
  try {
    const allowed = [
      "forwardEnabled",
      "environment",
      "baseUrl",
      "clientName",
      "fallbackPickupLocation",
      "autoServiceabilityCheck",
      "autoShipmentCreation",
      "autoRegisterSellerWarehouse",
      "autoPickupRequest",
      "defaultWeightGrams",
      "pickupTime",
      "pickupCutoffHour",
      "shippingMode",
      "reconciliationIntervalMinutes",
    ];
    const secrets = ["apiToken", "prodApiToken", "stagingApiToken", "webhookSecret"];

    let settingDoc = (await Setting.findOne()) || new Setting();
    if (!settingDoc.delhivery) settingDoc.delhivery = {};

    for (const key of allowed) {
      if (req.body?.[key] !== undefined) settingDoc.delhivery[key] = req.body[key];
    }
    for (const key of secrets) {
      const value = req.body?.[key];
      if (value && !String(value).includes("****")) settingDoc.delhivery[key] = value;
    }

    await settingDoc.save();
    return handleResponse(res, 200, "Delhivery configuration updated successfully", await getAdminDelhiveryConfig());
  } catch (err) {
    return handleResponse(res, 500, err.message);
  }
};

/**
 * POST /api/delhivery/test-connection (Admin only)
 */
export const testDelhiveryConnection = async (req, res) => {
  try {
    const { pickupPincode = "382480", deliveryPincode = "110009", isCod = false } = req.body || {};
    const result = await checkForwardServiceability({ pickupPincode, deliveryPincode, isCod: Boolean(isCod) });
    return handleResponse(res, 200, "Delhivery connection tested", result);
  } catch (err) {
    return handleResponse(res, 400, err.message, { details: err.details });
  }
};

/**
 * GET /api/delhivery/shipments (Admin only)
 */
export const getAdminShipments = async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "20", 10);
    const { status, search } = req.query;

    const filter = { deliveryProvider: "delhivery" };
    if (status) filter.shipmentStatus = status;
    if (search) {
      filter.$or = [
        { internalOrderId: { $regex: search, $options: "i" } },
        { awbNumber: { $regex: search, $options: "i" } },
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
 * GET /api/delhivery/shipments/:orderId (Admin only)
 */
export const getShipmentByOrderId = async (req, res) => {
  try {
    const shipment = await Shipment.findOne({ internalOrderId: req.params.orderId }).lean();
    if (!shipment) return handleResponse(res, 404, "Shipment not found");
    return handleResponse(res, 200, "Shipment details retrieved", shipment);
  } catch (err) {
    return handleResponse(res, 500, err.message);
  }
};

/**
 * Admins may act on any order; sellers only on their own, customers (tracking) on theirs.
 */
async function canAccessOrder(user, orderId) {
  if (user?.role === "admin") return true;
  const order = await Order.findOne({ orderId }).select("customer seller").lean();
  if (!order) return false;
  const userId = String(user?.id || "");
  if (user?.role === "seller") return String(order.seller) === userId;
  if (user?.role === "customer" || user?.role === "user") return String(order.customer) === userId;
  return false;
}

/**
 * POST /api/delhivery/shipments/:orderId/create-forward
 */
export const triggerForwardOrderCreation = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!(await canAccessOrder(req.user, orderId))) return handleResponse(res, 404, "Order not found");
    const shipment = await createForwardOrder(orderId);
    return handleResponse(res, 200, "Delhivery shipment created", shipment);
  } catch (err) {
    return handleResponse(res, err.statusCode || 400, err.message, { details: err.details });
  }
};

/**
 * POST /api/delhivery/shipments/:orderId/cancel (Admin only)
 */
export const triggerOrderCancellation = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason = "Cancelled by admin" } = req.body || {};
    const shipment = await cancelForwardOrder(orderId, reason);
    if (!shipment) return handleResponse(res, 200, "No live Delhivery shipment to cancel", null);
    return handleResponse(res, 200, "Shipment cancelled", shipment);
  } catch (err) {
    return handleResponse(res, err.statusCode || 400, err.message);
  }
};

/**
 * POST /api/delhivery/shipments/:orderId/sync (Admin only)
 */
export const syncShipmentTracking = async (req, res) => {
  try {
    const result = await trackForwardOrder(req.params.orderId);
    return handleResponse(res, 200, "Tracking synced with Delhivery", result);
  } catch (err) {
    return handleResponse(res, err.statusCode || 400, err.message);
  }
};

/**
 * POST /api/delhivery/pickup-request (Admin only)
 * Asks Delhivery to collect parcels from a pickup location.
 */
export const triggerPickupRequest = async (req, res) => {
  try {
    const { pickupLocation, packageCount = 1, date, time } = req.body || {};
    if (!pickupLocation) return handleResponse(res, 400, "pickupLocation is required");
    const result = await createPickupRequest(pickupLocation, { packageCount, date, time });
    return handleResponse(res, 200, "Pickup requested", result);
  } catch (err) {
    return handleResponse(res, err.statusCode || 400, err.message);
  }
};

/**
 * POST /api/delhivery/sellers/:sellerId/register-pickup (Admin only)
 * Registers a seller's shop as a Delhivery pickup location.
 */
export const registerSellerPickupLocation = async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.sellerId);
    if (!seller) return handleResponse(res, 404, "Seller not found");
    const name = await ensureSellerPickupLocation(seller);
    return handleResponse(res, 200, "Pickup location registered with Delhivery", { pickupLocation: name });
  } catch (err) {
    return handleResponse(res, err.statusCode || 400, err.message);
  }
};

/**
 * GET /api/delhivery/track/:identifier
 * Normalized tracking for customer / seller / admin.
 */
export const trackShipmentUnified = async (req, res) => {
  try {
    const { identifier } = req.params;
    const shipment = await Shipment.findOne({
      $or: [{ internalOrderId: identifier }, { awbNumber: identifier }],
    }).lean();

    if (!shipment || !(await canAccessOrder(req.user, shipment.internalOrderId))) {
      return handleResponse(res, 404, "Tracking details not found");
    }

    return handleResponse(res, 200, "Tracking information", {
      provider: "delhivery",
      internalOrderId: shipment.internalOrderId,
      awbNumber: shipment.awbNumber,
      shipmentStatus: shipment.shipmentStatus,
      status: shipment.shipmentStatus,
      providerStatus: shipment.providerStatus,
      timeline: shipment.timeline?.map((t) => ({
        status: t.status,
        description: t.description,
        timestamp: t.timestamp,
      })),
      lastSyncAt: shipment.lastProviderSyncAt,
    });
  } catch (err) {
    return handleResponse(res, 500, err.message);
  }
};

/**
 * Verifies inbound Delhivery scan pushes using a shared secret.
 * Delhivery lets the client specify the headers it sends, so the secret is accepted as
 * `Authorization: Token <secret>`, `x-webhook-secret`, `token` or a `?token=` query param.
 * In production a callback without a configured secret is rejected.
 */
function isWebhookAuthorized(req, config) {
  if (!config.webhookSecret) {
    if (config.isProduction) {
      logger.error("[Delhivery Webhook] No webhook secret configured in production — rejecting callback.");
      return false;
    }
    logger.warn("[Delhivery Webhook] DELHIVERY_WEBHOOK_SECRET is not configured — webhook is unauthenticated.");
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
 * POST /api/delhivery/webhook
 */
export const handleScanWebhook = async (req, res) => {
  try {
    const config = await getDelhiveryConfig();
    if (!isWebhookAuthorized(req, config)) {
      logger.warn("[Delhivery Webhook] Rejected: invalid or missing secret");
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    logger.info("[Delhivery Webhook] Scan received", { body: req.body });
    const result = await processDelhiveryWebhook(req.body, req.headers);
    return res.status(200).json({ success: true, result });
  } catch (err) {
    logger.error(`[Delhivery Webhook] Error: ${err.message}`);
    // Always answer 200 so Delhivery does not retry a scan we already logged.
    return res.status(200).json({ success: false, error: err.message });
  }
};
