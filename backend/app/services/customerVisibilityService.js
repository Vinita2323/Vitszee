import Seller from "../models/seller.js";
import { calculateDistance } from "../utils/helper.js";
import { buildKey, getOrSet, getTTL } from "./cacheService.js";

const MAX_SELLER_SEARCH_DISTANCE_M = 100000;

export function parseCustomerCoordinates(query = {}) {
  const rawLat = query?.lat ?? query?.latitude;
  const rawLng = query?.lng ?? query?.longitude ?? query?.lon;
  const lat = rawLat !== undefined && rawLat !== null && rawLat !== "" ? Number(rawLat) : NaN;
  const lng = rawLng !== undefined && rawLng !== null && rawLng !== "" ? Number(rawLng) : NaN;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { valid: false, lat: null, lng: null };
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { valid: false, lat: null, lng: null };
  }

  return { valid: true, lat, lng };
}

export function parseCustomerLocation(query = {}) {
  const coords = parseCustomerCoordinates(query);
  const city = String(query?.city || "").trim();
  const state = String(query?.state || "").trim();
  const district = String(query?.district || query?.city || "").trim();
  const pincode = String(query?.pincode || "").trim();
  const area = String(query?.area || query?.locality || "").trim();

  const hasLocation =
    coords.valid ||
    Boolean(city || state || district || pincode || area);

  return {
    hasLocation,
    coords,
    lat: coords.lat,
    lng: coords.lng,
    city,
    state,
    district,
    pincode,
    area,
  };
}

function normalizeLocString(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/gi, "");
}

/**
 * Cache key based on rounded coordinates and text hierarchy
 */
function buildNearbySellersKey(locContext) {
  const latStr = locContext.lat != null ? Number(locContext.lat).toFixed(4) : "none";
  const lngStr = locContext.lng != null ? Number(locContext.lng).toFixed(4) : "none";
  const cityStr = normalizeLocString(locContext.city) || "none";
  const pinStr = normalizeLocString(locContext.pincode) || "none";
  const stateStr = normalizeLocString(locContext.state) || "none";
  return buildKey("sellers", "nearby", `${latStr}:${lngStr}:${cityStr}:${pinStr}:${stateStr}`);
}

/**
 * Checks if seller matches user location by region hierarchy: State -> District -> City -> Area/Pincode
 */
function matchesLocationHierarchy(seller, locContext) {
  const sellerCity = normalizeLocString(seller.city);
  const sellerState = normalizeLocString(seller.state);
  const sellerPincode = normalizeLocString(seller.pincode);
  const sellerLocality = normalizeLocString(seller.locality);

  const custCity = normalizeLocString(locContext.city);
  const custState = normalizeLocString(locContext.state);
  const custDistrict = normalizeLocString(locContext.district);
  const custPincode = normalizeLocString(locContext.pincode);
  const custArea = normalizeLocString(locContext.area);

  // 1. Pincode / Area exact match (most granular)
  if (custPincode && sellerPincode && custPincode === sellerPincode) {
    return true;
  }
  if (custArea && sellerLocality && (sellerLocality.includes(custArea) || custArea.includes(sellerLocality))) {
    return true;
  }

  // 2. City / District match
  const cityMatch =
    (custCity && sellerCity && (sellerCity === custCity || sellerCity.includes(custCity) || custCity.includes(sellerCity))) ||
    (custDistrict && sellerCity && (sellerCity === custDistrict || sellerCity.includes(custDistrict) || custDistrict.includes(sellerCity)));

  if (cityMatch) {
    return true;
  }

  // 3. State match ONLY IF seller has no explicit city defined (state-wide store)
  if (!sellerCity && custState && sellerState && custState === sellerState) {
    return true;
  }

  return false;
}

/**
 * Checks if seller is physically in range based on coordinates & serviceRadius
 */
function isSellerInGeoRange(seller, lat, lng, locContext) {
  const coords = seller?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return false;
  const [sellerLng, sellerLat] = coords;
  if (!Number.isFinite(sellerLat) || !Number.isFinite(sellerLng)) {
    return false;
  }

  // If coordinates are [0, 0] (unconfigured GPS), fallback to hierarchy
  if (sellerLat === 0 && sellerLng === 0) {
    return matchesLocationHierarchy(seller, locContext);
  }

  const distanceKm = calculateDistance(lat, lng, sellerLat, sellerLng);
  const maxRadius = Math.max(Number(seller.serviceRadius) || 5, 1);

  if (distanceKm > maxRadius) {
    return false;
  }

  // Ensure contradictory cities don't match even if coordinates accidentally overlap
  const sellerCity = normalizeLocString(seller.city);
  const custCity = normalizeLocString(locContext?.city);
  if (sellerCity && custCity && sellerCity !== custCity) {
    // If distance is large (> 40km) and cities differ, reject
    if (distanceKm > 40) return false;
  }

  return true;
}

export async function getNearbySellerIdsForCustomer(arg1, arg2) {
  let locContext;
  if (typeof arg1 === "object" && arg1 !== null) {
    locContext = parseCustomerLocation(arg1);
  } else {
    locContext = parseCustomerLocation({ lat: arg1, lng: arg2 });
  }

  const fetchFn = async () => {
    // If coordinates are valid, try geospatial search first
    if (locContext.coords.valid) {
      const sellers = await Seller.find({
        isActive: true,
        location: {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [locContext.lng, locContext.lat],
            },
            $maxDistance: MAX_SELLER_SEARCH_DISTANCE_M,
          },
        },
      })
        .select("_id location serviceRadius city state pincode locality")
        .lean();

      const matchedGeo = sellers
        .filter((seller) => isSellerInGeoRange(seller, locContext.lat, locContext.lng, locContext))
        .map((seller) => String(seller._id));

      if (matchedGeo.length > 0) {
        return matchedGeo;
      }
    }

    // Fallback or text-based location search (State -> District -> City -> Area/Pincode)
    if (locContext.city || locContext.pincode || locContext.state || locContext.district) {
      const allActiveSellers = await Seller.find({ isActive: true })
        .select("_id location serviceRadius city state pincode locality")
        .lean();

      return allActiveSellers
        .filter((seller) => {
          if (locContext.coords.valid) {
            return isSellerInGeoRange(seller, locContext.lat, locContext.lng, locContext);
          }
          return matchesLocationHierarchy(seller, locContext);
        })
        .map((seller) => String(seller._id));
    }

    return [];
  };

  return getOrSet(buildNearbySellersKey(locContext), fetchFn, getTTL("nearbySellers"));
}

/**
 * Checks if a specific product is available for the given customer location
 */
export async function isProductAvailableAtLocation(product, locQuery = {}) {
  const locContext = parseCustomerLocation(locQuery);

  if (!locContext.hasLocation) {
    // If no location provided, treat as available to avoid blocking non-location calls
    return { available: true };
  }

  if (!product) {
    return { available: false, reason: "Product not found" };
  }

  // 1. Check custom location restrictions on product itself if defined
  const restriction = product.locationRestriction;
  if (restriction && restriction.isCustom) {
    const custCity = normalizeLocString(locContext.city);
    const custState = normalizeLocString(locContext.state);
    const custPincode = normalizeLocString(locContext.pincode);

    if (Array.isArray(restriction.cities) && restriction.cities.length > 0) {
      const allowedCities = restriction.cities.map(normalizeLocString);
      if (custCity && !allowedCities.includes(custCity)) {
        return {
          available: false,
          reason: "This product is not available in your city.",
        };
      }
    }

    if (Array.isArray(restriction.pincodes) && restriction.pincodes.length > 0) {
      const allowedPins = restriction.pincodes.map(normalizeLocString);
      if (custPincode && !allowedPins.includes(custPincode)) {
        return {
          available: false,
          reason: "This product is not available in your area pincode.",
        };
      }
    }

    if (Array.isArray(restriction.states) && restriction.states.length > 0) {
      const allowedStates = restriction.states.map(normalizeLocString);
      if (custState && !allowedStates.includes(custState)) {
        return {
          available: false,
          reason: "This product is not available in your state.",
        };
      }
    }
  }

  // 2. Check seller store location & coverage
  let seller = product.sellerId;
  if (seller && typeof seller === "object" && seller._id) {
    // Already populated
  } else if (seller) {
    seller = await Seller.findById(seller).select("_id location serviceRadius city state pincode locality isActive").lean();
  }

  if (!seller) {
    return { available: false, reason: "Store information not available" };
  }

  if (seller.isActive === false) {
    return { available: false, reason: "Store is currently inactive" };
  }

  // Check geo range if coordinates available
  if (locContext.coords.valid) {
    const inGeo = isSellerInGeoRange(seller, locContext.lat, locContext.lng, locContext);
    if (!inGeo) {
      return {
        available: false,
        reason: "This product is not available in your location.",
      };
    }
    return { available: true };
  }

  // Check hierarchy if text location available
  const inHierarchy = matchesLocationHierarchy(seller, locContext);
  if (!inHierarchy) {
    return {
      available: false,
      reason: "This product is not available in your location.",
    };
  }

  return { available: true };
}

