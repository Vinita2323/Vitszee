const DEFAULT_API_PORT = "7000";
const DEFAULT_API_PATH = "/api";

function normalizeOrigin(origin) {
  return origin.replace(/\/+$/, "");
}

function ensureApiPath(pathname) {
  if (!pathname || pathname === "/") return DEFAULT_API_PATH;
  return pathname.endsWith("/api") ? pathname : `${pathname.replace(/\/+$/, "")}/api`;
}

function buildLocalApiUrl(hostname) {
  const protocol = window.location.protocol || "http:";
  return `${protocol}//${hostname}:${DEFAULT_API_PORT}${DEFAULT_API_PATH}`;
}

function parseEnvUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    return `${normalizeOrigin(parsed.origin)}${ensureApiPath(parsed.pathname)}`;
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function resolveApiBaseUrl() {
  const envUrl =
    parseEnvUrl(import.meta.env.VITE_API_URL) ||
    parseEnvUrl(import.meta.env.VITE_API_BASE_URL);

  const browserHostname = window.location.hostname || "localhost";
  if (!envUrl) {
    return buildLocalApiUrl(browserHostname);
  }

  try {
    const parsed = new URL(envUrl);
    // When the page is opened from a phone/LAN IP (e.g. http://192.168.x.x:5174)
    // but VITE_API_URL still points at localhost, rewrite the API host so the
    // phone talks to the PC instead of itself.
    if (!isLoopbackHost(browserHostname) && isLoopbackHost(parsed.hostname)) {
      parsed.hostname = browserHostname;
    }
    return `${normalizeOrigin(parsed.origin)}${ensureApiPath(parsed.pathname)}`;
  } catch {
    return buildLocalApiUrl(browserHostname);
  }
}

export function resolveSocketBaseUrl() {
  const explicitSocketUrl = parseEnvUrl(import.meta.env.VITE_SOCKET_URL);
  if (explicitSocketUrl) {
    return explicitSocketUrl.replace(/\/api$/, "");
  }
  return resolveApiBaseUrl().replace(/\/api$/, "");
}
