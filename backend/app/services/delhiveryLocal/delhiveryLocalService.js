import Shipment from "../../models/shipment.js";
import Order from "../../models/order.js";
import logger from "../logger.js";
import { getDelhiveryLocalConfig } from "./delhiveryLocalConfig.js";
import { sendDelhiveryLocalRequest, extractLocalErrorMessage } from "./delhiveryLocalClient.js";
import {
  mapLocalStatus,
  normalizeCancellationReason,
  LOCAL_VEHICLE_MODES,
} from "./delhiveryLocalStatusMapper.js";
import {
  DelhiveryLocalInvalidRequestError,
  DelhiveryLocalOrderCreationFailedError,
  DelhiveryLocalCancellationFailedError,
  DelhiveryLocalTrackingFailedError,
  DelhiveryLocalConfigError,
} from "./delhiveryLocalErrors.js";
import { syncOrderWithShipmentStatus } from "../delhivery/delhiveryOrderSync.js";
import { isValidForwardStatusTransition } from "../delhivery/delhiveryStatusMapper.js";
import { resolveSellerPickupDetails, ensureSellerPickupLocation } from "../delhivery/delhiveryWarehouseService.js";
import { emitOrderStatusUpdate } from "../orderSocketEmitter.js";

// Endpoints (contract V6, all under the CoreOS gateway base URL).
const PATHS = {
  create: "/local/api/proxy/v1/shipper/orders/create",
  confirm: "/local/api/proxy/v1/shipper/orders/confirm",
  cancel: "/local/api/proxy/v1/shipper/orders/cancel",
  quote: "/local/api/proxy/v1/shipper/pricing/quote",
  track: (orderId) => `/local/api/proxy/v1/shipper/orders/${encodeURIComponent(orderId)}`,
};

// Shipment states that mean a real, live Local order exists at Delhivery.
export const LIVE_LOCAL_STATUSES = [
  "ORDER_CREATED",
  "RIDER_ASSIGNED",
  "RIDER_ARRIVED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
];

function str(value, maxLength = 250) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function tenDigitPhone(...candidates) {
  for (const candidate of candidates) {
    const digits = String(candidate || "").replace(/[^0-9]/g, "").slice(-10);
    if (digits.length === 10) return digits;
  }
  return "";
}

function geo(lat, lng) {
  // Delhivery Local requires at most 6 decimal places on coordinates.
  const round = (v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(6) : null;
  };
  const latitude = round(lat);
  const longitude = round(lng);
  return latitude && longitude ? { latitude, longitude } : null;
}

/**
 * Normalises a city/state to a format Delhivery accepts (letters + spaces only).
 * Stored values are sometimes a whole address dumped into one field
 * ("Ranip, Gujarat, 382470"), which Delhivery rejects as "Invalid city format".
 * Takes the first comma-segment and strips digits/punctuation.
 */
function cleanCity(value) {
  if (!value) return "";
  const first = String(value).split(",")[0];
  return first.replace(/[^A-Za-z\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
}

/**
 * Extracts { latitude, longitude } from any location shape we store:
 *  - GeoJSON Point:  { type:"Point", coordinates:[lng, lat] }  (seller.location)
 *  - plain object:   { lat, lng } or { latitude, longitude }   (order.address.location)
 * Delhivery Local is geo-based, so sending coordinates is what makes hyperlocal
 * serviceability resolve reliably (a bare pincode often cannot pinpoint the stop).
 */
function extractGeo(loc) {
  if (!loc || typeof loc !== "object") return null;
  if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
    // GeoJSON stores [longitude, latitude].
    return geo(loc.coordinates[1], loc.coordinates[0]);
  }
  return geo(loc.lat ?? loc.latitude, loc.lng ?? loc.longitude);
}

/**
 * Builds the customer (drop) block from an order.
 */
function resolveDropDetails(order) {
  const address = order.address || {};
  const customer = order.customer || {};

  const phoneNumber = tenDigitPhone(address.phone, customer.phone);
  if (!phoneNumber) {
    throw new DelhiveryLocalInvalidRequestError("Customer phone number is missing or invalid (need 10 digits).");
  }

  const address1 = str(address.fullAddress || address.address, 250);
  if (!address1) throw new DelhiveryLocalInvalidRequestError("Customer delivery address is missing.");

  let pinCode = String(address.pincode || "").trim();
  if (!/^\d{6}$/.test(pinCode)) {
    const match = address1.match(/\b\d{6}\b/);
    pinCode = match ? match[0] : "";
  }

  const geoLocation = extractGeo(address.location);

  // Address OR geolocation must be present; pinCode is optional when geo is supplied.
  if (!/^\d{6}$/.test(pinCode) && !geoLocation) {
    throw new DelhiveryLocalInvalidRequestError(
      "Customer address needs either a valid 6-digit pincode or geo-coordinates."
    );
  }

  return {
    contactDetails: {
      consigneeName: str(address.name || customer.name || "Customer", 100),
      countryCode: "+91",
      phoneNumber,
    },
    address1,
    ...(address.landmark ? { address2: str(address.landmark, 200) } : {}),
    ...(cleanCity(address.city) ? { city: cleanCity(address.city) } : {}),
    ...(cleanCity(address.state) ? { state: cleanCity(address.state) } : {}),
    ...(/^\d{6}$/.test(pinCode) ? { pinCode } : {}),
    ...(geoLocation ? { geoLocation } : {}),
  };
}

/**
 * Builds the seller (pickup) block from a seller doc.
 */
function resolvePickupDetails(seller) {
  const pickup = resolveSellerPickupDetails(seller); // { phone, address, city, state, pin }
  const phoneNumber = tenDigitPhone(pickup.phone, seller.phone);
  if (!phoneNumber) {
    throw new DelhiveryLocalInvalidRequestError("Seller pickup phone number is missing or invalid (need 10 digits).");
  }
  const address1 = str(pickup.address, 250);
  if (!address1) throw new DelhiveryLocalInvalidRequestError("Seller pickup address is missing.");

  const geoLocation = extractGeo(seller.location);

  if (!/^\d{6}$/.test(String(pickup.pin || "")) && !geoLocation) {
    throw new DelhiveryLocalInvalidRequestError(
      "Seller pickup address needs either a valid 6-digit pincode or geo-coordinates."
    );
  }

  return {
    contactDetails: {
      shipperName: str(seller.shopName || seller.name || "Seller", 100),
      countryCode: "+91",
      phoneNumber,
    },
    address1,
    ...(cleanCity(pickup.city) ? { city: cleanCity(pickup.city) } : {}),
    ...(cleanCity(pickup.state) ? { state: cleanCity(pickup.state) } : {}),
    ...(/^\d{6}$/.test(String(pickup.pin || "")) ? { pinCode: String(pickup.pin) } : {}),
    ...(geoLocation ? { geoLocation } : {}),
  };
}

function resolveItemDetails(order) {
  const descriptions = (order.items || [])
    .map((item) => item.name || item.product?.name)
    .filter(Boolean)
    .map((name) => str(name, 120));
  const value = Number(order.paymentBreakdown?.grandTotal ?? order.pricing?.total ?? 0) || 0;
  return {
    description: descriptions.length ? descriptions : ["Order items"],
    value: value > 0 ? value : 1,
  };
}

function resolveVehicleMode(order, config) {
  const requested = String(order.deliveryVehicleMode || "").trim();
  if (LOCAL_VEHICLE_MODES.includes(requested)) return requested;
  return LOCAL_VEHICLE_MODES.includes(config.defaultVehicleMode) ? config.defaultVehicleMode : "2-wheeler";
}

function buildWebhookBlock(config) {
  if (!config.webhookUrl) return null;
  const block = { url: config.webhookUrl };
  if (config.webhookSignatureKey) block.signatureKey = config.webhookSignatureKey;
  if (config.webhookApiKey) block.xApiKey = config.webhookApiKey;
  // A webhook needs at least one auth field; without one Delhivery rejects the create.
  if (!block.signatureKey && !block.xApiKey) return null;
  return block;
}

/**
 * Requests an intracity price quote (read-only). Also doubles as a serviceability check
 * (Delhivery answers 424 when the pickup/drop is outside a Local-serviceable zone).
 */
export async function getLocalQuote({ pickupDetails, dropDetails, stopDetails = null, customerDetails = null }) {
  const body = { pickupDetails, dropDetails };
  if (stopDetails) body.stopDetails = stopDetails;
  if (customerDetails) body.customerDetails = customerDetails;

  const response = await sendDelhiveryLocalRequest({ method: "POST", path: PATHS.quote, json: body });
  return response.data?.data || response.data;
}

/**
 * Creates a Local (intracity / quick) delivery order with Delhivery.
 * Idempotent: an order with an existing live Local order returns that shipment.
 */
export async function createLocalOrder(orderId) {
  const config = await getDelhiveryLocalConfig();
  if (!config.hasCredentials) {
    throw new DelhiveryLocalConfigError(
      "Delhivery Local credentials are not configured (client id/secret/code)."
    );
  }

  const order = await Order.findOne({ orderId })
    .populate("customer", "name phone email addresses")
    .populate("seller", "shopName name phone email address locality city state pincode location delhiveryWarehouse")
    .populate("items.product", "name price sku");

  if (!order) throw new DelhiveryLocalInvalidRequestError(`Order #${orderId} not found.`);

  const existingShipment = await Shipment.findOne({ internalOrderId: orderId, providerType: "forward" });
  if (existingShipment && [...LIVE_LOCAL_STATUSES, "DELIVERED"].includes(existingShipment.shipmentStatus)) {
    logger.info(`[DelhiveryLocal] Order #${orderId} already has a live Local order (${existingShipment.awbNumber})`);
    return existingShipment;
  }
  if (existingShipment && existingShipment.shipmentStatus === "CANCELLED") {
    throw new DelhiveryLocalInvalidRequestError(
      `Order #${orderId} already has a cancelled Local order (${existingShipment.awbNumber || "n/a"}); it cannot be re-dispatched automatically.`
    );
  }

  const seller = order.seller || {};
  const dropDetails = resolveDropDetails(order);
  const pickupDetails = resolvePickupDetails(seller);

  // Make sure the seller has a registered pickup location name (kept in sync with Express).
  try {
    await ensureSellerPickupLocation(seller);
  } catch (err) {
    logger.warn(`[DelhiveryLocal] Could not ensure seller pickup location for #${orderId}: ${err.message}`);
  }

  const isCod =
    String(order.paymentMode || "").toUpperCase() === "COD" ||
    String(order.payment?.method || "").toLowerCase() === "cash";

  // Optional serviceability pre-check via the quote endpoint.
  if (config.autoServiceabilityCheck) {
    try {
      await getLocalQuote({
        pickupDetails: { address1: pickupDetails.address1, city: pickupDetails.city, state: pickupDetails.state, pinCode: pickupDetails.pinCode, geoLocation: pickupDetails.geoLocation },
        dropDetails: { address1: dropDetails.address1, city: dropDetails.city, state: dropDetails.state, pinCode: dropDetails.pinCode, geoLocation: dropDetails.geoLocation },
        customerDetails: {
          customerName: dropDetails.contactDetails.consigneeName,
          countryCode: "+91",
          phoneNumber: dropDetails.contactDetails.phoneNumber,
        },
      });
    } catch (err) {
      if (err.code === "DELHIVERY_LOCAL_SERVICEABILITY") {
        order.deliveryProvider = "delhivery";
        order.deliveryFailureReason = err.message;
        if (typeof order.save === "function") await order.save().catch(() => {});
        throw err;
      }
      logger.warn(`[DelhiveryLocal] Quote pre-check skipped for #${orderId}: ${err.message}`);
    }
  }

  const shipment =
    existingShipment ||
    new Shipment({
      orderMongoId: order._id,
      internalOrderId: order.orderId,
      clientOrderId: order.orderId,
      deliveryProvider: "delhivery",
      providerType: "forward",
      shipmentStatus: "PENDING",
      environment: config.isProduction ? "production" : "sandbox",
      pickupDetails: {
        name: pickupDetails.contactDetails.shipperName,
        contact: pickupDetails.contactDetails.phoneNumber,
        address: pickupDetails.address1,
        city: pickupDetails.city,
        state: pickupDetails.state,
        pincode: pickupDetails.pinCode,
        latitude: pickupDetails.geoLocation ? Number(pickupDetails.geoLocation.latitude) : undefined,
        longitude: pickupDetails.geoLocation ? Number(pickupDetails.geoLocation.longitude) : undefined,
      },
      dropDetails: {
        name: dropDetails.contactDetails.consigneeName,
        contact: dropDetails.contactDetails.phoneNumber,
        address: dropDetails.address1,
        city: dropDetails.city,
        state: dropDetails.state,
        pincode: dropDetails.pinCode,
        latitude: dropDetails.geoLocation ? Number(dropDetails.geoLocation.latitude) : undefined,
        longitude: dropDetails.geoLocation ? Number(dropDetails.geoLocation.longitude) : undefined,
      },
    });
  await shipment.save();

  const payload = {
    clientReferenceOrderId: String(order.orderId),
    serviceType: "local",
    vehicleMode: resolveVehicleMode(order, config),
    paymentType: isCod ? "COD" : "PrePaid",
    pickupDetails,
    dropDetails,
    itemDetails: resolveItemDetails(order),
    metadata: { readyToShip: config.readyToShip },
    ...(order.deliveryInstructions ? { deliveryInstructions: str(order.deliveryInstructions, 200) } : {}),
  };

  const webhook = buildWebhookBlock(config);
  if (webhook) payload.webhook = webhook;

  try {
    const response = await sendDelhiveryLocalRequest({ method: "POST", path: PATHS.create, json: payload });
    const body = response.data || {};
    const data = body.data || {};
    const crn = data.order_id || data.orderId;

    if (body.success !== true || data.success === false || !crn) {
      throw new DelhiveryLocalOrderCreationFailedError(
        extractLocalErrorMessage(body, "Delhivery Local rejected the order."),
        body
      );
    }

    const now = new Date();
    shipment.awbNumber = String(crn); // Local CRN order id lives in awbNumber (shared plumbing).
    shipment.shipmentStatus = "ORDER_CREATED";
    shipment.providerStatus = config.readyToShip ? "created" : "creating";
    shipment.failureReason = null;
    shipment.lastProviderResponse = body;
    shipment.lastProviderSyncAt = now;
    shipment.timeline.push({
      status: "ORDER_CREATED",
      providerStatus: shipment.providerStatus,
      description: `Delhivery Local order created (${crn})`,
      source: "api",
      timestamp: now,
    });
    await shipment.save();

    order.deliveryProvider = "delhivery";
    order.awbNumber = String(crn);
    order.deliveryFailureReason = null;
    if (order.workflowStatus === "SELLER_ACCEPTED" || order.workflowStatus === "DELIVERY_SEARCH") {
      order.workflowStatus = "DELIVERY_SEARCH";
    }
    if (typeof order.save === "function") await order.save().catch(() => {});

    emitOrderStatusUpdate(order.orderId, {
      workflowStatus: order.workflowStatus,
      deliveryProvider: "delhivery",
      awbNumber: String(crn),
    });

    logger.info(`[DelhiveryLocal] Order #${orderId} created as ${crn}`);
    return shipment;
  } catch (err) {
    shipment.shipmentStatus = "FAILED";
    shipment.failedAt = new Date();
    shipment.failureReason = err.message;
    shipment.lastProviderResponse = err.details || { error: err.message };
    await shipment.save();

    order.deliveryProvider = "delhivery";
    order.deliveryFailureReason = err.message;
    if (typeof order.save === "function") await order.save().catch(() => {});

    logger.error(`[DelhiveryLocal] Failed to create order #${orderId}: ${err.message}`);
    throw err instanceof DelhiveryLocalOrderCreationFailedError
      ? err
      : new DelhiveryLocalOrderCreationFailedError(err.message, err.details);
  }
}

/**
 * Confirms an order created with readyToShip=false so Delhivery starts fulfilment.
 */
export async function confirmLocalOrder(orderId) {
  const shipment = await Shipment.findOne({ internalOrderId: orderId, providerType: "forward" });
  if (!shipment || !shipment.awbNumber) {
    throw new DelhiveryLocalInvalidRequestError(`No Delhivery Local order found for #${orderId}.`);
  }
  const response = await sendDelhiveryLocalRequest({
    method: "POST",
    path: PATHS.confirm,
    json: { orderId: shipment.awbNumber, readyToShip: true },
  });
  const body = response.data || {};
  if (body.success !== true) {
    throw new DelhiveryLocalInvalidRequestError(extractLocalErrorMessage(body, "Delhivery Local confirm failed."), body);
  }
  shipment.providerStatus = "created";
  shipment.timeline.push({
    status: shipment.shipmentStatus,
    description: "Delhivery Local order confirmed (readyToShip)",
    source: "api",
    timestamp: new Date(),
  });
  await shipment.save();
  return shipment;
}

/**
 * Cancels a live Local order. Returns null when there is nothing live to cancel.
 */
export async function cancelLocalOrder(orderId, reason = "service is no longer required") {
  const shipment = await Shipment.findOne({ internalOrderId: orderId, providerType: "forward" });

  if (shipment?.shipmentStatus === "DELIVERED") {
    throw new DelhiveryLocalInvalidRequestError("Cannot cancel: the Delhivery Local order is already delivered.");
  }
  if (!shipment || !shipment.awbNumber || !LIVE_LOCAL_STATUSES.includes(shipment.shipmentStatus)) {
    logger.info(`[DelhiveryLocal] No live Local order to cancel for #${orderId}`);
    return null;
  }

  const cancellationReason = normalizeCancellationReason(reason);
  let body;
  try {
    const response = await sendDelhiveryLocalRequest({
      method: "POST",
      path: PATHS.cancel,
      json: { orderId: shipment.awbNumber, cancellationReason },
    });
    body = response.data || {};
  } catch (err) {
    logger.error(`[DelhiveryLocal] Cancellation failed for #${orderId}: ${err.message}`);
    throw new DelhiveryLocalCancellationFailedError(err.message, err.details);
  }

  if (body.success !== true) {
    const message = extractLocalErrorMessage(body, "Delhivery Local refused the cancellation.");
    throw new DelhiveryLocalCancellationFailedError(message, body);
  }

  const now = new Date();
  shipment.shipmentStatus = "CANCELLED";
  shipment.providerStatus = "cancelled";
  shipment.cancelledAt = now;
  shipment.failureReason = cancellationReason;
  shipment.lastProviderResponse = body;
  shipment.lastProviderSyncAt = now;
  shipment.timeline.push({
    status: "CANCELLED",
    providerStatus: "cancelled",
    description: `Cancelled with Delhivery Local: ${cancellationReason}`,
    source: "api",
    timestamp: now,
  });
  await shipment.save();
  return shipment;
}

/**
 * Applies a lifecycle timestamp for a newly reached Local status.
 */
function applyLocalTimestamps(shipment, status, at = new Date()) {
  if (status === "PICKED_UP" && !shipment.pickedUpAt) shipment.pickedUpAt = at;
  if (status === "DELIVERED" && !shipment.deliveredAt) shipment.deliveredAt = at;
  if (status === "CANCELLED" && !shipment.cancelledAt) shipment.cancelledAt = at;
  if (status === "FAILED" && !shipment.failedAt) shipment.failedAt = at;
}

/**
 * Applies a parsed Local fulfilment update (from track or webhook) to the shipment,
 * then reconciles the linked order. Shared by the tracking and webhook paths.
 */
export async function applyLocalFulfilment(shipment, { fulfilmentStatus, orderStatus, partnerInfo, trackingUrl, raw }) {
  const normalized = mapLocalStatus(fulfilmentStatus, orderStatus);
  const providerText = fulfilmentStatus || orderStatus || "";
  const now = new Date();
  let reached = null;

  if (partnerInfo && (partnerInfo.name || partnerInfo.mobile)) {
    shipment.rider = {
      id: partnerInfo.vehicleNumber || shipment.rider?.id,
      name: partnerInfo.name || shipment.rider?.name,
      phone: partnerInfo.mobile?.mobileNumber || shipment.rider?.phone,
      latitude: partnerInfo.location?.lat ?? shipment.rider?.latitude,
      longitude: partnerInfo.location?.long ?? shipment.rider?.longitude,
      lastLocationAt: now,
    };
  }

  if (normalized && isValidForwardStatusTransition(shipment.shipmentStatus, normalized)) {
    if (shipment.shipmentStatus !== normalized || shipment.providerStatus !== providerText) {
      applyLocalTimestamps(shipment, normalized, now);
      shipment.timeline.push({
        status: normalized,
        providerStatus: providerText,
        description: `Local: ${providerText}`,
        source: "reconciliation",
        timestamp: now,
      });
    }
    shipment.shipmentStatus = normalized;
    shipment.providerStatus = providerText;
    reached = normalized;
  } else if (!normalized && providerText && providerText !== shipment.providerStatus) {
    shipment.providerStatus = providerText;
    shipment.timeline.push({
      status: shipment.shipmentStatus,
      providerStatus: providerText,
      description: `Local: ${providerText}`,
      source: "reconciliation",
      timestamp: now,
    });
  }

  if (trackingUrl) {
    shipment.serviceabilityDetails = { ...(shipment.serviceabilityDetails || {}), quote: { trackingUrl } };
  }
  shipment.lastProviderResponse = raw || shipment.lastProviderResponse;
  shipment.lastProviderSyncAt = now;
  await shipment.save();

  if (reached) {
    await syncOrderWithShipmentStatus(shipment, reached, { rawStatus: providerText });
  }
  return reached;
}

/**
 * Fetches the latest Local order state and applies it to the shipment + order.
 * @param {string} orderIdOrCrn  internal order id or the Delhivery CRN.
 */
export async function trackLocalOrder(orderIdOrCrn) {
  const shipment = await Shipment.findOne({
    $or: [{ internalOrderId: orderIdOrCrn }, { awbNumber: orderIdOrCrn }],
    providerType: "forward",
  });
  if (!shipment || !shipment.awbNumber) {
    throw new DelhiveryLocalInvalidRequestError(`No Delhivery Local order found for identifier: ${orderIdOrCrn}`);
  }

  let body;
  try {
    const response = await sendDelhiveryLocalRequest({ method: "GET", path: PATHS.track(shipment.awbNumber) });
    body = response.data || {};
  } catch (err) {
    throw new DelhiveryLocalTrackingFailedError(err.message, err.details);
  }

  const data = body.data || body;
  await applyLocalFulfilment(shipment, {
    fulfilmentStatus: data.fulfilmentStatus,
    orderStatus: data.status,
    partnerInfo: data.partnerInfo,
    trackingUrl: data.trackingUrl,
    raw: body,
  });

  return {
    shipmentId: shipment._id,
    internalOrderId: shipment.internalOrderId,
    orderId: shipment.awbNumber,
    shipmentStatus: shipment.shipmentStatus,
    providerStatus: shipment.providerStatus,
    trackingUrl: data.trackingUrl || null,
    rider: shipment.rider || null,
    lastSyncAt: shipment.lastProviderSyncAt,
  };
}
