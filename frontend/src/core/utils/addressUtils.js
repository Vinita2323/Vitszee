/**
 * Reusable address normalization and location utilities for User and Seller panels.
 */

export const ADDRESS_COMPONENT_PRIORITY = {
  building: ["street_number", "premise", "subpremise"],
  buildingName: ["premise", "point_of_interest", "establishment"],
  street: ["route", "street_address"],
  area: ["sublocality_level_1", "sublocality", "neighborhood"],
  subLocality: ["sublocality_level_2", "sublocality_level_1"],
  landmark: ["landmark", "point_of_interest", "sublocality_level_3"],
  city: ["locality", "administrative_area_level_3", "administrative_area_level_2"],
  district: ["administrative_area_level_2", "administrative_area_level_3"],
  state: ["administrative_area_level_1"],
  country: ["country"],
  pincode: ["postal_code"],
};

/**
 * Get long name or short name from Google address_components
 */
export const getAddressComponent = (components = [], types = [], useShort = false) => {
  if (!Array.isArray(components)) return "";
  const match = components.find((component) =>
    types.some((type) => component.types?.includes(type)),
  );
  if (!match) return "";
  return useShort ? match.short_name || match.long_name || "" : match.long_name || "";
};

/**
 * Normalizes any Google Geocoder or Places result into a standard application address object.
 */
export const normalizeGeocodedAddress = (result) => {
  if (!result) return null;

  const components = result.address_components || [];
  
  // Coordinates extraction
  let lat = null;
  let lng = null;
  if (result.geometry?.location) {
    if (typeof result.geometry.location.lat === "function") {
      lat = result.geometry.location.lat();
      lng = result.geometry.location.lng();
    } else if (typeof result.geometry.location.lat === "number") {
      lat = result.geometry.location.lat;
      lng = result.geometry.location.lng;
    }
  } else if (typeof result.latitude === "number" && typeof result.longitude === "number") {
    lat = result.latitude;
    lng = result.longitude;
  } else if (typeof result.lat === "number" && typeof result.lng === "number") {
    lat = result.lat;
    lng = result.lng;
  }

  // Extract components
  const building = getAddressComponent(components, ADDRESS_COMPONENT_PRIORITY.building);
  const buildingName = getAddressComponent(components, ADDRESS_COMPONENT_PRIORITY.buildingName);
  const street = getAddressComponent(components, ADDRESS_COMPONENT_PRIORITY.street);
  const area = getAddressComponent(components, ADDRESS_COMPONENT_PRIORITY.area);
  const subLocality = getAddressComponent(components, ADDRESS_COMPONENT_PRIORITY.subLocality);
  const landmark = getAddressComponent(components, ADDRESS_COMPONENT_PRIORITY.landmark);
  const city = getAddressComponent(components, ADDRESS_COMPONENT_PRIORITY.city);
  const district = getAddressComponent(components, ADDRESS_COMPONENT_PRIORITY.district);
  const state = getAddressComponent(components, ADDRESS_COMPONENT_PRIORITY.state);
  const stateCode = getAddressComponent(components, ADDRESS_COMPONENT_PRIORITY.state, true);
  const country = getAddressComponent(components, ADDRESS_COMPONENT_PRIORITY.country) || "India";
  const countryCode = getAddressComponent(components, ADDRESS_COMPONENT_PRIORITY.country, true) || "IN";
  const pincode = getAddressComponent(components, ADDRESS_COMPONENT_PRIORITY.pincode);

  // Clean formatted address
  let formattedAddress = result.formatted_address || result.formattedAddress || "";
  if (!formattedAddress) {
    const parts = [
      building,
      buildingName && buildingName !== building ? buildingName : null,
      street,
      area,
      landmark ? `Near ${landmark}` : null,
      city,
      state,
      pincode,
      country,
    ].filter(Boolean);
    formattedAddress = parts.join(", ");
  }

  // Clean trailing country / duplicate country strings if needed
  const cleanFormattedAddress = formattedAddress
    .replace(/^[A-Z0-9\+]{4,12}(?:,\s*)?/, "") // remove leading plus codes if present
    .trim();

  return {
    formattedAddress: cleanFormattedAddress,
    building: building || "",
    houseNumber: building || "",
    buildingName: buildingName || "",
    street: street || "",
    road: street || "",
    area: area || "",
    locality: area || city || "",
    subLocality: subLocality || area || "",
    landmark: landmark || "",
    city: city || "",
    district: district || city || "",
    state: state || "",
    stateCode: stateCode || state || "",
    country: country || "India",
    countryCode: countryCode || "IN",
    pincode: pincode ? pincode.replace(/\D/g, "").slice(0, 6) : "",
    latitude: typeof lat === "number" && !isNaN(lat) ? lat : null,
    longitude: typeof lng === "number" && !isNaN(lng) ? lng : null,
    placeId: result.place_id || result.placeId || "",
  };
};

/**
 * Reverse geocode a { lat, lng } coordinate into a normalized address object.
 * Uses client-side Google Geocoder if loaded, otherwise falls back to backend proxy.
 */
export const reverseGeocodeLatLng = async (lat, lng) => {
  if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) {
    throw new Error("Invalid coordinates provided for reverse geocoding");
  }

  // 1. Client-side Google Geocoder
  if (window.google?.maps?.Geocoder) {
    return new Promise((resolve, reject) => {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === "OK" && Array.isArray(results) && results.length > 0) {
          // Prefer result that is not a plus code
          const best = results.find((r) => !r.types.includes("plus_code")) || results[0];
          const normalized = normalizeGeocodedAddress(best);
          // Ensure coords are preserved
          normalized.latitude = lat;
          normalized.longitude = lng;
          resolve(normalized);
        } else {
          reject(new Error(status || "Reverse geocoding failed"));
        }
      });
    });
  }

  // 2. Direct Google Geocoding API HTTP fallback
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    try {
      const resp = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`,
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data.status === "OK" && data.results?.length > 0) {
          const best = data.results.find((r) => !r.types.includes("plus_code")) || data.results[0];
          const normalized = normalizeGeocodedAddress(best);
          normalized.latitude = lat;
          normalized.longitude = lng;
          return normalized;
        }
      }
    } catch {
      // ignore and fallback to basic coords
    }
  }

  // 3. Fallback coordinates representation
  return {
    formattedAddress: `Location (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
    building: "",
    houseNumber: "",
    buildingName: "",
    street: "",
    road: "",
    area: "",
    locality: "",
    subLocality: "",
    landmark: "",
    city: "Indore",
    district: "Indore",
    state: "Madhya Pradesh",
    stateCode: "MP",
    country: "India",
    countryCode: "IN",
    pincode: "",
    latitude: lat,
    longitude: lng,
    placeId: "",
  };
};

/**
 * Get device GPS location with high accuracy
 */
export const getCurrentPosition = (options = {}) => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        let msg = "Failed to detect your location";
        if (error.code === 1) msg = "Please enable location permission in your browser";
        else if (error.code === 2) msg = "Location position is currently unavailable";
        else if (error.code === 3) msg = "Location request timed out";
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
        ...options,
      },
    );
  });
};
