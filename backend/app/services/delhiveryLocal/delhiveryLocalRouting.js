import Order from "../../models/order.js";
import logger from "../logger.js";
import { getDelhiveryLocalConfig, matchesLocalCity, isLocalCityPincode } from "./delhiveryLocalConfig.js";

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

/** Extracts a 6-digit pincode from the delivery address (field or embedded in text). */
function dropPincode(order = {}) {
  const a = order.address || {};
  const pin = String(a.pincode || "").trim();
  if (/^\d{6}$/.test(pin)) return pin;
  const text = `${a.fullAddress || ""} ${a.address || ""} ${a.city || ""} ${a.landmark || ""}`;
  const m = text.match(/\b\d{6}\b/);
  return m ? m[0] : "";
}

/**
 * Decides whether an order should go via Delhivery Local (quick / intracity) delivery.
 *
 * An end (seller or customer) counts as "in the city" when its address TEXT mentions a
 * configured city name (Ahmedabad by default) OR its pincode is in the configured set
 * (clean 380xxx by default; add exact 382xxx pins via DELHIVERY_LOCAL_CITY_PINCODES).
 * Quick delivery applies only when BOTH ends are in the city; everything else goes courier.
 * This covers the whole city even when a customer's pincode is missing/garbled or the
 * address omits the city name.
 *
 * An in-city order that Local cannot fulfil is held for manual handling (not couriered).
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
  const sellerPin = String(seller.pincode || "").trim();
  const customerPin = dropPincode(order);

  // City-name match OR pincode backup, for each end.
  const sellerOk = matchesLocalCity(sellerCityText(seller), config) || isLocalCityPincode(sellerPin, config);
  const customerOk = matchesLocalCity(customerCityText(order), config) || isLocalCityPincode(customerPin, config);
  const eligible = sellerOk && customerOk;

  const city = (config.cityNames && config.cityNames[0]) || "city";
  const reason = eligible
    ? `in-city (${city})`
    : `not in-city (seller ${sellerOk ? "ok" : "out"}, customer ${customerOk ? "ok" : "out"})`;

  logger.info(`[DelhiveryLocal Routing] Order #${orderId}: ${eligible ? "QUICK" : "COURIER"} — ${reason}`);
  return { eligible, sellerOk, customerOk, reason };
}
