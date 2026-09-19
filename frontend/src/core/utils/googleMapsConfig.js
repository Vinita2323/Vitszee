/**
 * Unified Google Maps JS API loader configuration.
 * @react-google-maps/api strictly requires that all instances of useJsApiLoader / useLoadScript
 * share the exact same id and libraries array throughout the entire application lifecycle.
 */

export const GOOGLE_MAPS_LIBRARIES = Object.freeze(["places", "geometry"]);
export const GOOGLE_MAPS_SCRIPT_ID = "google-map-script";
