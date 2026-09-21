import Shipment from "../../models/shipment.js";
import Order from "../../models/order.js";
import Seller from "../../models/seller.js";
import User from "../../models/customer.js";
import logger from "../logger.js";
import { getShadowfaxConfig } from "./shadowfaxConfig.js";
import { sendShadowfaxRequest } from "./shadowfaxClient.js";
import {
  mapShadowfaxForwardStatus,
  mapShipmentToWorkflowStatus,
  isValidForwardStatusTransition,
} from "./shadowfaxStatusMapper.js";
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

  if (
    existingShipment &&
    (existingShipment.shadowfaxOrderId ||
      ["ORDER_CREATED", "DISPATCH_READY", "RIDER_ASSIGNED", "RIDER_ARRIVED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"].includes(existingShipment.shipmentStatus))
  ) {
    logger.info(`[Shadowfax] Active shipment already exists for order #${orderId}. Reusing ${existingShipment.shadowfaxOrderId || existingShipment._id}`);
    if (!order.awbNumber && existingShipment.awbNumber) {
      order.deliveryProvider = "shadowfax";
      order.awbNumber = existingShipment.awbNumber;
      if (typeof order.save === "function") await order.save().catch(() => {});
    }
    return existingShipment;
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
      actual_weight: 0.5,
      volumetric_weight: 0.5,
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

    const respData = sfxResponse.data || {};
    const sfxOrderId =
      respData.data?.id || respData.order_id || respData.data?.order_id || respData.sfx_order_id || `SFX-${order.orderId}`;
    const awb = respData.data?.awb_number || respData.awb_number || `AWB-${sfxOrderId}`;

    shipment.shadowfaxOrderId = String(sfxOrderId);
    shipment.awbNumber = String(awb);
    shipment.shipmentStatus = "ORDER_CREATED";
    shipment.providerStatus = "order_created";
    shipment.lastProviderResponse = respData;
    shipment.lastProviderSyncAt = new Date();
    shipment.timeline.push({
      status: "ORDER_CREATED",
      providerStatus: "order_created",
      description: "Shadowfax shipment successfully created",
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
 * Marks order as Ready for Dispatch / RTS (Ready to Ship).
 */
export async function markDispatchReady(orderId) {
  const shipment = await Shipment.findOne({
    internalOrderId: orderId,
    providerType: "forward",
  });

  if (!shipment || !shipment.awbNumber) {
    throw new ShadowfaxInvalidRequestError("No active Shadowfax shipment found to mark dispatch-ready.");
  }

  shipment.dispatchReadyAt = new Date();
  shipment.shipmentStatus = "DISPATCH_READY";
  shipment.timeline.push({
    status: "DISPATCH_READY",
    description: "Seller marked shipment packed and ready for rider pickup",
    source: "api",
    timestamp: new Date(),
  });
  await shipment.save();

  // Notify Shadowfax if order_update endpoint supports status
  try {
    await sendShadowfaxRequest({
      method: "POST",
      endpoint: "/api/v3/clients/order_update/",
      type: "forward",
      data: {
        awb_number: shipment.awbNumber,
        status_update: "packed",
        ready_time: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.warn(`[Shadowfax] Dispatch ready advisory sync: ${err.message}`);
  }

  return shipment;
}

/**
 * Cancels a forward order with Shadowfax.
 */
export async function cancelForwardOrder(orderId, cancelReason = "Cancelled by user") {
  const shipment = await Shipment.findOne({
    internalOrderId: orderId,
    providerType: "forward",
  });

  if (!shipment || !shipment.shadowfaxOrderId) {
    logger.info(`[Shadowfax] No active Shadowfax shipment to cancel for order #${orderId}`);
    return null;
  }

  if (["DELIVERED", "CANCELLED"].includes(shipment.shipmentStatus)) {
    throw new ShadowfaxInvalidRequestError(`Cannot cancel shipment in terminal state: ${shipment.shipmentStatus}`);
  }

  const payload = {
    request_id: shipment.shadowfaxOrderId || shipment.awbNumber || orderId,
    cancel_remarks: cancelReason,
  };

  try {
    const sfxResponse = await sendShadowfaxRequest({
      method: "POST",
      endpoint: "/api/v3/clients/orders/cancel/",
      type: "forward",
      data: payload,
    });

    shipment.shipmentStatus = "CANCELLED";
    shipment.providerStatus = "cancelled";
    shipment.cancelledAt = new Date();
    shipment.failureReason = cancelReason;
    shipment.lastProviderResponse = sfxResponse.data;
    shipment.timeline.push({
      status: "CANCELLED",
      providerStatus: "cancelled",
      description: `Cancelled with Shadowfax: ${cancelReason}`,
      source: "api",
      timestamp: new Date(),
    });
    await shipment.save();

    return shipment;
  } catch (err) {
    logger.error(`[Shadowfax] Cancellation failed for order #${orderId}`, { error: err.message });
    throw new ShadowfaxCancellationFailedError(err.message, err.details);
  }
}

/**
 * Fetches real-time tracking information from Shadowfax and syncs internal shipment.
 */
export async function trackForwardOrder(orderIdOrAwb) {
  const shipment = await Shipment.findOne({
    $or: [{ internalOrderId: orderIdOrAwb }, { awbNumber: orderIdOrAwb }, { shadowfaxOrderId: orderIdOrAwb }],
    providerType: "forward",
  });

  if (!shipment || !shipment.awbNumber) {
    throw new ShadowfaxInvalidRequestError(`No Shadowfax shipment found for identifier: ${orderIdOrAwb}`);
  }

  try {
    const sfxResponse = await sendShadowfaxRequest({
      method: "GET",
      endpoint: `/api/v4/clients/orders/${shipment.awbNumber}/track/`,
      type: "forward",
    });

    const trackData = sfxResponse.data || {};
    const orderDetails = trackData.order_details || trackData.data || trackData;
    const rawStatus = orderDetails.status || orderDetails.current_status || trackData.status;
    const normalizedStatus = mapShadowfaxForwardStatus(rawStatus);

    if (isValidForwardStatusTransition(shipment.shipmentStatus, normalizedStatus)) {
      shipment.shipmentStatus = normalizedStatus;
      shipment.providerStatus = rawStatus;
    }

    // Extract rider info if available (flat rider_name/rider_contact on order_details)
    if (orderDetails.rider_name || orderDetails.rider_contact) {
      shipment.rider = {
        id: shipment.rider?.id,
        name: orderDetails.rider_name || shipment.rider?.name,
        phone: orderDetails.rider_contact || shipment.rider?.phone,
        latitude: shipment.rider?.latitude,
        longitude: shipment.rider?.longitude,
        lastLocationAt: new Date(),
      };
    }

    shipment.lastProviderResponse = trackData;
    shipment.lastProviderSyncAt = new Date();
    await shipment.save();

    // Map to Order workflow status
    const newWorkflow = mapShipmentToWorkflowStatus(shipment.shipmentStatus);
    if (newWorkflow) {
      await Order.findOneAndUpdate(
        { orderId: shipment.internalOrderId },
        { $set: { workflowStatus: newWorkflow } }
      );
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
  } catch (err) {
    throw new ShadowfaxTrackingFailedError(err.message, err.details);
  }
}
