import Order from "../../models/order.js";
import logger from "../logger.js";
import { getDelhiveryLocalConfig, matchesLocalCity } from "./delhiveryLocalConfig.js";

/** Combined address text we scan for the configured city name(s). */
function sellerCityText(seller = {}) {
  return [seller.city, seller.address, seller.locality, seller.state, seller.shopName]
    .filter(Boolean)
    .join(" ");
}
function customerCityText(order = {}) {
  const a = order.address || {};
  return [a.city, a.fullAddress, a.address, a.landmark].filter(Boolean).join(" ");
}

/**
 * Decides whether an order should go via Delhivery Local (quick / intracity) delivery.
 *
 * Gate (per product decision): quick delivery applies only when BOTH the seller and the
 * customer address text mention the configured city (Ahmedabad by default). This covers the
 * whole city regardless of pincode — customer pincodes are often missing or garbled — so any
 * seller registered in the city serves quick orders to any customer in the city. Everything
 * else goes via the courier (Express) flow.
 *
 * Live rider availability is confirmed by the Local quote/create call; an in-city order that
 * Local cannot fulfil is held for manual handling rather than falling back to courier.
 *
 * @returns {Promise<{eligible: boolean, sellerOk: boolean, customerOk: boolean, reason: string}>}
 */
export async function resolveLocalEligibility(orderId, orderDoc = null) {
  const config = await getDelhiveryLocalConfig();

  if (!config.enabled) return { eligible: false, sellerOk: false, customerOk: false, reason: "local disabled" };
  if (!config.hasCredentials)
    return { eligible: false, sellerOk: false, customerOk: false, reason: "local not configured" };

  let order = orderDoc;
  if (!order || !order.address || !order.seller || typeof order.seller === "string" || !order.seller.city) {
    order = await Order.findOne({ orderId })
      .populate("seller", "city state address locality shopName pincode")
      .select("address seller")
      .lean();
  }
  if (!order) return { eligible: false, sellerOk: false, customerOk: false, reason: "order not found" };

  const seller = order.seller || {};
  const sellerOk = matchesLocalCity(sellerCityText(seller), config);
  const customerOk = matchesLocalCity(customerCityText(order), config);
  const eligible = sellerOk && customerOk;

  const city = (config.cityNames && config.cityNames[0]) || "city";
  const reason = eligible
    ? `in-city (${city})`
    : `not in-city (seller ${sellerOk ? "ok" : "out"}, customer ${customerOk ? "ok" : "out"})`;

  logger.info(`[DelhiveryLocal Routing] Order #${orderId}: ${eligible ? "QUICK" : "COURIER"} — ${reason}`);
  return { eligible, sellerOk, customerOk, reason };
}
