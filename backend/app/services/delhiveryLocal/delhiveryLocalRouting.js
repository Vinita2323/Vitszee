import Order from "../../models/order.js";
import logger from "../logger.js";
import {
  getDelhiveryLocalConfig,
  matchesLocalCity,
  isLocalCityPincode,
  isWithinCityBounds,
} from "./delhiveryLocalConfig.js";

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
 * Reads a {lat, lng} out of either shape we store: a GeoJSON Point
 * ({ type: "Point", coordinates: [lng, lat] }, used on sellers) or a plain
 * { lat, lng } object (used on customer addresses).
 */
function pointOf(location) {
  if (!location || typeof location !== "object") return null;
  const coords = location.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  const lat = Number(location.lat);
  const lng = Number(location.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
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
 * An end (seller or customer) counts as "in the city" when ANY of these hold:
 *   1. its stored coordinates fall inside the city's geo box (most reliable),
 *   2. its address TEXT mentions a configured city name (Ahmedabad by default),
 *   3. its pincode is in the configured set (380xxx + listed 382xxx),
 *   4. (customer only) its pincode is identical to an in-city seller's pincode.
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
      .populate("seller", "city state address locality shopName pincode location")
      .select("address seller")
      .lean();
  }
  if (!order) return { eligible: false, sellerOk: false, customerOk: false, reason: "order not found" };

  const result = evaluateLocalEligibility({ seller: order.seller, address: order.address, config });
  logger.info(`[DelhiveryLocal Routing] Order #${orderId}: ${result.eligible ? "QUICK" : "COURIER"} — ${result.reason}`);
  return result;
}

/**
 * The city gate itself, with no database access, so dispatch and the checkout/product
 * delivery estimate can share ONE implementation. Two copies of this logic is how an
 * order ended up dispatched by courier while the app advertised quick delivery.
 *
 * @returns {{eligible: boolean, sellerOk: boolean, customerOk: boolean, reason: string}}
 */
export function evaluateLocalEligibility({ seller: sellerInput, address, config }) {
  const seller = sellerInput || {};
  const order = { address: address || {} };
  const sellerPin = String(seller.pincode || "").trim();
  const customerPin = dropPincode(order);

  // Coordinates first: a map-picked point inside the city box is the strongest proof of
  // being in the city, and it survives address text that omits the city name (Google
  // formats New Ranip as "Ranip, Gujarat 382470" with no "Ahmedabad" in it).
  const sellerPoint = pointOf(seller.location);
  const customerPoint = pointOf(order.address?.location);
  const sellerGeoOk = Boolean(sellerPoint) && isWithinCityBounds(sellerPoint.lat, sellerPoint.lng, config);
  const customerGeoOk = Boolean(customerPoint) && isWithinCityBounds(customerPoint.lat, customerPoint.lng, config);

  const sellerOk =
    sellerGeoOk || matchesLocalCity(sellerCityText(seller), config) || isLocalCityPincode(sellerPin, config);

  // Last backup for a customer with no usable coordinates, no city name and an unlisted
  // pincode: an identical pincode to an in-city seller is the same locality by definition.
  const samePin = Boolean(sellerOk && sellerPin && customerPin && sellerPin === customerPin);
  const customerOk =
    customerGeoOk ||
    matchesLocalCity(customerCityText(order), config) ||
    isLocalCityPincode(customerPin, config) ||
    samePin;

  const eligible = sellerOk && customerOk;

  const city = (config.cityNames && config.cityNames[0]) || "city";
  const how = [
    sellerGeoOk || customerGeoOk ? "geo" : null,
    samePin ? "same-pincode" : null,
  ]
    .filter(Boolean)
    .join("+");
  const reason = eligible
    ? `in-city (${city}${how ? ` via ${how}` : ""})`
    : `not in-city (seller ${sellerOk ? "ok" : "out"}, customer ${customerOk ? "ok" : "out"})`;

  return { eligible, sellerOk, customerOk, reason };
}
