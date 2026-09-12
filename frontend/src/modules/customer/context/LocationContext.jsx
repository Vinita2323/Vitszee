import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { customerApi } from "../services/customerApi";
import { hasValidStoredAuthToken } from "@core/utils/authStorage";
import { getJSON, setJSON, STORAGE_KEYS } from "@core/utils/storage";
import {
  reverseGeocodeLatLng,
  getCurrentPosition,
} from "@/core/utils/addressUtils";

const LocationContext = createContext(undefined);
const STORAGE_KEY = STORAGE_KEYS.LOCATION;
const LOCATION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const LocationProvider = ({ children }) => {
  // Initialize with cached location from storage if available
  const [currentLocation, setCurrentLocation] = useState(() => {
    const cached = getJSON(STORAGE_KEY);
    if (
      cached &&
      (cached.address || cached.name) &&
      typeof cached.latitude === "number" &&
      typeof cached.longitude === "number"
    ) {
      return {
        name: cached.address || cached.name,
        time: cached.time || "12-15 mins",
        city: cached.city || "Indore",
        state: cached.state || "Madhya Pradesh",
        pincode: cached.pincode || "452001",
        latitude: cached.latitude,
        longitude: cached.longitude,
      };
    }
    return {
      name: "169, 507, Corporate House, RNT Marg, Near Central Mall, Film Colony, South Tukoganj, Indore, Madhya Pradesh 452001, India",
      time: "12-15 mins",
      city: "Indore",
      state: "Madhya Pradesh",
      pincode: "452001",
      latitude: 22.71760605465747,
      longitude: 75.87197264240304,
    };
  });

  // Address list for drawer UI – hydrated from profile API
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [locationError, setLocationError] = useState(null);

  // Update the current location and persist to storage
  const updateLocation = (
    newLoc,
    { persist = true, updateSavedHome = false } = {},
  ) => {
    setCurrentLocation(newLoc);

    if (updateSavedHome) {
      setSavedAddresses((prev) =>
        prev.map((addr) =>
          addr.label === "Home" ? { ...addr, address: newLoc.name } : addr,
        ),
      );
    }

    if (persist) {
      const payload = {
        address: newLoc.name,
        city: newLoc.city,
        state: newLoc.state,
        pincode: newLoc.pincode,
        latitude: newLoc.latitude,
        longitude: newLoc.longitude,
        time: newLoc.time || "12-15 mins",
      };
      setJSON(STORAGE_KEY, payload, { ttlMs: LOCATION_TTL_MS });
    }
  };

  const addAddress = (newAddress) => {
    setSavedAddresses((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        label: newAddress.label || "Other",
        address: newAddress.address,
        phone: newAddress.phone || "N/A",
        isCurrent: false,
      },
    ]);
  };

  // Resolve location once using browser geolocation + reverse-geocoding
  const fetchAndCacheLocation = useCallback(async () => {
    setIsFetchingLocation(true);
    setLocationError(null);

    try {
      // High-accuracy GPS detect
      const pos = await getCurrentPosition();
      const latitude = pos.latitude;
      const longitude = pos.longitude;

      try {
        const normalized = await reverseGeocodeLatLng(latitude, longitude);
        const liveLocation = {
          name: normalized.formattedAddress || `Lat ${latitude.toFixed(5)}, Lng ${longitude.toFixed(5)}`,
          time: "12-15 mins",
          city: normalized.city || "Indore",
          state: normalized.state || "Madhya Pradesh",
          pincode: normalized.pincode || "452001",
          latitude,
          longitude,
        };
        updateLocation(liveLocation, { persist: true, updateSavedHome: false });
        return { ok: true, location: liveLocation };
      } catch (geocodeErr) {
        // Fallback to coordinates
        const fallbackLocation = {
          name: `Lat ${Number(latitude).toFixed(5)}, Lng ${Number(longitude).toFixed(5)}`,
          time: "12-15 mins",
          city: currentLocation?.city || "Indore",
          state: currentLocation?.state || "Madhya Pradesh",
          pincode: currentLocation?.pincode || "452001",
          latitude,
          longitude,
        };
        updateLocation(fallbackLocation, { persist: true, updateSavedHome: false });
        return {
          ok: true,
          location: fallbackLocation,
          warning: geocodeErr?.message || "Address geocoding unavailable",
        };
      }
    } catch (err) {
      const msg = err.message || "Unable to retrieve your location";
      setLocationError(msg);
      return { ok: false, error: msg };
    } finally {
      setIsFetchingLocation(false);
    }
  }, [currentLocation?.city, currentLocation?.pincode, currentLocation?.state]);

  const refreshAddresses = useCallback(async () => {
    if (!hasValidStoredAuthToken("auth_customer")) return;
    try {
      const { data } = await customerApi.getProfile();
      const profile = data?.result ?? data?.data ?? data;
      const raw = Array.isArray(profile?.addresses) ? profile.addresses : [];
      setSavedAddresses(
        raw.map((addr, idx) => ({
          id: addr._id ?? String(idx),
          label:
            (addr.label || "Home").charAt(0).toUpperCase() +
            (addr.label || "home").slice(1),
          address:
            addr.fullAddress ||
            [addr.landmark, addr.city, addr.state, addr.pincode]
              .filter(Boolean)
              .join(", ") ||
            "",
          location:
            addr?.location &&
            typeof addr.location.lat === "number" &&
            typeof addr.location.lng === "number" &&
            Number.isFinite(addr.location.lat) &&
            Number.isFinite(addr.location.lng)
              ? { lat: addr.location.lat, lng: addr.location.lng }
              : null,
          placeId: typeof addr?.placeId === "string" ? addr.placeId : null,
          phone: profile?.phone ?? "",
          isCurrent: idx === 0,
        })),
      );
    } catch {
      // If API fails, keep existing in-memory addresses.
    }
  }, []);

  // Hydrate saved addresses from profile on mount
  useEffect(() => {
    refreshAddresses();
  }, [refreshAddresses]);

  const locationValue = useMemo(
    () => ({
      currentLocation,
      savedAddresses,
      updateLocation,
      addAddress,
      refreshAddresses,
      isFetchingLocation,
      locationError,
      refreshLocation: fetchAndCacheLocation,
    }),
    [
      currentLocation,
      savedAddresses,
      isFetchingLocation,
      locationError,
      refreshAddresses,
      fetchAndCacheLocation,
    ],
  );

  return (
    <LocationContext.Provider value={locationValue}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error("useLocation must be used within a LocationProvider");
  }
  return context;
};
