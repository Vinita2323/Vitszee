import Shipment from "../../models/shipment.js";
import Order from "../../models/order.js";
import logger from "../logger.js";
import { getDelhiveryConfig } from "./delhiveryConfig.js";
import { sendDelhiveryRequest, extractDelhiveryErrorMessage } from "./delhiveryClient.js";
import { mapDelhiveryStatus, isValidForwardStatusTransition } from "./delhiveryStatusMapper.js";
import { syncOrderWithShipmentStatus } from "./delhiveryOrderSync.js";
import { ensureSellerPickupLocation, resolveSellerPickupDetails } from "./delhiveryWarehouseService.js";
import {
  DelhiveryServiceabilityError,
  DelhiveryOrderCreationFailedError,
  DelhiveryCancellationFailedError,
  DelhiveryTrackingFailedError,
  DelhiveryInvalidRequestError,
  DelhiveryPickupRequestError,
} from "./delhiveryErrors.js";
import { emitOrderStatusUpdate } from "../orderSocketEmitter.js";

// Shipment states that mean a real, live shipment exists at Delhivery.
export const LIVE_FORWARD_STATUSES = [
  "ORDER_CREATED",
  "DISPATCH_READY",
  "RIDER_ASSIGNED",
  "RIDER_ARRIVED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
];

// Delhivery rejects these characters anywhere in the payload.
function clean(value, maxLength = 250) {
  return String(value ?? "")
    .replace(/[&#%;\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Looks up one pincode in Delhivery's serviceability list.
 * Response: { delivery_codes: [ { postal_code: { pin, cod, pre_paid, pickup, ... } } ] }
 */
export async function getPincodeServiceability(pincode) {
  const response = await sendDelhiveryRequest({
    method: "GET",
    path: "/c/api/pin-codes/json/",
    params: { filter_codes: String(pincode).trim() },
  });
  const entries = response.data?.delivery_codes || [];
  const postal = entries[0]?.postal_code;
  return postal || null;
}

/**
 * Checks that Delhivery can pick up at the seller and deliver to the customer.
 * Returns { serviceable, reason, data } and never throws, so callers can record the reason.
 */
export async function checkForwardServiceability({ pickupPincode, deliveryPincode, isCod = false }) {
  const pickup = String(pickupPincode || "").trim();
  const delivery = String(deliveryPincode || "").trim();

  try {
    const [pickupInfo, deliveryInfo] = await Promise.all([
      getPincodeServiceability(pickup),
      getPincodeServiceability(delivery),
    ]);

    if (!pickupInfo) {
      return { serviceable: false, reason: `Delhivery does not operate in pickup pincode ${pickup}`, data: null };
    }
    if (String(pickupInfo.pickup || "").toUpperCase() !== "Y") {
      return { serviceable: false, reason: `Delhivery cannot pick up from pincode ${pickup}`, data: { pickupInfo } };
    }
    if (!deliveryInfo) {
      return { serviceable: false, reason: `Delhivery does not deliver to pincode ${delivery}`, data: null };
    }

    const flag = isCod ? deliveryInfo.cod : deliveryInfo.pre_paid;
    if (String(flag || "").toUpperCase() !== "Y") {
      return {
        serviceable: false,
        reason: `Delhivery does not accept ${isCod ? "COD" : "prepaid"} deliveries to pincode ${delivery}`,
        data: { deliveryInfo },
      };
    }

    return { serviceable: true, reason: null, data: { pickupInfo, deliveryInfo } };
  } catch (err) {
    logger.warn("[Delhivery] Serviceability check failed", { error: err.message });
    return { serviceable: false, reason: err.message || "Delhivery serviceability check failed.", data: err.details || null };
  }
}

/**
 * Reads the customer delivery address off the order, validated the way Delhivery needs it.
 */
function resolveDropDetails(order) {
  const address = order.address || {};
  const customer = order.customer || {};

  const phone = String(address.phone || customer.phone || "").replace(/[^0-9]/g, "").slice(-10);
  if (phone.length !== 10) {
    throw new DelhiveryInvalidRequestError("Customer phone number is missing or invalid (must be 10 digits).");
  }

  const line = clean(address.fullAddress || address.address || address.landmark, 250);
  if (!line) throw new DelhiveryInvalidRequestError("Customer delivery address is missing.");

  let pin = String(address.pincode || "").trim();
  if (!/^\d{6}$/.test(pin)) {
    const match = line.match(/\b\d{6}\b/);
    const fromSaved = Array.isArray(customer.addresses)
      ? customer.addresses.find((a) => /^\d{6}$/.test(String(a?.pincode || "").trim()))?.pincode
      : null;
    pin = match ? match[0] : String(fromSaved || "").trim();
  }
  if (!/^\d{6}$/.test(pin)) {
    throw new DelhiveryInvalidRequestError("Customer delivery address is missing a valid 6-digit pincode.");
  }

  return {
    name: clean(address.name || customer.name || "Customer", 100),
    phone,
    address: line,
    city: clean(address.city, 50),
    state: clean(address.state, 50),
    pin,
  };
}

/**
 * Creates a forward (delivery) shipment with Delhivery.
 * Idempotent: an order that already has a live shipment returns that shipment.
 */
export async function createForwardOrder(orderId, options = {}) {
  const config = await getDelhiveryConfig();
  if (!config.forwardEnabled) {
    throw new DelhiveryInvalidRequestError("Delhivery delivery is currently disabled in settings.");
  }

  const order = await Order.findOne({ orderId })
    .populate("customer", "name phone email addresses")
    .populate("seller", "shopName name phone email address locality city state pincode delhiveryWarehouse")
    .populate("items.product", "name price sku");

  if (!order) throw new DelhiveryInvalidRequestError(`Order #${orderId} not found.`);

  const existingShipment = await Shipment.findOne({ internalOrderId: orderId, providerType: "forward" });

  if (existingShipment && [...LIVE_FORWARD_STATUSES, "DELIVERED"].includes(existingShipment.shipmentStatus)) {
    logger.info(`[Delhivery] Shipment already exists for order #${orderId} (AWB ${existingShipment.awbNumber})`);
    if (!order.awbNumber && existingShipment.awbNumber) {
      order.deliveryProvider = "delhivery";
      order.awbNumber = existingShipment.awbNumber;
      if (typeof order.save === "function") await order.save().catch(() => {});
    }
    return existingShipment;
  }

  // A cancelled waybill cannot be reused: Delhivery keeps the order id linked to it.
  if (existingShipment && existingShipment.shipmentStatus === "CANCELLED") {
    throw new DelhiveryInvalidRequestError(
      `Order #${orderId} already has a cancelled Delhivery shipment (AWB ${existingShipment.awbNumber || "n/a"}); it cannot be re-dispatched automatically.`
    );
  }

  const seller = order.seller || {};
  const pickup = resolveSellerPickupDetails(seller);
  const drop = resolveDropDetails(order);

  const grandTotal = Number(order.paymentBreakdown?.grandTotal ?? order.pricing?.total ?? 0);
  const isCod =
    String(order.paymentMode || "").toUpperCase() === "COD" ||
    String(order.payment?.method || "").toLowerCase() === "cash";

  if (config.autoServiceabilityCheck) {
    const serviceability = await checkForwardServiceability({
      pickupPincode: pickup.pin,
      deliveryPincode: drop.pin,
      isCod,
    });
    if (!serviceability.serviceable) {
      order.deliveryProvider = "delhivery";
      order.deliveryFailureReason = serviceability.reason;
      if (typeof order.save === "function") await order.save().catch(() => {});
      throw new DelhiveryServiceabilityError(serviceability.reason);
    }
  }

  const pickupLocationName = await ensureSellerPickupLocation(seller);

  const productsDesc = clean(
    (order.items || [])
      .map((item) => item.name || item.product?.name)
      .filter(Boolean)
      .join(", ") || "Order items",
    200
  );
  const quantity = (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 1), 0) || 1;

  const shipment = existingShipment ||
    new Shipment({
      orderMongoId: order._id,
      internalOrderId: order.orderId,
      clientOrderId: order.orderId,
      deliveryProvider: "delhivery",
      providerType: "forward",
      shipmentStatus: "PENDING",
      serviceabilityStatus: "serviceable",
      pickupDetails: {
        name: pickupLocationName,
        contact: pickup.phone,
        address: pickup.address,
        city: pickup.city,
        state: pickup.state,
        pincode: pickup.pin,
      },
      dropDetails: {
        name: drop.name,
        contact: drop.phone,
        address: drop.address,
        city: drop.city,
        state: drop.state,
        pincode: drop.pin,
      },
      environment: config.environment,
    });

  shipment.pickupLocationName = pickupLocationName;
  await shipment.save();

  // Delhivery's manifestation API takes a form body: format=json&data=<json>
  const manifest = {
    pickup_location: { name: pickupLocationName },
    shipments: [
      {
        order: String(order.orderId),
        order_date: new Date(order.createdAt || Date.now()).toISOString().slice(0, 19).replace("T", " "),
        name: drop.name,
        add: drop.address,
        city: drop.city,
        state: drop.state,
        country: "India",
        phone: drop.phone,
        pin: drop.pin,
        payment_mode: isCod ? "COD" : "Prepaid",
        cod_amount: isCod ? grandTotal : 0,
        total_amount: grandTotal,
        products_desc: productsDesc,
        quantity: String(quantity),
        weight: String(config.defaultWeightGrams),
        shipping_mode: config.shippingMode,
        seller_name: clean(seller.shopName || seller.name, 100),
        seller_add: pickup.address,
        return_add: pickup.address,
        return_city: pickup.city,
        return_state: pickup.state,
        return_country: "India",
        return_pin: pickup.pin,
        return_phone: pickup.phone,
        ...(options.extraShipmentFields || {}),
      },
    ],
  };

  try {
    const response = await sendDelhiveryRequest({
      method: "POST",
      path: "/api/cmu/create.json",
      form: { format: "json", data: JSON.stringify(manifest) },
    });

    const body = response.data || {};
    const packages = Array.isArray(body.packages) ? body.packages : [];
    const pkg = packages.find((p) => String(p?.refnum) === String(order.orderId)) || packages[0] || {};
    const waybill = pkg.waybill ? String(pkg.waybill) : "";
    const packageFailed = pkg.status && String(pkg.status).toLowerCase() !== "success";

    if (!waybill || body.success === false || packageFailed) {
      throw new DelhiveryOrderCreationFailedError(
        extractDelhiveryErrorMessage(body, "Delhivery rejected the shipment."),
        body
      );
    }

    shipment.awbNumber = waybill;
    shipment.delhiveryUploadWbn = body.upload_wbn ? String(body.upload_wbn) : undefined;
    shipment.shipmentStatus = "ORDER_CREATED";
    shipment.providerStatus = "Manifested";
    shipment.failureReason = null;
    shipment.lastProviderResponse = body;
    shipment.lastProviderSyncAt = new Date();
    shipment.timeline.push({
      status: "ORDER_CREATED",
      providerStatus: "Manifested",
      description: `Delhivery shipment created (AWB ${waybill})`,
      source: "api",
      timestamp: new Date(),
    });
    await shipment.save();

    order.deliveryProvider = "delhivery";
    order.awbNumber = waybill;
    order.deliveryFailureReason = null;
    if (order.workflowStatus === "SELLER_ACCEPTED" || order.workflowStatus === "DELIVERY_SEARCH") {
      order.workflowStatus = "DELIVERY_SEARCH";
    }
    if (typeof order.save === "function") await order.save().catch(() => {});

    emitOrderStatusUpdate(order.orderId, {
      workflowStatus: order.workflowStatus,
      deliveryProvider: "delhivery",
      awbNumber: waybill,
    });

    if (config.autoPickupRequest) {
      // A pickup request tells Delhivery to collect from the seller. Failure here does not
      // invalidate the shipment, so it is logged and retried by the admin action.
      try {
        const pickupRequest = await createPickupRequest(pickupLocationName);
        shipment.pickupRequestId = String(pickupRequest.pickup_id || "");
        shipment.timeline.push({
          status: shipment.shipmentStatus,
          description: `Pickup requested from Delhivery (id ${pickupRequest.pickup_id}, ${pickupRequest.pickup_date} ${pickupRequest.pickup_time})`,
          source: "api",
          timestamp: new Date(),
        });
        await shipment.save();
      } catch (pickupError) {
        logger.warn(`[Delhivery] Pickup request failed for order #${orderId}: ${pickupError.message}`);
      }
    }

    return shipment;
  } catch (err) {
    shipment.shipmentStatus = "FAILED";
    shipment.failureReason = err.message;
    shipment.lastProviderResponse = err.details || { error: err.message };
    await shipment.save();

    order.deliveryProvider = "delhivery";
    order.deliveryFailureReason = err.message;
    if (typeof order.save === "function") await order.save().catch(() => {});

    logger.error(`[Delhivery] Failed to create shipment for order #${orderId}`, { error: err.message });
    throw err instanceof DelhiveryOrderCreationFailedError
      ? err
      : new DelhiveryOrderCreationFailedError(err.message, err.details);
  }
}

/**
 * Asks Delhivery to collect parcels from a pickup location.
 * Pickups requested after the cut-off hour are scheduled for the next day.
 */
export async function createPickupRequest(pickupLocationName, { packageCount = 1, date = null, time = null } = {}) {
  const config = await getDelhiveryConfig();
  const when = date ? new Date(date) : new Date();
  if (!date && when.getHours() >= config.pickupCutoffHour) {
    when.setDate(when.getDate() + 1);
  }

  const response = await sendDelhiveryRequest({
    method: "POST",
    path: "/fm/request/new/",
    json: {
      pickup_location: pickupLocationName,
      pickup_date: when.toISOString().slice(0, 10),
      pickup_time: time || config.pickupTime,
      expected_package_count: packageCount,
    },
  });

  const body = response.data || {};
  if (!body.pickup_id) {
    throw new DelhiveryPickupRequestError(extractDelhiveryErrorMessage(body, "Delhivery refused the pickup request."), body);
  }
  return body;
}

/**
 * Sets the lifecycle timestamp that belongs to a newly reached shipment status.
 */
export function applyForwardStatusTimestamps(shipment, shipmentStatus, at = new Date()) {
  if (shipmentStatus === "PICKED_UP" && !shipment.pickedUpAt) shipment.pickedUpAt = at;
  if (shipmentStatus === "DELIVERED" && !shipment.deliveredAt) shipment.deliveredAt = at;
  if (shipmentStatus === "CANCELLED" && !shipment.cancelledAt) shipment.cancelledAt = at;
  if (shipmentStatus === "FAILED" && !shipment.failedAt) shipment.failedAt = at;
}

/**
 * Cancels a shipment at Delhivery (POST /api/p/edit with cancellation=true).
 * Returns null when there is nothing live to cancel.
 */
export async function cancelForwardOrder(orderId, cancelReason = "Cancelled by user") {
  const shipment = await Shipment.findOne({ internalOrderId: orderId, providerType: "forward" });

  if (shipment?.shipmentStatus === "DELIVERED") {
    throw new DelhiveryInvalidRequestError("Cannot cancel: the Delhivery shipment is already delivered.");
  }
  if (!shipment || !shipment.awbNumber || !LIVE_FORWARD_STATUSES.includes(shipment.shipmentStatus)) {
    logger.info(`[Delhivery] No live shipment to cancel for order #${orderId}`);
    return null;
  }

  let body;
  try {
    const response = await sendDelhiveryRequest({
      method: "POST",
      path: "/api/p/edit",
      json: { waybill: shipment.awbNumber, cancellation: "true" },
    });
    body = response.data || {};
  } catch (err) {
    logger.error(`[Delhivery] Cancellation failed for order #${orderId}`, { error: err.message });
    throw new DelhiveryCancellationFailedError(err.message, err.details);
  }

  if (body.status !== true && String(body.status).toLowerCase() !== "success") {
    const message = extractDelhiveryErrorMessage(body, "Delhivery refused the cancellation.");
    logger.error(`[Delhivery] Cancellation refused for order #${orderId}`, { error: message });
    throw new DelhiveryCancellationFailedError(message, body);
  }

  const now = new Date();
  shipment.shipmentStatus = "CANCELLED";
  shipment.providerStatus = "Cancelled";
  shipment.cancelledAt = now;
  shipment.failureReason = cancelReason;
  shipment.lastProviderResponse = body;
  shipment.lastProviderSyncAt = now;
  shipment.timeline.push({
    status: "CANCELLED",
    providerStatus: "Cancelled",
    description: `Cancelled with Delhivery: ${body.remark || cancelReason}`,
    source: "api",
    timestamp: now,
  });
  await shipment.save();

  return shipment;
}

/**
 * Fetches the latest scan from Delhivery and applies it to the shipment and the order.
 * Used by the reconciliation job and the admin "sync" action.
 */
export async function trackForwardOrder(orderIdOrAwb) {
  const shipment = await Shipment.findOne({
    $or: [{ internalOrderId: orderIdOrAwb }, { awbNumber: orderIdOrAwb }],
    providerType: "forward",
  });

  if (!shipment || !shipment.awbNumber) {
    throw new DelhiveryInvalidRequestError(`No Delhivery shipment found for identifier: ${orderIdOrAwb}`);
  }

  const config = await getDelhiveryConfig();
  let body;
  try {
    const response = await sendDelhiveryRequest({
      method: "GET",
      path: "/api/v1/packages/json/",
      params: { waybill: shipment.awbNumber },
    });
    body = response.data || {};
  } catch (err) {
    throw new DelhiveryTrackingFailedError(err.message, err.details);
  }

  const data = Array.isArray(body.ShipmentData) ? body.ShipmentData : [];
  const parcel = data[0]?.Shipment;

  if (!parcel) {
    // Delhivery does not know this waybill (e.g. a placeholder saved by older code).
    // Mark it FAILED so it stops being polled and the order can be dispatched again.
    if (shipment.environment === config.environment && LIVE_FORWARD_STATUSES.includes(shipment.shipmentStatus)) {
      const reason = `Delhivery does not recognise AWB ${shipment.awbNumber}`;
      shipment.shipmentStatus = "FAILED";
      shipment.failedAt = new Date();
      shipment.failureReason = reason;
      shipment.lastProviderSyncAt = new Date();
      shipment.timeline.push({ status: "FAILED", description: reason, source: "reconciliation", timestamp: new Date() });
      await shipment.save();
      await Order.updateOne({ orderId: shipment.internalOrderId }, { $set: { deliveryFailureReason: reason } });
    }
    throw new DelhiveryTrackingFailedError(`Delhivery has no data for AWB ${shipment.awbNumber}`, body);
  }

  const scan = parcel.Status || {};
  const rawStatus = String(scan.Status || "").trim();
  const statusType = String(scan.StatusType || "").trim();
  const normalizedStatus = mapDelhiveryStatus(rawStatus, statusType);
  const description = `Tracking: ${rawStatus}${scan.Instructions ? ` (${clean(scan.Instructions, 120)})` : ""}`;
  let reachedStatus = null;

  if (normalizedStatus && isValidForwardStatusTransition(shipment.shipmentStatus, normalizedStatus)) {
    if (shipment.shipmentStatus !== normalizedStatus || shipment.providerStatus !== rawStatus) {
      applyForwardStatusTimestamps(shipment, normalizedStatus);
      shipment.timeline.push({
        status: normalizedStatus,
        providerStatus: rawStatus,
        description,
        source: "reconciliation",
        timestamp: new Date(),
      });
    }
    shipment.shipmentStatus = normalizedStatus;
    shipment.providerStatus = rawStatus;
    reachedStatus = normalizedStatus;
  } else if (!normalizedStatus && rawStatus && rawStatus !== shipment.providerStatus) {
    shipment.providerStatus = rawStatus;
    shipment.timeline.push({
      status: shipment.shipmentStatus,
      providerStatus: rawStatus,
      description,
      source: "reconciliation",
      timestamp: new Date(),
    });
  }

  shipment.lastProviderResponse = body;
  shipment.lastProviderSyncAt = new Date();
  await shipment.save();

  if (reachedStatus) {
    await syncOrderWithShipmentStatus(shipment, reachedStatus, { rawStatus, remarks: scan.Instructions || null });
  }

  return {
    shipmentId: shipment._id,
    internalOrderId: shipment.internalOrderId,
    awbNumber: shipment.awbNumber,
    shipmentStatus: shipment.shipmentStatus,
    providerStatus: shipment.providerStatus,
    statusLocation: scan.StatusLocation || null,
    lastSyncAt: shipment.lastProviderSyncAt,
  };
}
