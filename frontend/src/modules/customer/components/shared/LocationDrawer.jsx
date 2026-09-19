import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Search, MapPin, Plus, Home, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "../../context/LocationContext";
import { loadGoogleMaps } from "../../../../core/services/googleMapsLoader";
import { customerApi } from "../../services/customerApi";
import { getCachedGeocode, setCachedGeocode } from "@/core/utils/geocodeCache";

import {
  normalizeGeocodedAddress,
} from "@/core/utils/addressUtils";

const LocationDrawer = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const {
    currentLocation,
    savedAddresses,
    updateLocation,
    refreshLocation,
    isFetchingLocation,
    locationError,
  } = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [placePredictions, setPlacePredictions] = useState([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [placesError, setPlacesError] = useState("");

  const MIN_QUERY_LENGTH = 3;
  const SEARCH_DEBOUNCE_MS = 350;
  const MAX_SUGGESTIONS = 6;
  const CACHE_TTL_MS = 3 * 60 * 1000;

  const mapsReadyRef = React.useRef(false);
  const autocompleteServiceRef = React.useRef(null);
  const geocoderRef = React.useRef(null);
  const latestPlacesRequestRef = React.useRef(0);
  const autocompleteSessionTokenRef = React.useRef(null);
  const placesCacheRef = React.useRef(new Map());

  const resetAutocompleteSession = React.useCallback(() => {
    autocompleteSessionTokenRef.current = null;
  }, []);

  const getAutocompleteSessionToken = React.useCallback(() => {
    if (
      !autocompleteSessionTokenRef.current &&
      window.google?.maps?.places?.AutocompleteSessionToken
    ) {
      autocompleteSessionTokenRef.current =
        new window.google.maps.places.AutocompleteSessionToken();
    }
    return autocompleteSessionTokenRef.current;
  }, []);

  const initGooglePlaces = React.useCallback(async () => {
    if (mapsReadyRef.current) return true;

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setPlacesError("Google Maps API key is missing");
      return false;
    }

    try {
      await loadGoogleMaps(apiKey);
      if (!window.google?.maps?.places) {
        setPlacesError("Google Places library is unavailable");
        return false;
      }
      autocompleteServiceRef.current =
        new window.google.maps.places.AutocompleteService();
      geocoderRef.current = new window.google.maps.Geocoder();
      mapsReadyRef.current = true;
      return true;
    } catch (err) {
      setPlacesError(err?.message || "Unable to load Google search");
      return false;
    }
  }, []);

  // Close drawer when location is successfully fetched
  const prevFetching = React.useRef(isFetchingLocation);
  React.useEffect(() => {
    if (prevFetching.current && !isFetchingLocation && !locationError) {
      onClose();
    }
    prevFetching.current = isFetchingLocation;
  }, [isFetchingLocation, locationError, onClose]);

  React.useEffect(() => {
    if (isOpen) return;
    setSearchQuery("");
    setPlacePredictions([]);
    setIsSearchingPlaces(false);
    setPlacesError("");
    setIsSearchFocused(false);
    resetAutocompleteSession();
  }, [isOpen, resetAutocompleteSession]);

  // Lock body scroll when drawer is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight =
        "var(--removed-body-scroll-bar-size, 0px)"; // Prevent layout shift if possible
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [isOpen]);

  const handleSelectCurrentLocation = (e) => {
    e.preventDefault();
    e.stopPropagation();
    refreshLocation();
  };

  const handleSelectAddress = (address) => {
    const hasCoords =
      address?.location &&
      typeof address.location.lat === "number" &&
      typeof address.location.lng === "number" &&
      Number.isFinite(address.location.lat) &&
      Number.isFinite(address.location.lng);

    const apply = (coords) => {
      const newLoc = {
        name: address.address,
        time: "12-15 mins",
        city: address.city || currentLocation?.city || "Indore",
        state: address.state || currentLocation?.state || "Madhya Pradesh",
        pincode: address.pincode || currentLocation?.pincode || "452001",
        ...(coords ? { latitude: coords.lat, longitude: coords.lng } : {}),
      };

      // Persist so checkout/nearby sellers use the same chosen address coordinates.
      updateLocation(newLoc, { persist: true, updateSavedHome: false });
      onClose();
    };

    if (hasCoords) {
      apply({ lat: address.location.lat, lng: address.location.lng });
      return;
    }

    // Older saved addresses may not have coords. Prefer backend geocoding so billing is controlled centrally.
    const addrText = address?.address || "";
    const cacheKey = `addr:${addrText}`;
    const cached = getCachedGeocode(cacheKey);
    if (cached?.location?.lat && cached?.location?.lng) {
      apply(cached.location);
      return;
    }

    customerApi
      .geocodeAddress(addrText)
      .then((resp) => {
        const loc = resp.data?.result?.location;
        if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
          setCachedGeocode(cacheKey, { location: { lat: loc.lat, lng: loc.lng } });
          apply({ lat: loc.lat, lng: loc.lng });
          return;
        }
        apply(null);
      })
      .catch(() => apply(null));
  };

  const handleAddAddress = () => {
    onClose();
    navigate("/addresses?add=1");
  };

  const handleSelectPlace = React.useCallback(
    (prediction) => {
      const geocoder = geocoderRef.current;
      if (!geocoder || !prediction?.place_id) return;

      geocoder.geocode({ placeId: prediction.place_id }, (results, status) => {
        if (status !== "OK" || !Array.isArray(results) || !results[0]) {
          setPlacesError("Could not resolve selected location");
          return;
        }

        const result = results[0];
        const normalized = normalizeGeocodedAddress(result);

        if (!normalized?.latitude || !normalized?.longitude) {
          setPlacesError("Location coordinates not available");
          return;
        }

        updateLocation(
          {
            name: normalized.formattedAddress || prediction.description,
            time: "12-15 mins",
            city: normalized.city || currentLocation.city,
            state: normalized.state || currentLocation.state,
            pincode: normalized.pincode || currentLocation.pincode,
            latitude: normalized.latitude,
            longitude: normalized.longitude,
          },
          { persist: true, updateSavedHome: false },
        );

        setSearchQuery("");
        setPlacePredictions([]);
        setPlacesError("");
        setIsSearchFocused(false);
        resetAutocompleteSession();
        onClose();
      });
    },
    [
      currentLocation.city,
      currentLocation.pincode,
      currentLocation.state,
      onClose,
      resetAutocompleteSession,
      updateLocation,
    ],
  );

  React.useEffect(() => {
    if (!isOpen) return;
    if (!isSearchFocused) return;

    const query = searchQuery.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      latestPlacesRequestRef.current += 1;
      setPlacePredictions([]);
      setIsSearchingPlaces(false);
      setPlacesError("");
      return;
    }
    const cacheKey = query.toLowerCase();
    const cached = placesCacheRef.current.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setPlacePredictions(cached.predictions);
      setIsSearchingPlaces(false);
      setPlacesError("");
      return;
    }

    const timer = setTimeout(async () => {
      const ready = await initGooglePlaces();
      if (!ready || !autocompleteServiceRef.current) return;

      const requestId = latestPlacesRequestRef.current + 1;
      latestPlacesRequestRef.current = requestId;
      const querySnapshot = query;

      setIsSearchingPlaces(true);
      setPlacesError("");

      const request = {
        input: query,
        componentRestrictions: { country: "in" },
        sessionToken: getAutocompleteSessionToken(),
      };

      const lat = Number(currentLocation?.latitude);
      const lng = Number(currentLocation?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        request.location = new window.google.maps.LatLng(lat, lng);
        request.radius = 50000;
      }

      autocompleteServiceRef.current.getPlacePredictions(
        request,
        (predictions, status) => {
          // Ignore stale responses from older keystrokes.
          if (
            requestId !== latestPlacesRequestRef.current ||
            querySnapshot !== searchQuery.trim()
          ) {
            return;
          }

          setIsSearchingPlaces(false);
          if (status === window.google.maps.places.PlacesServiceStatus.OK) {
            const trimmedPredictions = Array.isArray(predictions)
              ? predictions.slice(0, MAX_SUGGESTIONS)
              : [];
            setPlacePredictions(trimmedPredictions);
            placesCacheRef.current.set(cacheKey, {
              predictions: trimmedPredictions,
              expiresAt: Date.now() + CACHE_TTL_MS,
            });
            return;
          }
          if (
            status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS
          ) {
            setPlacePredictions([]);
            return;
          }
          setPlacePredictions([]);
          setPlacesError("Google search is temporarily unavailable");
        },
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [
    CACHE_TTL_MS,
    MAX_SUGGESTIONS,
    MIN_QUERY_LENGTH,
    SEARCH_DEBOUNCE_MS,
    currentLocation?.latitude,
    currentLocation?.longitude,
    getAutocompleteSessionToken,
    initGooglePlaces,
    isSearchFocused,
    isOpen,
    searchQuery,
  ]);


  // Saved addresses should remain static and not be part of Google search.
  const visibleSavedAddresses = savedAddresses;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[600]"
          />

          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            data-lenis-prevent
            style={{ overscrollBehavior: "contain" }}
            className="fixed bottom-0 left-0 right-0 sm:left-1/2 sm:-translate-x-1/2 sm:max-w-md bg-[#F8FAFC] rounded-t-[24px] sm:rounded-t-[28px] z-[610] max-h-[85vh] overflow-y-auto outline-none shadow-2xl pb-6 no-scrollbar">
            {/* Header */}
            <div className="sticky top-0 bg-[#F8FAFC]/95 backdrop-blur-md px-4 pt-4 pb-2.5 flex flex-col gap-2.5 z-20 border-b border-slate-200/60">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Select delivery location
                </h2>
                <button
                  onClick={onClose}
                  className="h-8 w-8 bg-slate-200/70 hover:bg-slate-200 rounded-full flex items-center justify-center transition-colors">
                  <X size={16} className="text-slate-700" />
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative group">
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <Search
                    size={16}
                    className="text-slate-400 group-focus-within:text-[#1A4516] transition-colors"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Search for area, street name.."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={async () => {
                    setIsSearchFocused(true);
                    await initGooglePlaces();
                  }}
                  onBlur={() => {
                    window.setTimeout(() => setIsSearchFocused(false), 120);
                  }}
                  className="w-full bg-white border border-slate-200/90 rounded-xl py-2 pl-9 pr-3 text-xs font-medium placeholder:text-slate-400 shadow-2xs focus:ring-2 focus:ring-[#1A4516]/20 focus:border-[#1A4516] transition-all outline-none"
                />
              </div>
              <p className="text-[10px] font-medium text-slate-400 px-1 -mt-1">
                Type at least 4 characters
              </p>
            </div>

            {/* Options List */}
            <div className="px-4 pt-2.5 flex flex-col gap-2">
              {searchQuery.trim().length >= MIN_QUERY_LENGTH && (
                <div className="bg-white rounded-xl shadow-xs border border-slate-200/80 overflow-hidden">
                  {isSearchingPlaces && placePredictions.length === 0 && (
                    <div className="px-3.5 py-2.5 text-xs font-medium text-slate-500">
                      Searching with Google...
                    </div>
                  )}

                  {placePredictions.map((prediction) => (
                    <button
                      key={prediction.place_id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectPlace(prediction)}
                      className="w-full px-3.5 py-2 text-left hover:bg-slate-50 border-b last:border-b-0 border-slate-100 transition-colors">
                      <div className="flex items-start gap-2.5">
                        <MapPin
                          size={14}
                          className="text-[#1A4516] mt-0.5 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">
                            {prediction.structured_formatting?.main_text ||
                              prediction.description}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {prediction.structured_formatting?.secondary_text ||
                              prediction.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}

                  {!isSearchingPlaces &&
                    placePredictions.length === 0 &&
                    !placesError && (
                      <div className="px-3.5 py-2.5 text-xs font-medium text-slate-500">
                        No locations found
                      </div>
                    )}

                  {placesError && (
                    <div className="px-3.5 py-2.5 text-xs font-medium text-amber-700 bg-amber-50">
                      {placesError}
                    </div>
                  )}
                </div>
              )}

              {/* Current Location */}
              <button
                type="button"
                data-lenis-prevent
                data-lenis-prevent-touch
                onClick={handleSelectCurrentLocation}
                className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/80 hover:bg-[#F5FBF5] hover:border-[#1A4516]/40 transition-colors group text-left shadow-2xs w-full">
                <div className="h-7 w-7 rounded-lg bg-[#F5FBF5] text-[#1A4516] flex items-center justify-center shrink-0 border border-[#1A4516]/10">
                  <MapPin
                    size={15}
                    className="group-hover:scale-110 transition-transform"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-[#1A4516] text-xs leading-none">
                    {isFetchingLocation
                      ? "Detecting..."
                      : "Use current location"}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                    {currentLocation.name}
                  </p>
                </div>
                <ChevronRight size={14} className="text-slate-300 shrink-0" />
              </button>

              {/* Add Address */}
              <button
                onClick={handleAddAddress}
                className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/80 hover:bg-[#F5FBF5] hover:border-[#1A4516]/40 transition-colors group text-left shadow-2xs">
                <div className="h-7 w-7 rounded-lg bg-[#F5FBF5] text-[#1A4516] flex items-center justify-center shrink-0 border border-[#1A4516]/10">
                  <Plus
                    size={15}
                    className="group-hover:rotate-90 transition-transform"
                  />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-[#1A4516] text-xs">
                    Add new address
                  </h3>
                </div>
                <ChevronRight size={14} className="text-slate-300 shrink-0" />
              </button>

              {/* Saved Addresses Section */}
              {visibleSavedAddresses.length > 0 && (
                <div className="mt-2">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">
                    Your saved addresses
                  </h4>

                  <div className="flex flex-col gap-2">
                    {visibleSavedAddresses.map((addr) => (
                      <div
                        key={addr.id}
                        onClick={() => handleSelectAddress(addr)}
                        className="bg-white p-2.5 rounded-xl shadow-2xs border border-slate-200/80 relative overflow-hidden group cursor-pointer hover:border-[#1A4516]/40 hover:shadow-xs transition-all">
                        <div className="flex items-start gap-2.5">
                          <div className="h-7 w-7 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center shrink-0 mt-0.5 border border-amber-100">
                            {addr.label === "Home" ? (
                              <Home
                                size={14}
                                fill="currentColor"
                                className="opacity-90"
                              />
                            ) : (
                              <MapPin
                                size={14}
                                fill="currentColor"
                                className="opacity-90"
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                                {addr.label}
                              </h3>
                              {(addr.address === currentLocation.name ||
                                addr.isCurrent) && (
                                <span className="text-[9px] bg-teal-50 text-teal-700 px-1.5 py-0.2 rounded font-bold uppercase tracking-tight border border-teal-100">
                                  You are here
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-600 font-medium leading-snug line-clamp-2">
                              {addr.address}
                            </p>
                            {addr.phone && (
                              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                                Phone: {addr.phone}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Selection Glow */}
                        {(addr.address === currentLocation.name ||
                          addr.isCurrent) && (
                          <div className="absolute top-0 right-0 h-0.5 w-16 bg-gradient-to-l from-[#1A4516] to-transparent opacity-60" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default LocationDrawer;

