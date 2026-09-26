import Shipment from "../../models/shipment.js";
import Order from "../../models/order.js";
import Seller from "../../models/seller.js";
import User from "../../models/customer.js";
import logger from "../logger.js";
import { getShadowfaxConfig } from "./shadowfaxConfig.js";
import { sendShadowfaxRequest, extractShadowfaxErrorMessage } from "./shadowfaxClient.js";
import {
  mapShadowfaxForwardStatus,
  isValidForwardStatusTransition,
} from "./shadowfaxStatusMapper.js";
import { syncOrderWithShipmentStatus } from "./shadowfaxOrderSync.js";
import {
  ShadowfaxServiceabilityError,
  ShadowfaxOrderCreationFailedError,
  ShadowfaxOrderUpdateFailedError,
  ShadowfaxCancellationFailedError,
  ShadowfaxTrackingFailedError,
  ShadowfaxInvalidRequestError,
} from "./shadowfaxErrors.js";
import { emitOrderStatusUpdate } from "../orderSocketEmitter.js";
import { emitNotificationEvent } from "../../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../../modules/notifications/notification.constants.js";

/**
 * Checks route serviceability with Shadowfax.
 */
export async function checkForwardServiceability({
  pickupPincode,
  deliveryPincode,
}) {
  const pickup = String(pickupPincode || "").trim();
  const delivery = String(deliveryPincode || "").trim();

  try {
    // Shadowfax's serviceability API returns the list of pincodes Shadowfax
    // services for a given operation, not a pickup->delivery pair check.
    // We query both legs (seller_pickup for the store, customer_delivery for
    // the drop) and require both pincodes to be present in their respective lists.
    const [pickupResp, deliveryResp] = await Promise.all([
      sendShadowfaxRequest({
        method: "GET",
        endpoint: "/api/v1/clients/serviceability/",
        type: "forward",
        params: { service: "seller_pickup", pincodes: pickup },
      }),
      sendShadowfaxRequest({
        method: "GET",
        endpoint: "/api/v1/clients/serviceability/",
        type: "forward",
        params: { service: "customer_delivery", pincodes: delivery },
      }),
    ]);

    const pickupList = Array.isArray(pickupResp.data) ? pickupResp.data : pickupResp.data?.data || [];
    const deliveryList = Array.isArray(deliveryResp.data) ? deliveryResp.data : deliveryResp.data?.data || [];

    const pickupServiceable = pickupList.some((entry) => String(entry.code) === pickup);
    const deliveryServiceable = deliveryList.some((entry) => String(entry.code) === delivery);
    const isServiceable = pickupServiceable && deliveryServiceable;

    return {
      serviceable: isServiceable,
      data: { pickup: pickupList, delivery: deliveryList },
      reason: isServiceable
        ? null
        : !pickupServiceable
        ? `Pickup pincode ${pickup} is not serviceable by Shadowfax`
        : `Delivery pincode ${delivery} is not serviceable by Shadowfax`,
    };
  } catch (err) {
    logger.warn("[Shadowfax] Serviceability check failed", { error: err.message });
    return {
      serviceable: false,
      data: err.details || null,
      reason: err.message || "Shadowfax delivery is currently unavailable for this location.",
    };
  }
}

// Shipment states that mean a real, live order exists at Shadowfax.
const LIVE_FORWARD_STATUSES = [
  "ORDER_CREATED",
  "DISPATCH_READY",
  "RIDER_ASSIGNED",
  "RIDER_ARRIVED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
];

/**
 * Shadowfax answers a duplicate client_order_id with HTTP 200 + "Failure" and the
 * existing AWB, either as an `AWB` field or inside the error text.
 */
function extractDuplicateAwb(body) {
  if (!body || typeof body !== "object") return null;
  if (body.AWB) return String(body.AWB);
  const match = JSON.stringify(body.errors || "").match(/already created with AWB\s*:\s*([A-Za-z0-9]+)/i);
  return match ? match[1] : null;
}

/**
 * Creates a forward delivery order with Shadowfax.
 * Features Idempotency Protection against duplicate shipments.
 */
export async function createForwardOrder(orderId, options = {}) {
  const config = await getShadowfaxConfig();
  if (!config.forwardEnabled) {
    throw new ShadowfaxInvalidRequestError("Shadowfax forward delivery is currently disabled in settings.");
  }

  // 1. Fetch Order with populated customer and seller
  const order = await Order.findOne({ orderId })
    .populate("customer", "name phone email addresses")
    .populate("seller", "shopName name phone address locality location city state pincode")
    .populate("items.product", "name price sku");

  if (!order) {
    throw new ShadowfaxInvalidRequestError(`Order #${orderId} not found.`);
  }

  // 2. Check for existing active shipment (Idempotency Guard)
  const existingShipment = await Shipment.findOne({
    internalOrderId: orderId,
    providerType: "forward",
  });

  if (existingShipment && [...LIVE_FORWARD_STATUSES, "DELIVERED"].includes(existingShipment.shipmentStatus)) {
    logger.info(`[Shadowfax] Active shipment already exists for order #${orderId}. Reusing ${existingShipment.awbNumber || existingShipment._id}`);
    if (!order.awbNumber && existingShipment.awbNumber) {
      order.deliveryProvider = "shadowfax";
      order.awbNumber = existingShipment.awbNumber;
      if (typeof order.save === "function") await order.save().catch(() => {});
    }
    return existingShipment;
  }

  // Shadowfax keeps a cancelled client_order_id, so re-creating it would just return
  // the cancelled AWB. Only FAILED/PENDING shipments (nothing live at Shadowfax) are retried.
  if (existingShipment && existingShipment.shipmentStatus === "CANCELLED") {
    throw new ShadowfaxInvalidRequestError(
      `Order #${orderId} already has a cancelled Shadowfax shipment (AWB ${existingShipment.awbNumber || "n/a"}); it cannot be re-dispatched automatically.`
    );
  }

  // 3. Extract & Validate Pickup (Seller) & Drop (Customer) Details
  const seller = order.seller || {};
  const customer = order.customer || {};
  const address = order.address || {};

  // Validate Seller (Pickup) Details
  const sellerPhone = String(seller.phone || "").replace(/[^0-9]/g, "").slice(-10);
  if (!sellerPhone || sellerPhone.length !== 10) {
    throw new ShadowfaxInvalidRequestError("Seller pickup phone number is missing or invalid (must be 10 digits).");
  }
  const sellerAddressLine = String(seller.address || seller.locality || seller.shopName || "").trim();
  if (!sellerAddressLine) {
    throw new ShadowfaxInvalidRequestError("Seller pickup address line is missing.");
  }
  const sellerCity = String(seller.city || "").trim();
  if (!sellerCity) {
    throw new ShadowfaxInvalidRequestError("Seller pickup city is missing.");
  }
  const sellerState = String(seller.state || "").trim();
  if (!sellerState) {
    throw new ShadowfaxInvalidRequestError("Seller pickup state is missing.");
  }
  let sellerPincode = String(seller.pincode || "").trim();
  if (!/^\d{6}$/.test(sellerPincode)) {
    const match = sellerAddressLine.match(/\b\d{6}\b/);
    if (match) {
      sellerPincode = match[0];
    } else {
      throw new ShadowfaxInvalidRequestError("Seller pickup pincode is missing or invalid (must be 6 digits).");
    }
  }

  // Validate Customer (Drop) Details
  const customerPhone = String(address.phone || customer.phone || "").replace(/[^0-9]/g, "").slice(-10);
  if (!customerPhone || customerPhone.length !== 10) {
    throw new ShadowfaxInvalidRequestError("Customer delivery contact phone number is missing or invalid (must be 10 digits).");
  }
  const customerAddressLine = String(address.fullAddress || address.address || address.landmark || "").trim();
  if (!customerAddressLine) {
    throw new ShadowfaxInvalidRequestError("Customer delivery address line is missing.");
  }

  // City extraction
  let customerCity = String(address.city || "").trim();
  if (!customerCity && Array.isArray(customer.addresses)) {
    const matched = customer.addresses.find((a) => a.city);
    if (matched?.city) customerCity = String(matched.city).trim();
  }
  if (!customerCity && sellerCity) {
    customerCity = sellerCity;
  }
  if (!customerCity) {
    throw new ShadowfaxInvalidRequestError("Customer delivery city is missing.");
  }

  // State extraction
  let customerState = String(address.state || "").trim();
  if (!customerState && Array.isArray(customer.addresses)) {
    const matched = customer.addresses.find((a) => a.state);
    if (matched?.state) customerState = String(matched.state).trim();
  }
  if (!customerState && sellerState) {
    customerState = sellerState;
  }
  if (!customerState) {
    throw new ShadowfaxInvalidRequestError("Customer delivery state is missing.");
  }

  // Pincode extraction: strictly 6 digits, never silently falling back to 560001
  let customerPincode = "";
  if (address.pincode && /^\d{6}$/.test(String(address.pincode).trim())) {
    customerPincode = String(address.pincode).trim();
  } else {
    const match = customerAddressLine.match(/\b\d{6}\b/);
    if (match) {
      customerPincode = match[0];
    } else if (Array.isArray(customer.addresses)) {
      const matched = customer.addresses.find((a) => /^\d{6}$/.test(String(a.pincode || "").trim()));
      if (matched?.pincode) customerPincode = String(matched.pincode).trim();
    }
  }

  if (!customerPincode || !/^\d{6}$/.test(customerPincode)) {
    order.deliveryProvider = "shadowfax";
    order.deliveryFailureReason = "Customer delivery address is missing a valid 6-digit postal pincode.";
    if (typeof order.save === "function") await order.save().catch(() => {});
    throw new ShadowfaxInvalidRequestError("Customer delivery address is missing a valid 6-digit postal pincode.");
  }

  const pickupLat = seller.location?.coordinates?.[1] || seller.location?.lat || 0;
  const pickupLng = seller.location?.coordinates?.[0] || seller.location?.lng || 0;
  const dropLat = address.location?.lat || 0;
  const dropLng = address.location?.lng || 0;

  // 4. Check Serviceability if enabled
  if (config.autoServiceabilityCheck) {
    const serviceability = await checkForwardServiceability({
      pickupPincode: sellerPincode,
      deliveryPincode: customerPincode,
    });

    if (!serviceability.serviceable) {
      order.deliveryProvider = "shadowfax";
      order.deliveryFailureReason = serviceability.reason;
      if (typeof order.save === "function") await order.save().catch(() => {});
      throw new ShadowfaxServiceabilityError(serviceability.reason);
    }
  }

  // 5. Prepare Order Items
  const orderItems = (order.items || []).map((item, index) => ({
    sku_id: String(item.product?.sku || item.product?._id || `SKU-${index + 1}`),
    sku_name: item.name || item.product?.name || "Product Item",
    price: Number(item.price || 0),
    seller_details: {
      seller_name: seller.shopName || seller.name || "Seller",
    },
    additional_details: {
      quantity: Number(item.quantity || 1),
    },
  }));

  const grandTotal = Number(order.paymentBreakdown?.grandTotal ?? order.pricing?.total ?? 0);
  const isCod = String(order.paymentMode || "").toUpperCase() === "COD" || String(order.payment?.method || "").toLowerCase() === "cash";

  // 6. Build Official Shadowfax Order Payload
  const payload = {
    order_type: "marketplace",
    client_code: config.clientCode || undefined,
    order_details: {
      client_order_id: String(order.orderId),
      // Shadowfax weights are in grams.
      actual_weight: config.defaultWeightGrams,
      volumetric_weight: config.defaultWeightGrams,
      product_value: grandTotal,
      payment_mode: isCod ? "COD" : "Prepaid",
      cod_amount: isCod ? grandTotal : 0,
      total_amount: grandTotal,
    },
    customer_details: {
      name: address.name || customer.name || "Customer",
      contact: customerPhone,
      address_line_1: customerAddressLine,
      address_line_2: address.landmark || "",
      city: customerCity,
      state: customerState,
      pincode: Number(customerPincode),
      latitude: dropLat || undefined,
      longitude: dropLng || undefined,
    },
    pickup_details: {
      name: seller.shopName || seller.name || "Store",
      contact: sellerPhone,
      address_line_1: sellerAddressLine,
      city: sellerCity,
      state: sellerState,
      pincode: Number(sellerPincode),
      latitude: pickupLat || undefined,
      longitude: pickupLng || undefined,
    },
    // Return-to-seller details, used by Shadowfax if the order needs to be returned.
    rts_details: {
      name: seller.shopName || seller.name || "Store Return Hub",
      contact: sellerPhone,
      address_line_1: sellerAddressLine,
      city: sellerCity,
      state: sellerState,
      pincode: Number(sellerPincode),
    },
    product_details: orderItems,
  };

  // 7. Atomic DB Shipment Lock
  let shipment = existingShipment || new Shipment({
    orderMongoId: order._id,
    internalOrderId: order.orderId,
    clientOrderId: order.orderId,
    deliveryProvider: "shadowfax",
    providerType: "forward",
    shipmentStatus: "PENDING",
    serviceabilityStatus: "serviceable",
    pickupDetails: {
      name: seller.shopName || seller.name,
      contact: sellerPhone,
      address: sellerAddressLine,
      city: sellerCity,
      state: sellerState,
      pincode: sellerPincode,
      latitude: pickupLat,
      longitude: pickupLng,
    },
    dropDetails: {
      name: address.name || customer.name,
      contact: customerPhone,
      address: customerAddressLine,
      city: customerCity,
      state: customerState,
      pincode: customerPincode,
      latitude: dropLat,
      longitude: dropLng,
      instructions: address.landmark,
    },
    environment: config.environment,
  });

  await shipment.save();

  // 8. Call Shadowfax Order Creation API
  try {
    const sfxResponse = await sendShadowfaxRequest({
      method: "POST",
      endpoint: "/api/v3/clients/orders/",
      type: "forward",
      data: payload,
    });

    // Shadowfax returns HTTP 200 for rejected orders too, with {"message": "Failure", "errors": ...}.
    // Only a response carrying data.awb_number is a created order.
    const respData = sfxResponse.data || {};
    const created = respData.data && typeof respData.data === "object" ? respData.data : {};
    let awb = created.awb_number ? String(created.awb_number) : "";
    const sfxOrderId = created.id != null ? String(created.id) : null;

    if (!awb || String(respData.message || "").toLowerCase() === "failure") {
      const duplicateAwb = extractDuplicateAwb(respData);
      if (!duplicateAwb) {
        throw new ShadowfaxOrderCreationFailedError(
          extractShadowfaxErrorMessage(respData, "Shadowfax rejected the order."),
          respData
        );
      }
      // Already created earlier (e.g. a retry after a timeout): adopt the existing AWB.
      logger.warn(`[Shadowfax] Order #${orderId} already exists at Shadowfax; reusing AWB ${duplicateAwb}`);
      awb = duplicateAwb;
    }

    shipment.shadowfaxOrderId = sfxOrderId;
    shipment.awbNumber = awb;
    shipment.shipmentStatus = "ORDER_CREATED";
    shipment.providerStatus = created.status || "new";
    shipment.failureReason = null;
    shipment.lastProviderResponse = respData;
    shipment.lastProviderSyncAt = new Date();
    shipment.timeline.push({
      status: "ORDER_CREATED",
      providerStatus: shipment.providerStatus,
      description: `Shadowfax shipment created (AWB ${awb})`,
      source: "api",
      timestamp: new Date(),
    });

    await shipment.save();

    // 9. Update internal order workflow and delivery fields
    order.deliveryProvider = "shadowfax";
    order.awbNumber = shipment.awbNumber;
    order.deliveryFailureReason = null;
    if (order.workflowStatus === "SELLER_ACCEPTED" || order.workflowStatus === "DELIVERY_SEARCH") {
      order.workflowStatus = "DELIVERY_SEARCH";
    }
    if (typeof order.save === "function") await order.save().catch(() => {});

    emitOrderStatusUpdate(order.orderId, {
      workflowStatus: order.workflowStatus,
      deliveryProvider: "shadowfax",
      awbNumber: shipment.awbNumber,
    });

    return shipment;
  } catch (err) {
    shipment.shipmentStatus = "FAILED";
    shipment.failureReason = err.message;
    shipment.lastProviderResponse = err.details || { error: err.message };
    await shipment.save();

    order.deliveryProvider = "shadowfax";
    order.deliveryFailureReason = err.message;
    if (typeof order.save === "function") await order.save().catch(() => {});

    logger.error(`[Shadowfax] Failed to create shipment for order #${orderId}`, { error: err.message });
    throw new ShadowfaxOrderCreationFailedError(err.message, err.details);
  }
}

/**
 * Updates an existing Shadowfax order (e.g. delivery address change before dispatch).
 */
export async function updateForwardOrder(orderId, updatePayload) {
  const shipment = await Shipment.findOne({
    internalOrderId: orderId,
    providerType: "forward",
  });

  if (!shipment || !shipment.awbNumber) {
    throw new ShadowfaxInvalidRequestError("No active Shadowfax shipment found to update.");
  }

  if (["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].includes(shipment.shipmentStatus)) {
    throw new ShadowfaxInvalidRequestError(`Cannot edit order after dispatch. Current status: ${shipment.shipmentStatus}`);
  }

  const payload = {
    awb_number: shipment.awbNumber,
    client_order_id: shipment.clientOrderId || orderId,
    ...updatePayload,
  };

  try {
    const sfxResponse = await sendShadowfaxRequest({
      method: "POST",
      endpoint: "/api/v3/clients/order_update/",
      type: "forward",
      data: payload,
    });

    shipment.lastProviderResponse = sfxResponse.data;
    shipment.lastProviderSyncAt = new Date();
    shipment.timeline.push({
      status: shipment.shipmentStatus,
      description: "Shadowfax order details updated",
      source: "api",
      timestamp: new Date(),
    });
    await shipment.save();

    return shipment;
  } catch (err) {
    throw new ShadowfaxOrderUpdateFailedError(err.message, err.details);
  }
}

/**
 * Marks the shipment packed / ready for pickup. Local only: the Unified marketplace
 * API has no dispatch-ready call (Shadowfax schedules the seller pickup itself once
 * the order is created, and order_update only accepts rts / rto / reopen_ndr).
 */
export async function markDispatchReady(orderId) {
  const shipment = await Shipment.findOne({
    internalOrderId: orderId,
    providerType: "forward",
  });

  if (!shipment || !shipment.awbNumber || !LIVE_FORWARD_STATUSES.includes(shipment.shipmentStatus)) {
    throw new ShadowfaxInvalidRequestError("No active Shadowfax shipment found to mark dispatch-ready.");
  }

  shipment.dispatchReadyAt = new Date();
  if (shipment.shipmentStatus === "ORDER_CREATED") {
    shipment.shipmentStatus = "DISPATCH_READY";
  }
  shipment.timeline.push({
    status: shipment.shipmentStatus,
    description: "Seller marked shipment packed and ready for rider pickup",
    source: "api",
    timestamp: new Date(),
  });
  await shipment.save();

  return shipment;
}

/**
 * Cancels a forward order with Shadowfax.
 * Returns null when nothing is live at Shadowfax. When Shadowfax queues the
 * cancellation (responseCode 304, e.g. parcel out for pickup/delivery) the shipment
 * keeps its status and gets `cancellationRequestedAt`; the final state arrives via
 * webhook or tracking.
 */
export async function cancelForwardOrder(orderId, cancelReason = "Cancelled by user") {
  const shipment = await Shipment.findOne({
    internalOrderId: orderId,
    providerType: "forward",
  });

  if (shipment?.shipmentStatus === "DELIVERED") {
    throw new ShadowfaxInvalidRequestError("Cannot cancel: the Shadowfax shipment is already delivered.");
  }

  if (!shipment || !shipment.awbNumber || !LIVE_FORWARD_STATUSES.includes(shipment.shipmentStatus)) {
    logger.info(`[Shadowfax] No live Shadowfax shipment to cancel for order #${orderId}`);
    return null;
  }

  // request_id must be the AWB (or our client order id), not Shadowfax's internal id.
  const payload = {
    request_id: shipment.awbNumber,
    cancel_remarks: cancelReason,
  };

  let body;
  try {
    const sfxResponse = await sendShadowfaxRequest({
      method: "POST",
      endpoint: "/api/v3/clients/orders/cancel/",
      type: "forward",
      data: payload,
    });
    body = sfxResponse.data || {};
  } catch (err) {
    logger.error(`[Shadowfax] Cancellation failed for order #${orderId}`, { error: err.message });
    throw new ShadowfaxCancellationFailedError(err.message, err.details);
  }

  const responseCode = Number(body.responseCode ?? 200);
  if (responseCode !== 200 && responseCode !== 304) {
    const message = extractShadowfaxErrorMessage(body, "Shadowfax refused the cancellation.");
    logger.error(`[Shadowfax] Cancellation refused for order #${orderId}`, { error: message });
    throw new ShadowfaxCancellationFailedError(message, body);
  }

  const now = new Date();
  shipment.lastProviderResponse = body;
  shipment.lastProviderSyncAt = now;

  if (responseCode === 304) {
    shipment.cancellationRequestedAt = now;
    shipment.timeline.push({
      status: shipment.shipmentStatus,
      providerStatus: shipment.providerStatus,
      description: `Cancellation queued at Shadowfax (${body.responseMsg || "applies at next facility"}): ${cancelReason}`,
      source: "api",
      timestamp: now,
    });
  } else {
    shipment.shipmentStatus = "CANCELLED";
    shipment.providerStatus = "cancelled";
    shipment.cancelledAt = now;
    shipment.failureReason = cancelReason;
    shipment.timeline.push({
      status: "CANCELLED",
      providerStatus: "cancelled",
      description: `Cancelled with Shadowfax: ${cancelReason}`,
      source: "api",
      timestamp: now,
    });
  }
  await shipment.save();

  return shipment;
}

/**
 * Sets the lifecycle timestamp that belongs to a newly reached shipment status.
 */
export function applyForwardStatusTimestamps(shipment, shipmentStatus, at = new Date()) {
  if (shipmentStatus === "PICKED_UP" && !shipment.pickedUpAt) shipment.pickedUpAt = at;
  if (shipmentStatus === "RIDER_ARRIVED" && !shipment.arrivedAt) shipment.arrivedAt = at;
  if (shipmentStatus === "DELIVERED" && !shipment.deliveredAt) shipment.deliveredAt = at;
  if (shipmentStatus === "CANCELLED" && !shipment.cancelledAt) shipment.cancelledAt = at;
  if (shipmentStatus === "FAILED" && !shipment.failedAt) shipment.failedAt = at;
}

/**
 * Reads the current Shadowfax status of one AWB.
 * bulk_track carries the up-to-date status (the single-order track endpoint lags;
 * on staging it never reflects status changes). An AWB missing from the bulk result
 * is re-checked with the single-order endpoint, which rejects unknown AWBs with
 * "Invalid AWB Number".
 */
async function fetchForwardTracking(awbNumber) {
  const bulk = await sendShadowfaxRequest({
    method: "POST",
    endpoint: "/api/v4/clients/bulk_track/",
    type: "forward",
    data: { awb_numbers: [awbNumber] },
  });
  const entries = Array.isArray(bulk.data?.data) ? bulk.data.data : [];
  const entry = entries.find((item) => String(item?.awb_number) === String(awbNumber));
  if (entry) {
    return {
      raw: bulk.data,
      status: entry.status,
      statusDisplay: entry.status_display,
      events: Array.isArray(entry.tracking_details) ? entry.tracking_details : [],
    };
  }

  const single = await sendShadowfaxRequest({
    method: "GET",
    endpoint: `/api/v4/clients/orders/${awbNumber}/track/`,
    type: "forward",
  });
  const details = single.data?.order_details || {};
  return {
    raw: single.data,
    status: details.status || details.current_status,
    statusDisplay: details.status_display,
    events: Array.isArray(single.data?.tracking_details) ? single.data.tracking_details : [],
  };
}

/**
 * Fetches the latest status from Shadowfax and applies it to the shipment and
 * the order. Used by the reconciliation job and the admin "sync" action.
 */
export async function trackForwardOrder(orderIdOrAwb) {
  const shipment = await Shipment.findOne({
    $or: [{ internalOrderId: orderIdOrAwb }, { awbNumber: orderIdOrAwb }, { shadowfaxOrderId: orderIdOrAwb }],
    providerType: "forward",
  });

  if (!shipment || !shipment.awbNumber) {
    throw new ShadowfaxInvalidRequestError(`No Shadowfax shipment found for identifier: ${orderIdOrAwb}`);
  }

  const config = await getShadowfaxConfig();
  let tracking;
  try {
    tracking = await fetchForwardTracking(shipment.awbNumber);
  } catch (err) {
    // An AWB Shadowfax does not recognise (in the environment it was created in) is not a
    // live shipment, e.g. a placeholder AWB saved by older code. Mark it FAILED so it is
    // no longer polled and the order can be dispatched again.
    if (
      /invalid awb/i.test(err.message || "") &&
      shipment.environment === config.environment &&
      LIVE_FORWARD_STATUSES.includes(shipment.shipmentStatus)
    ) {
      const reason = `Shadowfax does not recognise AWB ${shipment.awbNumber}`;
      shipment.shipmentStatus = "FAILED";
      shipment.failedAt = new Date();
      shipment.failureReason = reason;
      shipment.lastProviderSyncAt = new Date();
      shipment.timeline.push({ status: "FAILED", description: reason, source: "reconciliation", timestamp: new Date() });
      await shipment.save();
      await Order.updateOne({ orderId: shipment.internalOrderId }, { $set: { deliveryFailureReason: reason } });
    }
    throw new ShadowfaxTrackingFailedError(err.message, err.details);
  }

  // `status` holds the status id (e.g. "ofd"), `status_display` the text.
  const rawStatus = String(tracking.status || "").trim();
  const normalizedStatus = mapShadowfaxForwardStatus(rawStatus);
  const events = tracking.events;
  const latestEvent = events.length ? events[events.length - 1] : null;
  // Only use the last event's remark when it belongs to the current status.
  const latestRemark = latestEvent && latestEvent.status_id === rawStatus ? latestEvent.remarks || null : null;
  const description = `Tracking: ${tracking.statusDisplay || rawStatus}${latestRemark ? ` (${latestRemark})` : ""}`;
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
    // Exception statuses (not contactable, on hold, ...) are recorded without changing state.
    shipment.providerStatus = rawStatus;
    shipment.timeline.push({
      status: shipment.shipmentStatus,
      providerStatus: rawStatus,
      description,
      source: "reconciliation",
      timestamp: new Date(),
    });
  }

  shipment.lastProviderResponse = tracking.raw;
  shipment.lastProviderSyncAt = new Date();
  await shipment.save();

  if (reachedStatus) {
    await syncOrderWithShipmentStatus(shipment, reachedStatus, { rawStatus, remarks: latestRemark });
  }

  return {
    shipmentId: shipment._id,
    internalOrderId: shipment.internalOrderId,
    awbNumber: shipment.awbNumber,
    shipmentStatus: shipment.shipmentStatus,
    providerStatus: shipment.providerStatus,
    rider: shipment.rider,
    lastSyncAt: shipment.lastProviderSyncAt,
  };
}
