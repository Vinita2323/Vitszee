import Seller from "../models/seller.js";
import { calculateDistance } from "../utils/helper.js";
import { buildKey, getOrSet, getTTL } from "./cacheService.js";

const MAX_SELLER_SEARCH_DISTANCE_M = 100000;

export function parseCustomerCoordinates(query = {}) {
  const lat = Number(query.lat);
  const lng = Number(query.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { valid: false, lat: null, lng: null };
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { valid: false, lat: null, lng: null };
  }

  return { valid: true, lat, lng };
}

/**
 * Round lat/lng to 4 decimal places (~11m precision) for cache key.
 * This groups nearby requests into the same cache bucket.
 */
function buildNearbySellersKey(lat, lng) {
  const rLat = Number(lat).toFixed(4);
  const rLng = Number(lng).toFixed(4);
  return buildKey("sellers", "nearby", `${rLat}:${rLng}`);
}

async function fetchNearbySellersWithDistance(lat, lng) {
  const sellers = await Seller.find({
    isActive: true,
    location: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [lng, lat],
        },
        $maxDistance: MAX_SELLER_SEARCH_DISTANCE_M,
      },
    },
  })
    .select("_id location serviceRadius")
    .lean();

  return sellers
    .map((seller) => {
      const coords = seller?.location?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return null;
      const [sellerLng, sellerLat] = coords;
      if (!Number.isFinite(sellerLat) || !Number.isFinite(sellerLng)) {
        return null;
      }
      const distanceKm = calculateDistance(lat, lng, sellerLat, sellerLng);
      if (distanceKm > (seller.serviceRadius || 5)) return null;
      return { sellerId: String(seller._id), distanceKm };
    })
    .filter(Boolean);
}

export async function getNearbySellerIdsForCustomer(lat, lng) {
  const fetchFn = async () => {
    const sellers = await fetchNearbySellersWithDistance(lat, lng);
    return sellers.map((seller) => seller.sellerId);
  };

  return getOrSet(buildNearbySellersKey(lat, lng), fetchFn, getTTL("nearbySellers"));
}

/**
 * Returns a Map of sellerId -> distanceKm for sellers within their service
 * radius of the given customer coordinates. Reuses the same cache bucket as
 * getNearbySellerIdsForCustomer since the underlying fetch is identical.
 */
export async function getNearbySellerDistancesForCustomer(lat, lng) {
  const fetchFn = () => fetchNearbySellersWithDistance(lat, lng);
  const sellers = await getOrSet(
    buildKey("sellers", "nearbyWithDistance", `${Number(lat).toFixed(4)}:${Number(lng).toFixed(4)}`),
    fetchFn,
    getTTL("nearbySellers")
  );
  return new Map(sellers.map((seller) => [seller.sellerId, seller.distanceKm]));
}
