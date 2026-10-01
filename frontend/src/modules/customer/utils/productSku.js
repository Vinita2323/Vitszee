export function isCodeSku(value) {
  const text = String(value || "").trim();
  return Boolean(text) && !/\s/.test(text) && /^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(text);
}

export function buildDisplaySku(product) {
  const stored = String(product?.sku || "").trim();
  if (isCodeSku(stored)) return stored.toUpperCase();

  const prefix =
    String(product?.name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 5) || "item";
  const id = String(product?._id || product?.id || "").replace(/[^a-z0-9]/gi, "");
  const suffix = (id.slice(-4) || "001").toUpperCase();
  return `${prefix.toUpperCase()}-${suffix}`;
}

export function productSkuPath(product) {
  const id = product?._id || product?.id;
  const sku = buildDisplaySku(product);
  if (!sku) return id ? `/product/${id}` : "/";
  return `/products/${encodeURIComponent(sku.toLowerCase())}`;
}
