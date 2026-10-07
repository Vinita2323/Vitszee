import Seller from "../models/seller.js";
import {
  getDelhiveryLocalConfig,
  matchesLocalCity,
  isLocalCityPincode,
} from "./delhiveryLocal/delhiveryLocalConfig.js";

// Courier (Delhivery Express) is a multi-day service; quick delivery is intracity.
export const COURIER_MIN_DAYS = Number(process.env.COURIER_ETA_MIN_DAYS) || 3;
export const COURIER_MAX_DAYS = Number(process.env.COURIER_ETA_MAX_DAYS) || 5;

// Delivery-mode lookup must never slow down checkout or a product listing. If the
// config/seller lookup is slow or unavailable we return null and callers fall back
// to their own heuristic rather than blocking the response.
const LOOKUP_TIMEOUT_MS = Number(process.env.DELIVERY_ESTIMATE_TIMEOUT_MS) || 1500;

function withTimeout(promise, fallback, ms = LOOKUP_TIMEOUT_MS) {
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise((resolve) => {
      const t = setTimeout(() => resolve(fallback), ms);
      if (typeof t.unref === "function") t.unref();
    }),
  ]);
}

/** Quick ETA: "25-30 mins" under an hour, "1h 20m" above it. */
export function formatQuickEta(minutes) {
  const m = Math.max(5, Math.ceil(Number(minutes) || 15));
  if (m < 60) return `${m}-${m + 5} mins`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function formatCourierEta() {
  return COURIER_MIN_DAYS === COURIER_MAX_DAYS
    ? `${COURIER_MIN_DAYS} days`
    : `${COURIER_MIN_DAYS}-${COURIER_MAX_DAYS} days`;
}

function sellerCityText(seller = {}) {
  return [seller.city, seller.address, seller.locality, seller.state, seller.shopName]
    .filter(Boolean)
    .join(" ");
}
function addressCityText(address = {}) {
  return [address.city, address.fullAddress, address.address, address.landmark].filter(Boolean).join(" ");
}
function addressPincode(address = {}) {
  const p = String(address.pincode || "").trim();
  if (/^\d{6}$/.test(p)) return p;
  const text = `${address.fullAddress || ""} ${address.address || ""} ${address.city || ""}`;
  const m = text.match(/\b\d{6}\b/);
  return m ? m[0] : "";
}

/**
 * Same city gate the dispatch uses: quick delivery needs BOTH the seller and the
 * customer inside the configured quick-delivery city.
 */
export async function isQuickEligible({ seller, address, config = null } = {}) {
  const cfg = config || (await getDelhiveryLocalConfig());
  if (!cfg.enabled || !cfg.hasCredentials || !seller) return false;
  const sellerOk =
    matchesLocalCity(sellerCityText(seller), cfg) ||
    isLocalCityPincode(String(seller.pincode || "").trim(), cfg);
  const customerOk =
    matchesLocalCity(addressCityText(address), cfg) || isLocalCityPincode(addressPincode(address), cfg);
  return Boolean(sellerOk && customerOk);
}

/**
 * The display payload every surface (customer app, seller panel) renders, so the
 * wording and units are always consistent.
 */
export function deliveryDisplay(mode, estimatedTimeMins = null) {
  if (mode === "quick") {
    return {
      mode: "quick",
      isQuick: true,
      etaText: formatQuickEta(estimatedTimeMins),
      etaMinutes: Math.max(5, Math.ceil(Number(estimatedTimeMins) || 15)),
      subtitle: "Instant quick-commerce dispatch",
      badge: "Express",
    };
  }
  return {
    mode: "courier",
    isQuick: false,
    etaText: formatCourierEta(),
    minDays: COURIER_MIN_DAYS,
    maxDays: COURIER_MAX_DAYS,
    subtitle: "Standard courier delivery",
    badge: "Courier",
  };
}

/** Resolve the delivery display for one seller + delivery address. */
export async function resolveDeliveryEstimate({
  sellerId = null,
  seller = null,
  address = {},
  estimatedTimeMins = null,
  config = null,
} = {}) {
  let doc = seller;
  if (!doc && sellerId) {
    try {
      doc = await Seller.findById(sellerId).select("city address locality state shopName pincode").lean();
    } catch {
      doc = null;
    }
  }
  const quick = await isQuickEligible({ seller: doc, address, config });
  return deliveryDisplay(quick ? "quick" : "courier", estimatedTimeMins);
}

/**
 * Cart-level resolution: the order only ships quick when EVERY seller in it is
 * quick-eligible for this address (a mixed cart falls back to courier wording).
 */
export async function resolveDeliveryEstimateForSellers(args = {}) {
  return withTimeout(resolveDeliveryEstimateForSellersUnguarded(args), null);
}

async function resolveDeliveryEstimateForSellersUnguarded({ sellerIds = [], address = {}, estimatedTimeMins = null } = {}) {
  const ids = [...new Set(sellerIds.map(String).filter(Boolean))];
  if (!ids.length) return deliveryDisplay("courier", estimatedTimeMins);
  const config = await getDelhiveryLocalConfig();
  let docs = [];
  try {
    docs = await Seller.find({ _id: { $in: ids } }).select("city address locality state shopName pincode").lean();
  } catch {
    docs = [];
  }
  if (docs.length !== ids.length) return deliveryDisplay("courier", estimatedTimeMins);
  for (const doc of docs) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await isQuickEligible({ seller: doc, address, config }))) {
      return deliveryDisplay("courier", estimatedTimeMins);
    }
  }
  return deliveryDisplay("quick", estimatedTimeMins);
}

/**
 * Batch variant for product listings: sellerId -> display payload, resolved once
 * per seller for the customer's currently selected location.
 */
export async function resolveDeliveryMapForSellers(args = {}) {
  return withTimeout(resolveDeliveryMapForSellersUnguarded(args), new Map());
}

async function resolveDeliveryMapForSellersUnguarded({ sellerIds = [], address = {}, estimatedTimeMins = null } = {}) {
  const ids = [...new Set(sellerIds.map(String).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  const config = await getDelhiveryLocalConfig();
  let docs = [];
  try {
    docs = await Seller.find({ _id: { $in: ids } }).select("city address locality state shopName pincode").lean();
  } catch {
    docs = [];
  }
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  for (const id of ids) {
    const doc = byId.get(id);
    // eslint-disable-next-line no-await-in-loop
    const quick = doc ? await isQuickEligible({ seller: doc, address, config }) : false;
    map.set(id, deliveryDisplay(quick ? "quick" : "courier", estimatedTimeMins));
  }
  return map;
}
