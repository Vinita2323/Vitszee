import Order from "../../models/order.js";
import logger from "../logger.js";
import { getDelhiveryLocalConfig, isLocalCityPincode } from "./delhiveryLocalConfig.js";

/**
 * Extracts a 6-digit pincode from an order's delivery address, falling back to a
 * pincode embedded in the free-text address line.
 */
function dropPincode(order) {
  const address = order?.address || {};
  const pin = String(address.pincode || "").trim();
  if (/^\d{6}$/.test(pin)) return pin;
  const line = String(address.fullAddress || address.address || "");
  const match = line.match(/\b\d{6}\b/);
  return match ? match[0] : "";
}

/**
 * Decides whether an order should go via Delhivery Local (quick / intracity) delivery.
 *
 * Quick delivery is intracity, so it needs BOTH ends inside the Ahmedabad service area:
 * the seller pickup pincode and the customer drop pincode must both pass the city gate.
 * Anything else goes via the courier (Express) flow.
 *
 * This is only the city gate; live serviceability (rider availability etc.) is confirmed
 * by the Local quote/create call. Per product decision, an eligible order that Local
 * cannot fulfil is held for manual handling rather than falling back to courier.
 *
 * @returns {Promise<{eligible: boolean, pickupPin: string, dropPin: string, reason: string}>}
 */
export async function resolveLocalEligibility(orderId, orderDoc = null) {
  const config = await getDelhiveryLocalConfig();

  if (!config.enabled) return { eligible: false, pickupPin: "", dropPin: "", reason: "local disabled" };
  if (!config.hasCredentials) return { eligible: false, pickupPin: "", dropPin: "", reason: "local not configured" };

  let order = orderDoc;
  // Ensure we have the address + seller pincode; reload minimally if needed.
  if (!order || !order.address || !order.seller || typeof order.seller === "string" || !order.seller.pincode) {
    order = await Order.findOne({ orderId })
      .populate("seller", "pincode city state")
      .select("address seller")
      .lean();
  }
  if (!order) return { eligible: false, pickupPin: "", dropPin: "", reason: "order not found" };

  const dropPin = dropPincode(order);
  const seller = order.seller || {};
  const pickupPin = String(seller.pincode || "").trim();

  const dropOk = isLocalCityPincode(dropPin, config);
  const pickupOk = isLocalCityPincode(pickupPin, config);
  const eligible = dropOk && pickupOk;

  const reason = eligible
    ? "ahmedabad intracity"
    : `not intracity (pickup ${pickupPin || "?"} ${pickupOk ? "ok" : "out"}, drop ${dropPin || "?"} ${dropOk ? "ok" : "out"})`;

  logger.info(`[DelhiveryLocal Routing] Order #${orderId}: ${eligible ? "QUICK" : "COURIER"} — ${reason}`);
  return { eligible, pickupPin, dropPin, reason };
}
