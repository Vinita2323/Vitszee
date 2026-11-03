import Order from "../models/order.js";
import Delivery from "../models/delivery.js";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { distanceMeters } from "../utils/geoUtils.js";
import { requireCanonicalOrderId } from "../utils/orderLookup.js";
import {
  emitOrderStatusUpdate,
  emitToCustomer,
  emitToOrder,
} from "./orderSocketEmitter.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_ROLES,
} from "../modules/notifications/notification.constants.js";
import logger from "./logger.js";

const RADIUS_M = () => parseInt(process.env.DELIVERY_OTP_RADIUS_METERS || "150", 10);
/**
 * When true the rider must be within the delivery radius to mark arrival.
 * Off by default to match the OTP step, whose proximity check is currently
 * relaxed for testing; the distance is always recorded either way.
 */
const enforceProximity = () => String(process.env.ARRIVAL_PROXIMITY_ENFORCED || "false").toLowerCase() === "true";

function svcError(message, statusCode, code, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

const isFiniteNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Rider taps "I've reached the customer". Records when/where (server time),
 * tells the customer to have the OTP ready, and unlocks the OTP step in the
 * rider app. Idempotent: a second call returns the original arrival.
 */
export async function markArrivedAtCustomer(deliveryId, orderIdParam, lat, lng) {
  const orderId = await requireCanonicalOrderId(orderIdParam);
  const order = await Order.findOne({ orderId, deliveryBoy: deliveryId });
  if (!order) {
    throw svcError("Order not found or not assigned to you", 404, "UNAUTHORIZED_DELIVERY");
  }

  const isV2Out = order.workflowStatus === WORKFLOW_STATUS.OUT_FOR_DELIVERY;
  const isV1Out =
    (order.workflowVersion || 1) < 2 && String(order.status || "").toLowerCase() === "out_for_delivery";
  if (!isV2Out && !isV1Out) {
    throw svcError("Order is not out for delivery", 409, "ORDER_NOT_READY");
  }

  if (order.reachedCustomerAt) {
    return {
      order,
      alreadyArrived: true,
      reachedCustomerAt: order.reachedCustomerAt,
      distanceMeters: order.reachedCustomerDistanceM ?? null,
    };
  }

  let rider = null;
  if (isFiniteNum(lat) && isFiniteNum(lng)) {
    rider = { lat, lng };
  } else {
    const delivery = await Delivery.findById(deliveryId).select("location").lean();
    const c = delivery?.location?.coordinates;
    if (Array.isArray(c) && c.length >= 2 && isFiniteNum(c[0]) && isFiniteNum(c[1])) {
      rider = { lat: c[1], lng: c[0] };
    }
  }
  if (!rider) {
    throw svcError("Your location is required. Please enable GPS and try again.", 400, "LOCATION_REQUIRED");
  }

  const cust = order.address?.location;
  const hasCustomerPoint = isFiniteNum(cust?.lat) && isFiniteNum(cust?.lng);
  const distance = hasCustomerPoint ? Math.round(distanceMeters(rider.lat, rider.lng, cust.lat, cust.lng)) : null;

  if (enforceProximity() && distance != null && distance > RADIUS_M()) {
    throw svcError(
      `You must be within ${RADIUS_M()} meters of the delivery location. You are ${distance} m away.`,
      403,
      "PROXIMITY_OUT_OF_RANGE",
      { details: { currentDistance: distance, requiredRange: `0-${RADIUS_M()}m` } },
    );
  }

  const now = new Date(); // server time
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, deliveryBoy: deliveryId, reachedCustomerAt: null },
    {
      $set: {
        reachedCustomerAt: now,
        reachedCustomerLocation: rider,
        reachedCustomerDistanceM: distance,
      },
    },
    { new: true },
  );
  if (!updated) {
    // Lost a race with a duplicate tap — return the arrival that won.
    const existing = await Order.findOne({ _id: order._id });
    return {
      order: existing,
      alreadyArrived: true,
      reachedCustomerAt: existing?.reachedCustomerAt || now,
      distanceMeters: existing?.reachedCustomerDistanceM ?? distance,
    };
  }

  const customerId = String(updated.customer?._id || updated.customer);
  const payload = { orderId, checkoutGroupId: updated.checkoutGroupId, reachedCustomerAt: now.toISOString() };
  try {
    emitOrderStatusUpdate(orderId, { riderArrived: true, reachedCustomerAt: now.toISOString() }, updated.customer);
    emitToCustomer(customerId, { event: "delivery:arrived", payload });
    emitToOrder(orderId, { event: "delivery:arrived", payload });
    emitNotificationEvent(NOTIFICATION_EVENTS.GENERIC_ALERT, {
      role: NOTIFICATION_ROLES.CUSTOMER,
      userId: customerId,
      title: "Your delivery partner has arrived",
      message: "Please have your delivery OTP ready to receive your order.",
      orderId: `arrived:${orderId}`,
    });
  } catch (error) {
    logger.warn("arrival notification failed", { scope: "customerArrival", orderId, error: error.message });
  }

  return {
    order: updated,
    alreadyArrived: false,
    reachedCustomerAt: now,
    distanceMeters: distance,
    withinRange: distance == null ? null : distance <= RADIUS_M(),
  };
}
