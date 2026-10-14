import Order from "../models/order.js";
import Delivery from "../models/delivery.js";
import Seller from "../models/seller.js";
import CheckoutGroup from "../models/checkoutGroup.js";
import OrderOtp from "../models/orderOtp.js";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { distanceMeters } from "../utils/geoUtils.js";
import {
  orderMatchQueryFlexible,
} from "../utils/orderLookup.js";
import { buildKey, getOrSet, getTTL } from "./cacheService.js";
import { resolveWorkflowStatus } from "./orderWorkflowService.js";
import logger from "./logger.js";
import Setting from "../models/setting.js";
import { calculateRiderPayout } from "./finance/pricingService.js";

function svcErr(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function refToIdString(ref) {
  if (ref == null) return "";
  if (typeof ref === "object" && ref._id != null) return String(ref._id);
  return String(ref);
}

function normalizeSellerStatusFilter(statusParam) {
  if (!statusParam || statusParam === "all") {
    return {};
  }

  if (statusParam === "pending") {
    return { status: "pending" };
  }
  if (statusParam === "processed") {
    return { status: { $in: ["confirmed", "packed"] } };
  }
  if (statusParam === "out-for-delivery") {
    return { status: "out_for_delivery" };
  }
  if (statusParam === "delivered") {
    return { status: "delivered" };
  }
  if (statusParam === "cancelled") {
    return { status: "cancelled" };
  }
  if (statusParam === "returned") {
    return { returnStatus: { $ne: "none" } };
  }

  return {};
}

function appendDateRange(query, { startDate, endDate }) {
  if (!startDate && !endDate) {
    return query;
  }

  const range = {};
  if (startDate) {
    range.$gte = new Date(startDate);
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }

  return {
    ...query,
    createdAt: range,
  };
}

export function buildSellerOrdersQuery({
  role,
  userId,
  statusParam,
  startDate,
  endDate,
}) {
  const base = role === "admin" ? {} : { seller: userId };
  const withStatus = {
    ...base,
    ...normalizeSellerStatusFilter(statusParam),
  };
  return appendDateRange(withStatus, { startDate, endDate });
}

export async function fetchSellerOrdersPage({
  role,
  userId,
  statusParam,
  startDate,
  endDate,
  skip,
  limit,
}) {
  const query = buildSellerOrdersQuery({
    role,
    userId,
    statusParam,
    startDate,
    endDate,
  });

  const [orders, total, summaryRows] = await Promise.all([
    Order.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate("customer", "name phone")
      .populate("items.product", "name mainImage price salePrice")
      .populate("deliveryBoy", "name phone")
      .populate("seller", "shopName name")
      .lean(),
    Order.countDocuments(query),
    Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalAmount: { $sum: { $ifNull: ["$pricing.total", 0] } },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          confirmed: {
            $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] },
          },
          packed: {
            $sum: { $cond: [{ $eq: ["$status", "packed"] }, 1, 0] },
          },
          outForDelivery: {
            $sum: { $cond: [{ $eq: ["$status", "out_for_delivery"] }, 1, 0] },
          },
          delivered: {
            $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] },
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
          },
          returned: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$returnStatus", null] },
                    { $ne: ["$returnStatus", ""] },
                    { $ne: ["$returnStatus", "none"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const rawSummary = summaryRows?.[0] || {};
  const summary = {
    totalOrders: Number(rawSummary.totalOrders || 0),
    totalAmount: Number(rawSummary.totalAmount || 0),
    pending: Number(rawSummary.pending || 0),
    confirmed: Number(rawSummary.confirmed || 0),
    packed: Number(rawSummary.packed || 0),
    outForDelivery: Number(rawSummary.outForDelivery || 0),
    delivered: Number(rawSummary.delivered || 0),
    cancelled: Number(rawSummary.cancelled || 0),
    returned: Number(rawSummary.returned || 0),
  };
  summary.activeOrders =
    summary.pending +
    summary.confirmed +
    summary.packed +
    summary.outForDelivery;

  // Append active OTPs for the seller UI
  const orderIds = orders.map((o) => o.orderId);
  const activeOtps = await OrderOtp.find({
    orderId: { $in: orderIds },
    type: { $in: ["seller_pickup", "return_drop"] },
    consumedAt: null,
  })
    .sort({ createdAt: -1 })
    .lean();

  const otpMap = {};
  for (const otpDoc of activeOtps) {
    // only save the first one (most recent) per order since we sorted desc
    if (!otpMap[otpDoc.orderId]) {
      otpMap[otpDoc.orderId] = otpDoc.code;
    }
  }

  const enrichedOrders = orders.map((o) => {
    if (otpMap[o.orderId]) {
      return { ...o, activeSellerOtp: otpMap[o.orderId] };
    }
    return o;
  });

  return {
    orders: enrichedOrders,
    total,
    summary,
  };
}

function parseAvailableOrdersLimit(requestedLimit) {
  const maxLimit = 50;
  const parsed = parseInt(requestedLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20;
  }
  return Math.min(parsed, maxLimit);
}

async function resolveNearbySellerIds(deliveryPartner, userId) {
  const nearbySellers = await Seller.find({
    location: {
      $near: {
        $geometry: deliveryPartner.location,
        $maxDistance: 5000,
      },
    },
  }).select("_id");

  let sellerIds = nearbySellers.map((seller) => seller._id);
  let usedFallback = false;

  if (sellerIds.length === 0 && process.env.NODE_ENV !== "production") {
    const allSellers = await Seller.find({}).select("_id");
    sellerIds = allSellers.map((seller) => seller._id);
    usedFallback = true;
    console.log(
      `DEV LOG - Radius search found 0 sellers. Bypassing radius check for Delivery Partner: ${userId}`,
    );
  }

  return {
    sellerIds,
    usedFallback,
  };
}

function filterV2OrdersByRadius(v2Orders, deliveryCoords) {
  const [dlng, dlat] = deliveryCoords;
  return v2Orders.filter((order) => {
    const coords = order.seller?.location?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return true;

    const [slng, slat] = coords;
    const searchR = order.deliverySearchMeta?.radiusMeters || order.returnSearchMeta?.radiusMeters || 5000;
    const serviceKm = Number(order.seller?.serviceRadius ?? 5);
    const serviceM = Math.max(serviceKm, 0) * 1000;
    const maxR = Math.min(searchR, serviceM);
    return distanceMeters(dlat, dlng, slat, slng) <= maxR;
  });
}

function mergeAvailableOrders(v2Orders, legacyOrders, returnPickups, limit) {
  const seen = new Set();
  const merged = [];

  for (const order of [...v2Orders, ...legacyOrders, ...returnPickups]) {
    if (seen.has(order.orderId)) continue;
    seen.add(order.orderId);
    merged.push(order);
    if (merged.length >= limit) break;
  }

  return merged;
}

export async function fetchAvailableOrdersForDelivery({
  userId,
  requestedLimit,
  type = "delivery",
}) {
  const limit = parseAvailableOrdersLimit(requestedLimit);
  const showDeliveries = type === "delivery" || type === "all";
  const showReturns = type === "return" || type === "all";

  const deliveryPartner = await Delivery.findById(userId);
  if (
    !deliveryPartner ||
    !deliveryPartner.location ||
    !Array.isArray(deliveryPartner.location.coordinates)
  ) {
    return {
      requiresLocation: true,
      orders: [],
      limit,
    };
  }

  const { sellerIds } = await resolveNearbySellerIds(deliveryPartner, userId);

  let availableReturnPickups = [];
  if (showReturns) {
    const availableReturnsRaw = await Order.find({
      returnStatus: "return_pickup_assigned",
      returnDeliveryBoy: null,
      seller: { $in: sellerIds },
      skippedBy: { $nin: [userId] },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate("customer", "name phone")
      .populate("seller", "shopName address name location serviceRadius")
      .lean();

    availableReturnPickups = filterV2OrdersByRadius(
      availableReturnsRaw,
      deliveryPartner.location.coordinates,
    ).map((rp) => ({
      ...rp,
      isReturnPickup: true,
    }));
  }

  let v2Orders = [];
  if (showDeliveries) {
    const v2OrdersRaw = await Order.find({
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
      deliveryBoy: null,
      deliveryProvider: "internal",
      paymentMode: "COD",
      seller: { $in: sellerIds },
      skippedBy: { $nin: [userId] },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate("customer", "name phone")
      .populate("seller", "shopName address name location serviceRadius")
      .lean();

    v2Orders = filterV2OrdersByRadius(
      v2OrdersRaw,
      deliveryPartner.location.coordinates,
    );
  }

  let legacyOrders = [];
  if (showDeliveries) {
    legacyOrders = await Order.find({
      $or: [
        { workflowVersion: { $exists: false } },
        { workflowVersion: { $lt: 2 } },
      ],
      status: { $in: ["confirmed", "packed"] },
      deliveryBoy: null,
      paymentMode: "COD",
      seller: { $in: sellerIds },
      skippedBy: { $nin: [userId] },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate("customer", "name phone")
      .populate("seller", "shopName address name location")
      .lean();
  }

  let returnPickups = [];
  if (showReturns) {
    const now = new Date();
    const returnPickupsRaw = await Order.find({
      skippedBy: { $nin: [userId] },
      $or: [
        // Manual reassign queue — seller picked "no specific rider" but
        // the broadcast loop hasn't been kicked off yet (or it expired
        // out). These stay visible until a seller re-assigns.
        {
          returnStatus: "return_approved",
          returnDeliveryBoy: null,
          seller: { $in: sellerIds },
        },
        // Active broadcast — only show while the assignment window is
        // still open. Legacy rows without a stored expiry stay visible
        // for backwards compatibility.
        {
          returnStatus: "return_pickup_assigned",
          returnDeliveryBoy: null,
          seller: { $in: sellerIds },
          $or: [
            { returnSearchExpiresAt: { $exists: false } },
            { returnSearchExpiresAt: null },
            { returnSearchExpiresAt: { $gt: now } },
          ],
        },
        // Mine to handle right now — always show, regardless of expiry.
        {
          returnDeliveryBoy: userId,
        },
        // Active broadcast or manual reassign queue.
        // We do NOT filter by sellerIds here, because the rider needs to be near the CUSTOMER,
        // not near the SELLER. We'll filter by haversine distance in JS.
        {
          returnStatus: { $in: ["return_approved", "return_pickup_assigned"] },
          returnDeliveryBoy: null,
          skippedBy: { $nin: [userId] },
          $or: [
            { returnSearchExpiresAt: { $exists: false } },
            { returnSearchExpiresAt: null },
            { returnSearchExpiresAt: { $gt: now } },
            { returnStatus: "return_approved" }, // approved can stay until picked
          ],
        },
      ],
    })
      .sort({ createdAt: -1, _id: -1 })
      // fetching a bit more to allow for filtering, then slice to limit later
      .limit(limit * 2) 
      .populate("customer", "name phone")
      .populate("seller", "shopName address name location")
      .lean();

    // Filter unassigned return pickups by distance to the customer's location
    const dpCoords = deliveryPartner.location?.coordinates;
    const dpLat = dpCoords?.[1];
    const dpLng = dpCoords?.[0];

    returnPickups = returnPickupsRaw
      .filter((rp) => {
        if (rp.returnDeliveryBoy === userId) return true; // always keep mine
        if (!dpLat || !dpLng) return false;

        const custLat = rp.address?.location?.lat;
        const custLng = rp.address?.location?.lng;
        
        if (!custLat || !custLng) return false;

        // Default radius is 15000m unless specified in meta
        const radiusM = rp.returnSearchMeta?.radiusMeters || 15000;
        const dist = distanceMeters(dpLat, dpLng, custLat, custLng);
        return dist <= radiusM;
      })
      .slice(0, limit)
      .map((rp) => ({
        ...rp,
        isReturnPickup: true,
      }));
  }

  const orders = mergeAvailableOrders(
    v2Orders,
    legacyOrders,
    [...availableReturnPickups, ...returnPickups],
    limit,
  );

  return {
    requiresLocation: false,
    orders,
    limit,
  };
}

/**
 * Customer-facing paginated order list (cached).
 * Replaces inline logic from orderController.getMyOrders.
 */
export async function getCustomerOrders(customerId, pagination) {
  const { page, limit, skip } = pagination;
  const cacheKey = buildKey(
    "orders",
    "customer",
    `${customerId}:p${page}:l${limit}`,
  );

  return getOrSet(
    cacheKey,
    async () => {
      const [orders, total] = await Promise.all([
        Order.find({ customer: customerId })
          .select(
            "orderId checkoutGroupId customer seller items address payment pricing status workflowStatus workflowVersion returnStatus timeSlot createdAt",
          )
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .populate("items.product", "name mainImage price salePrice")
          .lean(),
        Order.countDocuments({ customer: customerId }),
      ]);

      return {
        items: orders,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      };
    },
    getTTL("orders"),
  );
}

/**
 * Fetches an order with role-based access control. Returns a "virtual" group
 * summary if the ID is a checkout group identifier and no concrete order
 * exists.
 *
 * Throws: 403 (access denied), 404 (not found), 500 (data integrity).
 */
export async function getOrderWithAccess(orderId, userId, role) {
  const orderKey = orderMatchQueryFlexible(orderId);
  if (!orderKey) {
    throw svcErr("Order not found", 404);
  }

  let order = await Order.findOne(orderKey)
    .populate("customer", "name email phone")
    .populate("items.product", "name mainImage price salePrice")
    .populate("returnItems.product", "name mainImage price salePrice")
    .populate("deliveryBoy", "name phone vehicle")
    .populate("returnDeliveryBoy", "name phone vehicle")
    .populate("seller", "shopName name address phone location")
    .lean();

  if (!order) {
    if (orderId && orderId.startsWith("CHK-")) {
      const group = await CheckoutGroup.findOne({
        checkoutGroupId: orderId,
      }).lean();
      if (group) {
        const groupOrders = await Order.find({ checkoutGroupId: orderId }).select('status workflowStatus paymentStatus').lean();
        const primaryOrder = groupOrders[0];
        return {
          isGroupSummary: true,
          payload: {
            orderId: group.checkoutGroupId,
            status: primaryOrder?.status?.toLowerCase() || group.status?.toLowerCase() || "pending",
            orderStatus: primaryOrder?.status?.toLowerCase() || group.status?.toLowerCase() || "pending",
            paymentStatus:
              primaryOrder?.paymentStatus === "CAPTURED" || group.paymentStatus === "CAPTURED"
                ? "PAID"
                : primaryOrder?.paymentStatus || group.paymentStatus || "CREATED",
            workflowStatus: primaryOrder?.workflowStatus || group.status || "CREATED",
            pricing: {
              subtotal: group.pricingSummary?.subtotal || 0,
              deliveryFee: group.pricingSummary?.deliveryFee || 0,
              platformFee: group.pricingSummary?.platformFee || 0,
              total: group.pricingSummary?.totalAmount || 0,
            },
            address: group.addressSnapshot || {},
            items: [],
            createdAt: group.createdAt,
            isGroupSummary: true,
            isFragmented: true,
          },
        };
      }
    }
    throw svcErr("Order not found", 404);
  }

  // Defensive: customer reference integrity check (BUGFIX preserved)
  if (!order.customer) {
    logger.error("Order has null/undefined customer field", {
      scope: "ORDER_BUG",
      orderId: order.orderId,
      _id: order._id,
      workflowStatus: order.workflowStatus,
    });

    const rawOrder = await Order.findOne(orderKey).lean();
    if (rawOrder && rawOrder.customer) {
      logger.error("Customer reference exists but failed to populate", {
        scope: "ORDER_BUG",
        orderId: order.orderId,
        customerRef: rawOrder.customer,
      });
      order.customer = rawOrder.customer;
    } else {
      logger.error("Customer field is null in database", {
        scope: "ORDER_BUG",
        orderId: order.orderId,
      });
      throw svcErr(
        "Order data integrity error: customer reference is missing",
        500,
      );
    }
  }

  if (!order.workflowStatus) {
    order.workflowStatus = resolveWorkflowStatus(order);
  }

  if (
    order.returnStatus &&
    order.returnStatus !== "none" &&
    (!order.returnDeliveryCommission || order.returnDeliveryCommission === 0)
  ) {
    try {
      const settings = await Setting.findOne({}).lean();
      let distanceKm = order.distanceSnapshot?.distanceKmActual || order.paymentBreakdown?.distanceKmActual || 0;
      const payout = calculateRiderPayout(distanceKm, settings || {});
      order.returnDeliveryCommission = payout.riderPayoutTotal || 0;
    } catch (e) {
      logger.warn("Failed to calculate fallback return delivery commission", { error: e.message });
    }
  }

  const uid = userId != null ? String(userId).trim() : "";
  const roleNorm = String(role || "").toLowerCase();
  const sellerIdStr =
    typeof order.seller === "object" && order.seller?._id
      ? order.seller._id.toString()
      : order.seller?.toString();

  const customerIdStr = refToIdString(order.customer);

  const isOwnerCustomer =
    (roleNorm === "customer" || roleNorm === "user") &&
    order.customer &&
    customerIdStr === uid;
  const isOwnerSeller = role === "seller" && sellerIdStr === uid;
  const primaryRiderId = refToIdString(order.deliveryBoy);
  const returnRiderId = refToIdString(order.returnDeliveryBoy);
  const isAssignedDeliveryBoy =
    role === "delivery" &&
    (primaryRiderId === uid || returnRiderId === uid);

  const isBroadcastedOrder =
    role === "delivery" &&
    ((!order.deliveryBoy &&
      order.workflowStatus === WORKFLOW_STATUS.DELIVERY_SEARCH) ||
      (!order.returnDeliveryBoy &&
        ["return_approved", "return_pickup_assigned"].includes(
          order.returnStatus,
        )));

  const isAdmin = role === "admin";

  if (
    !isOwnerCustomer &&
    !isOwnerSeller &&
    !isAssignedDeliveryBoy &&
    !isBroadcastedOrder &&
    !isAdmin
  ) {
    logger.warn("Authorization denied for order", {
      scope: "ORDER_ACCESS",
      orderId: order.orderId,
      requestedBy: uid,
      role: roleNorm,
      customerIdStr,
      hasCustomer: !!order.customer,
    });
    throw svcErr(
      "Access denied. You are not authorized to view this order.",
      403,
    );
  }

  // Attach active OTPs for the customer so they survive page refreshes
  if (isOwnerCustomer) {
    try {
      const activeCustomerOtps = await OrderOtp.find({
        orderId: { $in: [order.orderId, order.checkoutGroupId].filter(Boolean) },
        type: { $in: ["delivery", "return_pickup"] },
        consumedAt: null,
        expiresAt: { $gt: new Date() }
      }).sort({ createdAt: -1 }).lean();

      for (const otpDoc of activeCustomerOtps) {
        if (otpDoc.type === "delivery" && !order.activeDeliveryOtp) {
           order.activeDeliveryOtp = { otp: otpDoc.code, expiresAt: otpDoc.expiresAt, deliveryPersonNearby: true };
        }
        if (otpDoc.type === "return_pickup" && !order.activeReturnOtp) {
           order.activeReturnOtp = { otp: otpDoc.code, expiresAt: otpDoc.expiresAt, deliveryPersonNearby: true };
        }
      }
    } catch (err) {
      logger.warn("Failed to fetch customer OTPs", { error: err.message, orderId: order.orderId });
    }
  }

  // Attach active OTP expiration times for the delivery partner so they survive page refreshes
  if (isAssignedDeliveryBoy) {
    try {
      const activeDeliveryOtps = await OrderOtp.find({
        orderId: { $in: [order.orderId, order.checkoutGroupId].filter(Boolean) },
        type: { $in: ["delivery", "return_pickup"] },
        consumedAt: null,
        expiresAt: { $gt: new Date() }
      }).sort({ createdAt: -1 }).lean();

      for (const otpDoc of activeDeliveryOtps) {
        if (otpDoc.type === "delivery" && !order.activeDeliveryOtpExpiresAt) {
           order.activeDeliveryOtpExpiresAt = otpDoc.expiresAt;
        }
        if (otpDoc.type === "return_pickup" && !order.activeReturnOtpExpiresAt) {
           order.activeReturnOtpExpiresAt = otpDoc.expiresAt;
        }
      }
    } catch (err) {
      logger.warn("Failed to fetch delivery OTPs for partner", { error: err.message, orderId: order.orderId });
    }
  }

  return {
    isGroupSummary: false,
    payload: order,
  };
}

/**
 * Returns paginated seller/admin view of orders with active return status.
 */
export async function getSellerReturns({
  role,
  userId,
  filters = {},
  pagination,
}) {
  const { status, startDate, endDate } = filters;
  const { page, limit, skip } = pagination;

  const query = {};
  if (role !== "admin") {
    query.seller = userId;
  }
  query.returnStatus = { $ne: "none" };

  if (status && status !== "all") {
    query.returnStatus = status;
  }

  if (startDate || endDate) {
    query.returnRequestedAt = {};
    if (startDate) {
      query.returnRequestedAt.$gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.returnRequestedAt.$lte = end;
    }
  }

  const [orders, total] = await Promise.all([
    Order.find(query)
      .sort({ returnRequestedAt: -1, createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate("customer", "name phone")
      .populate("returnDeliveryBoy", "name phone")
      .lean(),
    Order.countDocuments(query),
  ]);

  return {
    items: orders,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export default {
  buildSellerOrdersQuery,
  fetchSellerOrdersPage,
  fetchAvailableOrdersForDelivery,
  getCustomerOrders,
  getOrderWithAccess,
  getSellerReturns,
};
