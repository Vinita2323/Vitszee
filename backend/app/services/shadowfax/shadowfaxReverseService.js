import Shipment from "../../models/shipment.js";
import Order from "../../models/order.js";
import Seller from "../../models/seller.js";
import User from "../../models/customer.js";
import logger from "../logger.js";
import { getShadowfaxConfig } from "./shadowfaxConfig.js";
import { sendShadowfaxRequest } from "./shadowfaxClient.js";
import {
  mapShadowfaxReverseStatus,
  isValidReverseStatusTransition,
} from "./shadowfaxStatusMapper.js";
import {
  ShadowfaxReversePickupFailedError,
  ShadowfaxCancellationFailedError,
  ShadowfaxTrackingFailedError,
  ShadowfaxInvalidRequestError,
  ShadowfaxServiceabilityError,
} from "./shadowfaxErrors.js";
import { emitOrderStatusUpdate } from "../orderSocketEmitter.js";
import { emitNotificationEvent } from "../../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../../modules/notifications/notification.constants.js";

/**
 * Checks reverse serviceability between customer (pickup) and seller/warehouse (destination).
 */
export async function checkReverseServiceability({ pickupPincode, destinationPincode }) {
  const payload = {
    pickup_pincode: String(pickupPincode || "").trim(),
    delivery_pincode: String(destinationPincode || "").trim(),
  };

  try {
    const response = await sendShadowfaxRequest({
      method: "POST",
      endpoint: "/api/v2/clients/serviceability",
      type: "reverse",
      data: payload,
    });

    const isServiceable =
      response.data?.serviceable === true ||
      response.data?.status === "success" ||
      response.data?.data?.serviceable === true;

    return {
      serviceable: isServiceable,
      data: response.data,
      reason: isServiceable ? null : (response.data?.message || "Route not serviceable for reverse pickup"),
    };
  } catch (err) {
    logger.warn("[Shadowfax Reverse] Serviceability check failed", { error: err.message });
    return {
      serviceable: false,
      data: err.details || null,
      reason: err.message || "Reverse pickup is currently unavailable for this route.",
    };
  }
}

/**
 * Creates a Reverse Pickup request with Shadowfax.
 */
export async function createReversePickup(orderId, options = {}) {
  const config = await getShadowfaxConfig();
  if (!config.reverseEnabled) {
    throw new ShadowfaxInvalidRequestError("Shadowfax reverse pickup is currently disabled in settings.");
  }

  const order = await Order.findOne({ orderId })
    .populate("customer", "name phone email")
    .populate("seller", "shopName name phone address city state pincode location")
    .populate("returnItems.product", "name price sku attributes");

  if (!order) {
    throw new ShadowfaxInvalidRequestError(`Order #${orderId} not found.`);
  }

  if (order.status !== "delivered") {
    throw new ShadowfaxInvalidRequestError("Reverse pickup can only be created for delivered orders.");
  }

  const returnRequestId = `RET-${order.orderId}-${Date.now().toString().slice(-4)}`;

  // Check if shipment already exists
  const existingShipment = await Shipment.findOne({
    internalOrderId: orderId,
    providerType: "reverse",
  });

  if (existingShipment && existingShipment.clientRequestId) {
    logger.info(`[Shadowfax Reverse] Reusing existing reverse request for #${orderId}`);
    return existingShipment;
  }

  const customer = order.customer || {};
  const address = order.address || {};
  const seller = order.seller || {};

  const extractPincode = (pincodeVal, addressStr) => {
    if (pincodeVal && /^\d{6}$/.test(String(pincodeVal).trim())) {
      return String(pincodeVal).trim();
    }
    const match = String(addressStr || "").match(/\b\d{6}\b/);
    return match ? match[0] : "560001";
  };

  const pickupPincode = extractPincode(address.pincode, address.address);
  const destinationPincode = extractPincode(seller.pincode, seller.address);
  const customerPhone = String(address.phone || customer.phone || "").replace(/[^0-9]/g, "").slice(-10) || "9876543210";

  // Check serviceability
  if (config.autoServiceabilityCheck) {
    const sCheck = await checkReverseServiceability({
      pickupPincode,
      destinationPincode,
    });
    if (!sCheck.serviceable) {
      throw new ShadowfaxServiceabilityError(sCheck.reason);
    }
  }

  // Format QC rules and SKUs
  const returnItems = order.returnItems?.length > 0 ? order.returnItems : order.items || [];
  const qcRulesConfig = config.qcEnabled ? (options.qcRules || [
    { type: "quantity", expected: 1, description: "Check item quantity" },
    { type: "condition", expected: "undamaged", description: "Item must be undamaged" },
  ]) : [];

  const skus = returnItems.map((item, index) => ({
    client_sku_id: String(item.product?.sku || item.product?._id || `RET-SKU-${index + 1}`),
    name: item.name || item.product?.name || "Return Item",
    price: Number(item.price || 0),
    quantity: Number(item.quantity || 1),
    product_details: {
      brand: seller.shopName || "Standard",
      category: "General",
    },
    qc_rules: qcRulesConfig.map((r) => ({
      name: r.type || "Quality Check",
      description: r.description || "Verify return condition",
      type: typeof r.expected === "boolean" ? "boolean" : "string",
      expected: r.expected,
    })),
  }));

  const payload = {
    client_order_number: String(order.orderId),
    client_request_id: returnRequestId,
    destination_pincode: destinationPincode,
    address: {
      name: address.name || customer.name || "Customer",
      contact: customerPhone,
      address_line_1: address.address || "Customer Address",
      city: address.city || "Bengaluru",
      state: "Karnataka",
      pincode: pickupPincode,
      lat: address.location?.lat,
      lng: address.location?.lng,
    },
    skus,
  };

  // Create Shipment record
  let shipment = existingShipment || new Shipment({
    orderMongoId: order._id,
    internalOrderId: order.orderId,
    clientOrderId: order.orderId,
    clientRequestId: returnRequestId,
    deliveryProvider: "shadowfax",
    providerType: "reverse",
    shipmentStatus: "RETURN_REQUESTED",
    serviceabilityStatus: "serviceable",
    pickupDetails: {
      name: address.name || customer.name,
      contact: customerPhone,
      address: address.address,
      city: address.city,
      pincode: pickupPincode,
      latitude: address.location?.lat,
      longitude: address.location?.lng,
    },
    dropDetails: {
      name: seller.shopName || seller.name,
      contact: seller.phone,
      address: seller.address,
      city: seller.city,
      pincode: destinationPincode,
      latitude: seller.location?.coordinates?.[1],
      longitude: seller.location?.coordinates?.[0],
    },
    qcDetails: {
      qcRequired: config.qcEnabled,
      qcRules: qcRulesConfig,
      qcStatus: config.qcEnabled ? "PENDING" : "NOT_REQUIRED",
    },
    environment: config.environment,
  });

  await shipment.save();

  try {
    const sfxResponse = await sendShadowfaxRequest({
      method: "POST",
      endpoint: "/api/v2/clients/requests",
      type: "reverse",
      data: payload,
    });

    const respData = sfxResponse.data || {};
    const sfxRequestId = respData.request_id || respData.client_request_id || returnRequestId;
    const awb = respData.awb_number || `AWB-REV-${sfxRequestId}`;

    shipment.shadowfaxOrderId = String(sfxRequestId);
    shipment.awbNumber = String(awb);
    shipment.shipmentStatus = "RETURN_REQUESTED";
    shipment.providerStatus = "request_created";
    shipment.lastProviderResponse = respData;
    shipment.lastProviderSyncAt = new Date();
    shipment.timeline.push({
      status: "RETURN_REQUESTED",
      providerStatus: "request_created",
      description: "Shadowfax reverse pickup request created",
      source: "api",
      timestamp: new Date(),
    });

    await shipment.save();

    // Update order returnStatus
    order.returnStatus = "return_approved";
    await order.save();

    emitOrderStatusUpdate(order.orderId, {
      returnStatus: order.returnStatus,
      reverseAwb: shipment.awbNumber,
    });

    emitNotificationEvent(NOTIFICATION_EVENTS.RETURN_APPROVED, {
      orderId: order.orderId,
      customerId: order.customer,
      sellerId: order.seller,
      data: {
        reverseAwb: shipment.awbNumber,
      },
    });

    return shipment;
  } catch (err) {
    shipment.shipmentStatus = "FAILED";
    shipment.failureReason = err.message;
    shipment.lastProviderResponse = err.details || { error: err.message };
    await shipment.save();

    logger.error(`[Shadowfax Reverse] Failed to create reverse request for #${orderId}`, { error: err.message });
    throw new ShadowfaxReversePickupFailedError(err.message, err.details);
  }
}

/**
 * Cancels a reverse pickup request with Shadowfax.
 */
export async function cancelReversePickup(orderId, cancelReason = "Return cancelled by customer") {
  const shipment = await Shipment.findOne({
    internalOrderId: orderId,
    providerType: "reverse",
  });

  if (!shipment || !shipment.clientRequestId) {
    logger.info(`[Shadowfax Reverse] No active reverse pickup found for order #${orderId}`);
    return null;
  }

  const payload = {
    request_id: shipment.shadowfaxOrderId || shipment.clientRequestId,
    cancel_remarks: cancelReason,
  };

  try {
    const sfxResponse = await sendShadowfaxRequest({
      method: "POST",
      endpoint: "/api/v2/clients/requests/cancel",
      type: "reverse",
      data: payload,
    });

    shipment.shipmentStatus = "RETURN_CANCELLED";
    shipment.providerStatus = "cancelled";
    shipment.cancelledAt = new Date();
    shipment.failureReason = cancelReason;
    shipment.lastProviderResponse = sfxResponse.data;
    shipment.timeline.push({
      status: "RETURN_CANCELLED",
      providerStatus: "cancelled",
      description: `Reverse pickup cancelled: ${cancelReason}`,
      source: "api",
      timestamp: new Date(),
    });
    await shipment.save();

    await Order.findOneAndUpdate(
      { orderId },
      { $set: { returnStatus: "return_rejected", returnRejectedReason: cancelReason } }
    );

    return shipment;
  } catch (err) {
    logger.error(`[Shadowfax Reverse] Cancel failed for order #${orderId}`, { error: err.message });
    throw new ShadowfaxCancellationFailedError(err.message, err.details);
  }
}

/**
 * Tracks reverse pickup status from Shadowfax.
 */
export async function trackReversePickup(orderIdOrRequestId) {
  const shipment = await Shipment.findOne({
    $or: [{ internalOrderId: orderIdOrRequestId }, { clientRequestId: orderIdOrRequestId }, { awbNumber: orderIdOrRequestId }],
    providerType: "reverse",
  });

  if (!shipment || !shipment.clientRequestId) {
    throw new ShadowfaxInvalidRequestError(`No Reverse Pickup shipment found for identifier: ${orderIdOrRequestId}`);
  }

  try {
    const sfxResponse = await sendShadowfaxRequest({
      method: "GET",
      endpoint: `/api/v4/clients/requests/${shipment.clientRequestId}`,
      type: "reverse",
    });

    const trackData = sfxResponse.data || {};
    const rawStatus = trackData.status || trackData.current_status;
    const internalReturnStatus = mapShadowfaxReverseStatus(rawStatus);

    if (isValidReverseStatusTransition(shipment.providerStatus, internalReturnStatus)) {
      shipment.providerStatus = rawStatus;
    }

    // Process QC results if included
    if (trackData.qc_result || trackData.qc_status) {
      shipment.qcDetails.qcStatus = trackData.qc_status === "passed" ? "PASSED" : "FAILED";
      shipment.qcDetails.qcResult = trackData.qc_result;
      shipment.qcDetails.qcFailedReason = trackData.qc_failed_reason || null;
      shipment.qcDetails.qcTimestamp = new Date();
    }

    shipment.lastProviderResponse = trackData;
    shipment.lastProviderSyncAt = new Date();
    await shipment.save();

    await Order.findOneAndUpdate(
      { orderId: shipment.internalOrderId },
      { $set: { returnStatus: internalReturnStatus } }
    );

    return {
      shipmentId: shipment._id,
      internalOrderId: shipment.internalOrderId,
      clientRequestId: shipment.clientRequestId,
      returnStatus: internalReturnStatus,
      providerStatus: rawStatus,
      qcDetails: shipment.qcDetails,
      lastSyncAt: shipment.lastProviderSyncAt,
    };
  } catch (err) {
    throw new ShadowfaxTrackingFailedError(err.message, err.details);
  }
}
