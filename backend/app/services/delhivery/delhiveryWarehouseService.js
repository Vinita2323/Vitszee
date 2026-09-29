import Seller from "../../models/seller.js";
import logger from "../logger.js";
import { getDelhiveryConfig } from "./delhiveryConfig.js";
import { sendDelhiveryRequest, extractDelhiveryErrorMessage } from "./delhiveryClient.js";
import { DelhiveryInvalidRequestError, DelhiveryWarehouseError } from "./delhiveryErrors.js";

/**
 * Delhivery rejects these characters anywhere in a payload.
 */
function sanitize(value, maxLength = 100) {
  return String(value || "")
    .replace(/[&#%;\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Stable, unique pickup-location name for a seller. Delhivery matches this name
 * exactly (case sensitive) when an order is created, so it never changes once saved.
 */
export function buildWarehouseName(seller) {
  const shop = sanitize(seller.shopName || seller.name || "Seller", 30) || "Seller";
  const suffix = String(seller._id || "").slice(-6).toUpperCase();
  return `${shop} ${suffix}`.trim();
}

/**
 * Pickup details of a seller, validated the way Delhivery needs them.
 */
export function resolveSellerPickupDetails(seller) {
  const phone = String(seller.phone || "").replace(/[^0-9]/g, "").slice(-10);
  if (phone.length !== 10) {
    throw new DelhiveryInvalidRequestError("Seller pickup phone number is missing or invalid (must be 10 digits).");
  }

  const address = sanitize(seller.address || seller.locality || seller.shopName, 250);
  if (!address) {
    throw new DelhiveryInvalidRequestError("Seller pickup address is missing.");
  }

  const city = sanitize(seller.city, 50);
  if (!city) throw new DelhiveryInvalidRequestError("Seller pickup city is missing.");

  const state = sanitize(seller.state, 50);
  if (!state) throw new DelhiveryInvalidRequestError("Seller pickup state is missing.");

  let pin = String(seller.pincode || "").trim();
  if (!/^\d{6}$/.test(pin)) {
    const match = address.match(/\b\d{6}\b/);
    if (!match) {
      throw new DelhiveryInvalidRequestError("Seller pickup pincode is missing or invalid (must be 6 digits).");
    }
    pin = match[0];
  }

  return {
    name: buildWarehouseName(seller),
    phone,
    address,
    city,
    state,
    pin,
    email: String(seller.email || "").trim(),
  };
}

/**
 * Makes sure the seller's shop exists as a Delhivery pickup location and returns its name.
 * The name is stored on the seller so later orders reuse it without another API call.
 *
 * Falls back to DELHIVERY_FALLBACK_PICKUP_LOCATION when automatic registration is off.
 */
export async function ensureSellerPickupLocation(seller) {
  const config = await getDelhiveryConfig();

  if (!config.autoRegisterSellerWarehouse) {
    if (!config.fallbackPickupLocation) {
      throw new DelhiveryInvalidRequestError(
        "No Delhivery pickup location configured. Set DELHIVERY_FALLBACK_PICKUP_LOCATION or enable automatic seller registration."
      );
    }
    return config.fallbackPickupLocation;
  }

  if (seller?.delhiveryWarehouse?.name) {
    return seller.delhiveryWarehouse.name;
  }

  const pickup = resolveSellerPickupDetails(seller);
  const payload = {
    name: pickup.name,
    registered_name: pickup.name,
    email: pickup.email || undefined,
    phone: pickup.phone,
    address: pickup.address,
    city: pickup.city,
    country: "India",
    pin: pickup.pin,
    return_address: pickup.address,
    return_pin: pickup.pin,
    return_city: pickup.city,
    return_state: pickup.state,
    return_country: "India",
  };

  try {
    const response = await sendDelhiveryRequest({
      method: "POST",
      path: "/api/backend/clientwarehouse/create/",
      json: payload,
    });
    const body = response.data || {};
    if (body.success === false) {
      throw new DelhiveryWarehouseError(
        extractDelhiveryErrorMessage(body, "Delhivery rejected the pickup location."),
        body
      );
    }
    logger.info(`[Delhivery] Registered pickup location "${pickup.name}" for seller ${seller._id}`);
  } catch (err) {
    // A name that already exists is fine: it means the location is registered.
    const alreadyExists = /already exist|duplicate|already registered/i.test(err.message || "");
    if (!alreadyExists) {
      logger.error(`[Delhivery] Could not register pickup location for seller ${seller._id}`, { error: err.message });
      throw err instanceof DelhiveryWarehouseError ? err : new DelhiveryWarehouseError(err.message, err.details);
    }
    logger.info(`[Delhivery] Pickup location "${pickup.name}" already exists at Delhivery`);
  }

  await Seller.updateOne(
    { _id: seller._id },
    { $set: { delhiveryWarehouse: { name: pickup.name, pin: pickup.pin, registeredAt: new Date() } } }
  ).catch((err) => logger.warn(`[Delhivery] Could not save pickup location on seller: ${err.message}`));

  if (seller && typeof seller === "object") {
    seller.delhiveryWarehouse = { name: pickup.name, pin: pickup.pin, registeredAt: new Date() };
  }

  return pickup.name;
}

/**
 * Updates an existing Delhivery pickup location (address / phone changes).
 */
export async function updateSellerPickupLocation(seller, changes = {}) {
  const name = seller?.delhiveryWarehouse?.name;
  if (!name) {
    throw new DelhiveryInvalidRequestError("This seller has no Delhivery pickup location registered yet.");
  }

  const response = await sendDelhiveryRequest({
    method: "POST",
    path: "/api/backend/clientwarehouse/edit/",
    json: { name, registered_name: name, ...changes },
  });
  const body = response.data || {};
  if (body.success === false) {
    throw new DelhiveryWarehouseError(extractDelhiveryErrorMessage(body, "Delhivery rejected the update."), body);
  }
  return body;
}
