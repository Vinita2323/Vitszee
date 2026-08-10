const CLOUDINARY_REGEX = /res\.cloudinary\.com/i;
const CLOUDINARY_UPLOAD_SEGMENT_REGEX = /\/upload\/([^/]+)\//i;

export const DEFAULT_CATEGORY_IMAGE = "https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&auto=format&fit=crop&q=80";
export const DEFAULT_PRODUCT_IMAGE = "https://images.unsplash.com/photo-1588964895597-cfccd6e2dbf9?w=300&auto=format&fit=crop&q=80";
export const DEFAULT_BANNER_IMAGE = "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=80";

export function handleImageError(e, fallbackUrl = DEFAULT_CATEGORY_IMAGE) {
  if (e?.target && e.target.src !== fallbackUrl) {
    e.target.onerror = null;
    e.target.src = fallbackUrl;
  }
}

/**
 * Appends Cloudinary optimisation transforms to a URL.
 * Safe to call on any URL — non-Cloudinary URLs are returned unchanged.
 */
export function applyCloudinaryTransform(url, params = "f_auto,q_auto,w_400,dpr_auto") {
  if (!url || !CLOUDINARY_REGEX.test(url)) return url;
  const match = url.match(CLOUDINARY_UPLOAD_SEGMENT_REGEX);
  if (!match) return url;

  const segmentAfterUpload = match[1] || "";
  const alreadyHasTransforms =
    segmentAfterUpload.includes(",") ||
    /^[a-z]{1,4}_[^/]+$/i.test(segmentAfterUpload);

  if (alreadyHasTransforms) return url;

  // Insert transform before the segment after `/upload/` (often `v123...`).
  return url.replace(CLOUDINARY_UPLOAD_SEGMENT_REGEX, `/upload/${params}/$1/`);
}

export function isCloudinaryUrl(url) {
  return !!url && CLOUDINARY_REGEX.test(url);
}

export function buildCloudinarySrcSet(
  url,
  entries,
  baseParams = "f_auto,q_auto,c_fill,g_auto",
) {
  if (!isCloudinaryUrl(url) || !Array.isArray(entries) || entries.length === 0)
    return undefined;

  return entries
    .map(({ w, h }) => {
      const params = [
        baseParams,
        typeof w === "number" ? `w_${w}` : null,
        typeof h === "number" ? `h_${h}` : null,
      ]
        .filter(Boolean)
        .join(",");

      const href = applyCloudinaryTransform(url, params) || url;
      const descriptor = typeof w === "number" ? `${w}w` : "";
      return descriptor ? `${href} ${descriptor}` : href;
    })
    .join(", ");
}
