import Seller from "../../models/seller.js";
import logger from "../logger.js";
import { getDelhiveryConfig } from "../delhivery/delhiveryConfig.js";
import { getDelhiveryLocalConfig } from "../delhiveryLocal/delhiveryLocalConfig.js";
import { evaluateLocalEligibility, dropPincode } from "../delhiveryLocal/delhiveryLocalRouting.js";
import { checkForwardServiceability, getForwardRateQuote } from "../delhivery/delhiveryForwardService.js";

/**
 * Courier (Delhivery Express) shipping pricing for checkout.
 *
 * Local lanes (internal captains / Delhivery Local quick) keep the existing distance pricing.
 * Only the courier lane is priced here, with the REAL Delhivery quote (pass-through, no markup,
 * no fallback fee on failure).
 */

export const DELIVERY_LANE = Object.freeze({
  INTERNAL: "internal",
  QUICK: "quick",
  COURIER: "courier",
});

export const QUOTE_CACHE_TTL_MS = 15 * 60 * 1000;
const QUOTE_CACHE_MAX = 500;
const quoteCache = new Map();

export function clearCourierQuoteCache() {
  quoteCache.clear();
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function checkoutError(message, statusCode = 400, code = "COURIER_PRICING_ERROR") {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

/** "500 g", "250gm", "1.5 kg", "2 Kilograms" -> grams. Returns null if unparseable/invalid. */
export function parseWeightToGrams(text) {
  if (text === null || text === undefined) return null;
  const match = String(text)
    .trim()
    .match(/(\d+(?:[.,]\d+)?)\s*(kilograms?|kgs?|grams?|gms?|gm|g)\b/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = match[2].toLowerCase();
  const grams = unit.startsWith("k") ? value * 1000 : value;
  return Math.round(grams);
}

/** Sum of (unit grams x quantity) for one seller's items; missing/invalid weights use the default. */
export function computeItemsWeightGrams(items = [], defaultWeightGrams = 500) {
  const fallback = Number(defaultWeightGrams) > 0 ? Number(defaultWeightGrams) : 500;
  let total = 0;
  for (const item of items) {
    const qty = Math.max(1, Number(item?.quantity) || 1);
    const unit = parseWeightToGrams(item?.weightText ?? item?.weight) ?? fallback;
    total += unit * qty;
  }
  return Math.max(1, Math.round(total));
}

export async function loadSellerForPricing(sellerId, { session = null } = {}) {
  const query = Seller.findById(sellerId)
    .select("city state address locality shopName pincode location")
    .lean();
  if (session) query.session(session);
  return query;
}

/**
 * Decides the delivery lane BEFORE pricing, using the same rules as dispatch:
 *  - internal captains: COD + in-city
 *  - Delhivery Local quick: in-city + Local enabled with credentials
 *  - otherwise Express courier
 */
export async function resolveDeliveryLane({ seller, address, paymentMode }) {
  const localConfig = await getDelhiveryLocalConfig();
  const evaluation = evaluateLocalEligibility({ seller, address, config: localConfig });
  const isCod = String(paymentMode || "").toUpperCase() === "COD";
  if (isCod && evaluation.eligible) return { lane: DELIVERY_LANE.INTERNAL, evaluation };
  if (localConfig.enabled && localConfig.hasCredentials && evaluation.eligible) {
    return { lane: DELIVERY_LANE.QUICK, evaluation };
  }
  return { lane: DELIVERY_LANE.COURIER, evaluation };
}

function readCache(key, now) {
  const hit = quoteCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    quoteCache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key, value, now) {
  if (quoteCache.size >= QUOTE_CACHE_MAX) {
    quoteCache.delete(quoteCache.keys().next().value);
  }
  quoteCache.set(key, { value, expiresAt: now + QUOTE_CACHE_TTL_MS });
}

/**
 * Real Delhivery quote for one seller's shipment.
 * COD: Delhivery's COD charge depends on the collectable amount, which itself includes the
 * shipping fee, so the quote is taken twice (second pass uses base + first fee).
 * Throws a checkout-safe error on any failure. NEVER falls back to a made-up fee.
 */
export async function getCourierQuoteForSeller({
  sellerId,
  seller,
  address,
  items,
  paymentMode,
  codBaseAmount = 0,
  now = Date.now(),
}) {
  const config = await getDelhiveryConfig();
  if (!config.forwardEnabled) {
    throw checkoutError("Courier delivery is currently unavailable. Please try again later.", 503, "COURIER_DISABLED");
  }

  const pickupPin = String(seller?.pincode || "").trim();
  if (!/^\d{6}$/.test(pickupPin)) {
    throw checkoutError("This seller's pickup pincode is not configured, so shipping cannot be calculated.", 400, "COURIER_PICKUP_PINCODE");
  }
  const deliveryPin = dropPincode({ address });
  if (!/^\d{6}$/.test(deliveryPin)) {
    throw checkoutError("Please add a valid 6-digit delivery pincode to calculate shipping.", 400, "COURIER_DELIVERY_PINCODE");
  }

  const isCod = String(paymentMode || "").toUpperCase() === "COD";
  const paymentType = isCod ? "COD" : "Pre-paid";
  const weightGrams = computeItemsWeightGrams(items, config.defaultWeightGrams);
  const shippingMode = String(config.shippingMode || "Surface");
  const codBase = isCod ? Math.max(0, Math.round(Number(codBaseAmount) || 0)) : 0;

  const key = [String(sellerId), pickupPin, deliveryPin, weightGrams, paymentType, shippingMode, codBase].join("|");
  const cached = readCache(key, now);
  if (cached) return cached;

  const serviceability = await checkForwardServiceability({
    pickupPincode: pickupPin,
    deliveryPincode: deliveryPin,
    isCod,
  });
  if (!serviceability.serviceable) {
    throw checkoutError(
      serviceability.reason || `Delivery is not available to pincode ${deliveryPin}.`,
      400,
      "COURIER_NOT_SERVICEABLE",
    );
  }

  const fetchQuote = (codAmount) =>
    getForwardRateQuote({
      pickupPincode: pickupPin,
      deliveryPincode: deliveryPin,
      weightGrams,
      paymentType,
      codAmount,
      shippingMode,
    });

  let quote;
  try {
    quote = await fetchQuote(codBase);
    if (isCod) {
      quote = await fetchQuote(Math.round(codBase + quote.amount));
    }
  } catch (err) {
    logger.warn("[CourierPricing] Delhivery rate lookup failed", {
      sellerId: String(sellerId),
      code: err?.code,
      message: err?.message,
    });
    throw checkoutError(
      "We could not calculate courier shipping charges right now. Please try again in a moment.",
      502,
      "COURIER_QUOTE_FAILED",
    );
  }

  if (!Number.isFinite(quote?.amount) || quote.amount <= 0) {
    throw checkoutError(
      "We could not calculate courier shipping charges right now. Please try again in a moment.",
      502,
      "COURIER_QUOTE_INVALID",
    );
  }

  const value = {
    fee: round2(quote.amount),
    quote: {
      provider: "delhivery",
      amount: round2(quote.amount),
      shippingMode: quote.shippingMode,
      paymentType: quote.paymentType,
      pickupPincode: pickupPin,
      destinationPincode: deliveryPin,
      actualWeightGrams: weightGrams,
      chargedWeightGrams: quote.chargedWeight || null,
      zone: quote.zone || null,
      chargeBreakdown: quote.breakdown || {},
      quotedAt: new Date(now),
      reference: `CQ-${String(sellerId).slice(-6)}-${now.toString(36)}`,
    },
  };
  writeCache(key, value, now);
  return value;
}
