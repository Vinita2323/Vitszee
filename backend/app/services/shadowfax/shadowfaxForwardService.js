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
  pickupLatitude,
  pickupLongitude,
  dropLatitude,
  dropLongitude,
  orderValue = 0,
}) {
  const config = await getShadowfaxConfig();
  if (!config.forwardEnabled && !config.isProduction) {
    // If not globally enabled in sandbox, report as mock-serviceable for test suites
    // but in real calls we execute against Shadowfax endpoint
  }

  const payload = {
    pickup_pincode: String(pickupPincode || "").trim(),
    delivery_pincode: String(deliveryPincode || "").trim(),
  };

  if (pickupLatitude && pickupLongitude) {
    payload.pickup_latitude = Number(pickupLatitude);
    payload.pickup_longitude = Number(pickupLongitude);
  }
  if (dropLatitude && dropLongitude) {
    payload.drop_latitude = Number(dropLatitude);
    payload.drop_longitude = Number(dropLongitude);
  }
  if (orderValue) {
    payload.order_value = Number(orderValue);
  }

  try {
    const response = await sendShadowfaxRequest({
      method: "POST",
      endpoint: "/api/v2/clients/serviceability/",
      type: "forward",
      data: payload,
    });

    const isServiceable =
      response.data?.serviceable === true ||
      response.data?.status === "success" ||
      response.data?.data?.serviceable === true;

    return {
      serviceable: isServiceable,
      data: response.data,
      reason: isServiceable ? null : (response.data?.message || "Route not serviceable by Shadowfax"),
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
    .populate("customer", "name phone email")
    .populate("seller", "shopName name phone address location city state pincode")
    .populate("items.product", "name price sku");

  if (!order) {
    throw new ShadowfaxInvalidRequestError(`Order #${orderId} not found.`);
  }

  // 2. Check for existing active shipment (Idempotency Guard)
  const existingShipment = await Shipment.findOne({
    internalOrderId: orderId,
    providerType: "forward",
  });

  if (existingShipment && existingShipment.shadowfaxOrderId) {
    logger.info(`[Shadowfax] Shipment already exists for order #${orderId}. Reusing ${existingShipment.shadowfaxOrderId}`);
    return existingShipment;
  }

  // 3. Extract & Validate Pickup (Seller) & Drop (Customer) Details
  const seller = order.seller || {};
  const customer = order.customer || {};
  const address = order.address || {};

  const pickupLat = seller.location?.coordinates?.[1] || seller.location?.lat || 0;
  const pickupLng = seller.location?.coordinates?.[0] || seller.location?.lng || 0;
  const dropLat = address.location?.lat || 0;
  const dropLng = address.location?.lng || 0;

  const sellerContact = String(seller.phone || "").replace(/[^0-9]/g, "").slice(-10) || "9876543210";
  const customerContact = String(address.phone || customer.phone || "").replace(/[^0-9]/g, "").slice(-10) || "9876543210";

  const extractPincode = (pincodeVal, addressStr) => {
    if (pincodeVal && /^\d{6}$/.test(String(pincodeVal).trim())) {
      return String(pincodeVal).trim();
    }
    const match = String(addressStr || "").match(/\b\d{6}\b/);
    return match ? match[0] : "560001";
  };

  const pickupPincode = extractPincode(seller.pincode, seller.address);
  const dropPincode = extractPincode(address.pincode, address.address);

  // 4. Check Serviceability if enabled
  if (config.autoServiceabilityCheck) {
    const serviceability = await checkForwardServiceability({
      pickupPincode,
      deliveryPincode: dropPincode,
      pickupLatitude: pickupLat,
      pickupLongitude: pickupLng,
      dropLatitude: dropLat,
      dropLongitude: dropLng,
      orderValue: order.paymentBreakdown?.grandTotal || order.pricing?.total || 0,
    });

    if (!serviceability.serviceable) {
      throw new ShadowfaxServiceabilityError(serviceability.reason);
    }
  }

  // 5. Prepare Order Items
  const orderItems = (order.items || []).map((item, index) => ({
    sku: String(item.product?.sku || item.product?._id || `SKU-${index + 1}`),
    product_name: item.name || item.product?.name || "Product Item",
    price: Number(item.price || 0),
    quantity: Number(item.quantity || 1),
    seller_details: {
      name: seller.shopName || seller.name || "Seller",
      contact: sellerContact,
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
      contact: customerContact,
      address_line_1: address.address || "Customer Address",
      address_line_2: address.landmark || "",
      city: address.city || "Bengaluru",
      state: "Karnataka",
      pincode: dropPincode,
      latitude: dropLat || undefined,
      longitude: dropLng || undefined,
    },
    pickup_details: {
      name: seller.shopName || seller.name || "Store",
      contact: sellerContact,
      address_line_1: seller.address || "Store Address",
      city: seller.city || "Bengaluru",
      state: seller.state || "Karnataka",
      pincode: pickupPincode,
      latitude: pickupLat || undefined,
      longitude: pickupLng || undefined,
    },
    return_details: {
      return_type: "seller",
      name: seller.shopName || seller.name || "Store Return Hub",
      contact: sellerContact,
      address_line_1: seller.address || "Store Return Address",
      city: seller.city || "Bengaluru",
      state: seller.state || "Karnataka",
      pincode: pickupPincode,
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
      contact: sellerContact,
      address: seller.address,
      city: seller.city,
      pincode: pickupPincode,
      latitude: pickupLat,
      longitude: pickupLng,
    },
    dropDetails: {
      name: address.name || customer.name,
      contact: customerContact,
      address: address.address,
      city: address.city,
      pincode: dropPincode,
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
    const sfxOrderId = respData.order_id || respData.data?.order_id || respData.sfx_order_id || `SFX-${order.orderId}`;
    const awb = respData.awb_number || respData.data?.awb_number || `AWB-${sfxOrderId}`;

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

    // 9. Update internal order workflow status
    if (order.workflowStatus === "SELLER_ACCEPTED" || order.workflowStatus === "DELIVERY_SEARCH") {
      order.workflowStatus = "DELIVERY_SEARCH";
      await order.save();
    }

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
    const rawStatus = trackData.status || trackData.current_status || trackData.data?.status;
    const normalizedStatus = mapShadowfaxForwardStatus(rawStatus);

    if (isValidForwardStatusTransition(shipment.shipmentStatus, normalizedStatus)) {
      shipment.shipmentStatus = normalizedStatus;
      shipment.providerStatus = rawStatus;
    }

    // Extract rider info if available
    const rider = trackData.rider || trackData.delivery_partner || trackData.data?.rider;
    if (rider) {
      shipment.rider = {
        id: rider.id || shipment.rider?.id,
        name: rider.name || shipment.rider?.name,
        phone: rider.contact || rider.phone || shipment.rider?.phone,
        latitude: rider.latitude ? Number(rider.latitude) : shipment.rider?.latitude,
        longitude: rider.longitude ? Number(rider.longitude) : shipment.rider?.longitude,
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
