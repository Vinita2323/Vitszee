import handleResponse from "../utils/helper.js";
import { geocodeAddress, geocodePlaceId, reverseGeocode } from "../services/mapsGeocodeService.js";

export const geocodeAddressController = async (req, res) => {
  try {
    const lat = req.query.lat !== undefined ? Number(req.query.lat) : undefined;
    const lng = req.query.lng !== undefined ? Number(req.query.lng) : undefined;
    const address = String(req.query.address || "").trim();
    const placeId = String(req.query.placeId || "").trim();
    const country = req.query.country ? String(req.query.country).trim() : undefined;

    let result;

    if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
      result = await reverseGeocode(lat, lng);
    } else if (placeId) {
      result = await geocodePlaceId(placeId);
    } else if (address && address.length >= 3) {
      result = await geocodeAddress(address, { country });
    } else {
      return handleResponse(res, 400, "address, placeId, or lat/lng query params are required", {
        error: { code: "LOCATION_PARAMS_REQUIRED", message: "address, placeId, or lat/lng query params are required" },
      });
    }

    return handleResponse(res, 200, "Geocoded", {
      location: { lat: result.lat, lng: result.lng },
      formattedAddress: result.formattedAddress,
      placeId: result.placeId,
      types: result.types,
      addressComponents: result.addressComponents,
    });
  } catch (e) {
    const status = e.statusCode || 500;
    return handleResponse(res, status, e.message || "Geocoding failed", {
      error: {
        code: e.code || "GEOCODE_FAILED",
        message: e.message || "Geocoding failed",
      },
    });
  }
};
