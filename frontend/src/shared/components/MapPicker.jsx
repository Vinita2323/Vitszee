import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  Autocomplete,
} from "@react-google-maps/api";
import { Search, MapPin, Navigation, Loader2, Check } from "lucide-react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import Input from "./ui/Input";
import {
  normalizeGeocodedAddress,
  reverseGeocodeLatLng,
  getCurrentPosition,
} from "@/core/utils/addressUtils";

const libraries = ["places", "geometry"];
const mapContainerStyle = {
  width: "100%",
  height: "320px",
};

// Default center: Indore, MP (or India center if unspecified)
const defaultCenter = {
  lat: 22.7176,
  lng: 75.872,
};

const MapPicker = ({
  isOpen,
  onClose,
  onConfirm,
  initialLocation = null,
  initialRadius = 5,
  maxRadius = 50,
  showRadius = true,
  preferCurrentLocationOnOpen = false,
  title = "Select Location",
}) => {
  const [center, setCenter] = useState(
    initialLocation?.lat ? { lat: initialLocation.lat, lng: initialLocation.lng } : defaultCenter,
  );
  const [marker, setMarker] = useState(
    initialLocation?.lat ? { lat: initialLocation.lat, lng: initialLocation.lng } : null,
  );
  const [radius, setRadius] = useState(initialRadius);
  const [normalizedAddress, setNormalizedAddress] = useState(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState("");

  const mapRef = useRef(null);
  const autocompleteRef = useRef(null);
  const circleRef = useRef(null);
  const debounceTimerRef = useRef(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries,
  });

  const clearCircleOverlay = useCallback(() => {
    if (circleRef.current) {
      circleRef.current.setMap(null);
      circleRef.current = null;
    }
  }, []);

  const handleMapLoad = useCallback((mapInstance) => {
    mapRef.current = mapInstance;
  }, []);

  // Live reverse geocoding on position change
  const triggerReverseGeocode = useCallback((pos) => {
    if (!pos || typeof pos.lat !== "number" || typeof pos.lng !== "number") return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setIsGeocoding(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const result = await reverseGeocodeLatLng(pos.lat, pos.lng);
        setNormalizedAddress(result);
        if (result.formattedAddress) {
          setSearchInputValue(result.formattedAddress);
        }
      } catch (err) {
        console.warn("[MapPicker] Reverse geocode error:", err);
      } finally {
        setIsGeocoding(false);
      }
    }, 250);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    setRadius(initialRadius);

    if (initialLocation?.lat && initialLocation?.lng) {
      const pos = { lat: Number(initialLocation.lat), lng: Number(initialLocation.lng) };
      setCenter(pos);
      setMarker(pos);
      triggerReverseGeocode(pos);
    } else if (preferCurrentLocationOnOpen) {
      handleCurrentLocation();
    } else {
      setCenter(defaultCenter);
      setMarker(null);
      setNormalizedAddress(null);
      setSearchInputValue("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialLocation, initialRadius, preferCurrentLocationOnOpen]);

  const onMapClick = useCallback((e) => {
    if (!e.latLng) return;
    const newPos = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng(),
    };
    setMarker(newPos);
    triggerReverseGeocode(newPos);
  }, [triggerReverseGeocode]);

  const onMarkerDragEnd = useCallback((e) => {
    if (!e.latLng) return;
    const newPos = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng(),
    };
    setMarker(newPos);
    triggerReverseGeocode(newPos);
  }, [triggerReverseGeocode]);

  const handlePlaceChanged = () => {
    if (autocompleteRef.current) {
      const place = autocompleteRef.current.getPlace();
      if (place && place.geometry?.location) {
        const newPos = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        };
        setCenter(newPos);
        setMarker(newPos);
        if (mapRef.current) {
          mapRef.current.panTo(newPos);
          mapRef.current.setZoom(16);
        }

        const normalized = normalizeGeocodedAddress(place);
        if (normalized) {
          normalized.latitude = newPos.lat;
          normalized.longitude = newPos.lng;
          setNormalizedAddress(normalized);
          setSearchInputValue(normalized.formattedAddress);
        } else {
          triggerReverseGeocode(newPos);
        }
      }
    }
  };

  const handleCurrentLocation = async () => {
    setIsGeocoding(true);
    try {
      const pos = await getCurrentPosition();
      const coords = { lat: pos.latitude, lng: pos.longitude };
      setCenter(coords);
      setMarker(coords);
      if (mapRef.current) {
        mapRef.current.panTo(coords);
        mapRef.current.setZoom(17);
      }
      triggerReverseGeocode(coords);
    } catch (err) {
      alert(err.message || "Unable to retrieve your location.");
    } finally {
      setIsGeocoding(false);
    }
  };

  // Draw service radius circle on map if showRadius is enabled
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !window.google?.maps || !showRadius) {
      clearCircleOverlay();
      return;
    }

    clearCircleOverlay();

    if (!marker) return;

    circleRef.current = new window.google.maps.Circle({
      map: mapRef.current,
      center: marker,
      radius: radius * 1000,
      fillColor: "#1A8CFF",
      fillOpacity: 0.12,
      strokeColor: "#1A8CFF",
      strokeOpacity: 0.6,
      strokeWeight: 2,
      clickable: false,
      editable: false,
      zIndex: 1,
    });

    return () => {
      clearCircleOverlay();
    };
  }, [isLoaded, marker, radius, showRadius, clearCircleOverlay]);

  const handleConfirm = () => {
    if (!marker) {
      alert("Please select a location on the map.");
      return;
    }

    const payload = {
      lat: marker.lat,
      lng: marker.lng,
      latitude: marker.lat,
      longitude: marker.lng,
      radius: showRadius ? radius : undefined,
      address: normalizedAddress?.formattedAddress || searchInputValue || `Location (${marker.lat.toFixed(5)}, ${marker.lng.toFixed(5)})`,
      formattedAddress: normalizedAddress?.formattedAddress || searchInputValue || "",
      building: normalizedAddress?.building || "",
      houseNumber: normalizedAddress?.houseNumber || "",
      buildingName: normalizedAddress?.buildingName || "",
      street: normalizedAddress?.street || "",
      road: normalizedAddress?.road || "",
      area: normalizedAddress?.area || "",
      locality: normalizedAddress?.locality || "",
      subLocality: normalizedAddress?.subLocality || "",
      landmark: normalizedAddress?.landmark || "",
      city: normalizedAddress?.city || "Indore",
      district: normalizedAddress?.district || "Indore",
      state: normalizedAddress?.state || "Madhya Pradesh",
      stateCode: normalizedAddress?.stateCode || "MP",
      country: normalizedAddress?.country || "India",
      countryCode: normalizedAddress?.countryCode || "IN",
      pincode: normalizedAddress?.pincode || "",
      placeId: normalizedAddress?.placeId || "",
    };

    onConfirm(payload);
    onClose();
  };

  if (loadError) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={title}>
        <div className="p-8 text-center text-red-500">
          Failed to load Google Maps. Please check your API key and connection.
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <div className="flex justify-between w-full items-center">
          <div className="text-xs text-slate-500 font-mono">
            {marker
              ? `📍 ${marker.lat.toFixed(5)}, ${marker.lng.toFixed(5)}`
              : "Click on map to place pin"}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={!marker || isGeocoding}
              className="h-8 text-xs bg-[#1A4516] hover:bg-[#0a3000] text-white flex items-center gap-1.5 px-4"
            >
              {isGeocoding ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Confirm Location
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Search Bar & GPS Button */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            {isLoaded && (
              <Autocomplete
                onLoad={(ref) => (autocompleteRef.current = ref)}
                onPlaceChanged={handlePlaceChanged}
                options={{
                  componentRestrictions: { country: "IN" },
                  fields: ["geometry", "formatted_address", "address_components", "name"],
                }}
              >
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input
                    placeholder="Search area, landmark, street name..."
                    value={searchInputValue}
                    onChange={(e) => setSearchInputValue(e.target.value)}
                    className="pl-9 h-9 text-xs"
                  />
                </div>
              </Autocomplete>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleCurrentLocation}
            title="Use current GPS location"
            className="h-9 w-9 shrink-0 text-[#1A4516] border-[#1A4516]/30 hover:bg-[#F5FBF5]"
          >
            <Navigation className="w-4 h-4" />
          </Button>
        </div>

        {/* Interactive Google Map Container */}
        <div className="rounded-xl overflow-hidden border border-slate-200 shadow-inner relative">
          {!isLoaded ? (
            <div className="h-[320px] flex items-center justify-center bg-slate-50">
              <Loader2 className="w-7 h-7 animate-spin text-[#1A4516]" />
            </div>
          ) : (
            <GoogleMap
              onLoad={handleMapLoad}
              mapContainerStyle={mapContainerStyle}
              center={center}
              zoom={15}
              onClick={onMapClick}
              options={{
                disableDefaultUI: true,
                zoomControl: true,
                streetViewControl: false,
                mapTypeControl: false,
                fullscreenControl: false,
              }}
            >
              {marker && (
                <Marker
                  key={`${marker.lat.toFixed(6)}-${marker.lng.toFixed(6)}`}
                  position={marker}
                  draggable={true}
                  onDragEnd={onMarkerDragEnd}
                />
              )}
            </GoogleMap>
          )}
        </div>

        {/* Selected Address Preview */}
        {marker && (
          <div className="p-2.5 bg-[#F8FAFC] rounded-xl border border-slate-200/80 space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 flex items-center gap-1 text-[11px] uppercase tracking-wide">
                <MapPin size={13} className="text-[#1A4516]" /> Detected Address
              </span>
              {isGeocoding && (
                <span className="text-[10px] text-[#1A4516] font-semibold animate-pulse">
                  Detecting details...
                </span>
              )}
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed line-clamp-2">
              {normalizedAddress?.formattedAddress || "Coordinates selected. Confirm to apply."}
            </p>
            {normalizedAddress && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400 font-medium pt-1 border-t border-slate-200/60">
                {normalizedAddress.area && <span>Area: <strong className="text-slate-600">{normalizedAddress.area}</strong></span>}
                {normalizedAddress.city && <span>City: <strong className="text-slate-600">{normalizedAddress.city}</strong></span>}
                {normalizedAddress.state && <span>State: <strong className="text-slate-600">{normalizedAddress.state}</strong></span>}
                {normalizedAddress.pincode && <span>PIN: <strong className="text-slate-600">{normalizedAddress.pincode}</strong></span>}
              </div>
            )}
          </div>
        )}

        {/* Service Radius Slider (if showRadius enabled) */}
        {showRadius && (
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <label className="font-semibold text-slate-700">
                Active Service Coverage Radius
              </label>
              <span className="font-bold text-[#1A8CFF] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                {radius} km
              </span>
            </div>
            <input
              type="range"
              min="1"
              max={maxRadius}
              step="1"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1A8CFF]"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>1 km</span>
              <span>{maxRadius} km</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default MapPicker;
