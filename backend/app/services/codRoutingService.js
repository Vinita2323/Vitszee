import Order from "../models/order.js";
import logger from "./logger.js";
import { getDelhiveryLocalConfig } from "./delhiveryLocal/delhiveryLocalConfig.js";
import { evaluateLocalEligibility } from "./delhiveryLocal/delhiveryLocalRouting.js";

/**
 * Checks if an order qualifies for Ahmedabad Quick Commerce.
 * An order qualifies if both seller and customer are located in Ahmedabad,
 * evaluated via coordinates, city names, or pincodes.
 *
 * @param {string} orderId
 * @param {object|null} orderDoc
 * @returns {Promise<{eligible: boolean, sellerOk: boolean, customerOk: boolean, reason: string}>}
 */
export async function isAhmedabadQuickOrder(orderId, orderDoc = null) {
  let order = orderDoc;
  if (
    !order ||
    !order.address ||
    !order.seller ||
    typeof order.seller === "string" ||
    order.seller.city === undefined
  ) {
    order = await Order.findOne({ orderId })
      .populate("seller", "city state address locality shopName pincode location")
      .select("address seller paymentMode deliveryMode")
      .lean();
  }
  if (!order) {
    return { eligible: false, sellerOk: false, customerOk: false, reason: "Order not found" };
  }

  const config = await getDelhiveryLocalConfig();
  const evaluation = evaluateLocalEligibility({
    seller: order.seller,
    address: order.address,
    config,
  });

  return evaluation;
}

/**
 * Decides whether an order should be routed to internal delivery boys.
 * Rule:
 * - Must qualify for Ahmedabad Quick Commerce (intracity Ahmedabad)
 * - Must be Cash on Delivery (paymentMode === "COD")
 *
 * All prepaid Ahmedabad orders, courier orders, and orders outside Ahmedabad
 * return false (routed to Delhivery).
 *
 * @param {string} orderId
 * @param {object|null} orderDoc
 * @returns {Promise<boolean>}
 */
export async function shouldRouteToInternalDelivery(orderId, orderDoc = null) {
  let order = orderDoc;
  if (!order || !order.paymentMode) {
    order = await Order.findOne({ orderId })
      .populate("seller", "city state address locality shopName pincode location")
      .select("address seller paymentMode deliveryMode")
      .lean();
  }
  if (!order) return false;

  const paymentMode = String(order.paymentMode || "").toUpperCase();
  if (paymentMode !== "COD") {
    logger.info(`[codRoutingService] Order #${orderId} paymentMode is ${order.paymentMode} (not COD) -> External / Delhivery routing`);
    return false;
  }

  const { eligible, reason } = await isAhmedabadQuickOrder(orderId, order);
  if (!eligible) {
    logger.info(`[codRoutingService] Order #${orderId} is COD but not Ahmedabad Quick (${reason}) -> Delhivery Courier routing`);
    return false;
  }

  logger.info(`[codRoutingService] Order #${orderId} qualifies for Ahmedabad Quick Commerce COD -> Internal delivery routing`);
  return true;
}
