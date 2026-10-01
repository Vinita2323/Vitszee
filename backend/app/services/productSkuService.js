import { slugify } from "../utils/slugify.js";

export const SKU_ALREADY_EXISTS_MESSAGE =
  "SKU already exists. Please enter a different SKU.";

export class SkuConflictError extends Error {
  constructor(message = SKU_ALREADY_EXISTS_MESSAGE) {
    super(message);
    this.name = "SkuConflictError";
    this.statusCode = 400;
  }
}

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function skuBaseFromName(name) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "item";
}

export function normalizeManualSku(value) {
  return String(value ?? "").trim();
}

function duplicateField(error) {
  if (error?.keyPattern) return Object.keys(error.keyPattern)[0] || "";
  const message = String(error?.message || "");
  if (/\bsku/i.test(message)) return "sku";
  if (/\bslug/i.test(message)) return "slug";
  return "";
}

async function loadMatchingDocs(ProductModel, filter) {
  const query = ProductModel.find(filter);
  if (query && typeof query.select === "function") {
    const selected = query.select("sku slug");
    return typeof selected.lean === "function" ? selected.lean() : selected;
  }
  return query;
}

export async function allocateNextSku(ProductModel, name, excludeId) {
  const base = skuBaseFromName(name);
  const pattern = new RegExp(`^${escapeRegex(base)}-\\d+$`, "i");
  const filter = { sku: pattern };
  if (excludeId) filter._id = { $ne: excludeId };
  const docs = await loadMatchingDocs(ProductModel, filter);
  let max = 0;
  for (const doc of docs || []) {
    const match = String(doc?.sku || "").match(/-(\d+)$/);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return `${base}-${String(max + 1).padStart(3, "0")}`;
}

async function allocateNextSlug(ProductModel, base) {
  const root = base || "item";
  const pattern = new RegExp(`^${escapeRegex(root)}(?:-\\d+)?$`, "i");
  const docs = await loadMatchingDocs(ProductModel, { slug: pattern });
  const taken = new Set((docs || []).map((doc) => String(doc?.slug || "").toLowerCase()));
  if (!taken.has(root)) return root;
  for (let n = 2; n < 10000; n += 1) {
    const candidate = `${root}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}

export async function assertSkuAvailable(ProductModel, sku, excludeId) {
  const filter = { sku: new RegExp(`^${escapeRegex(sku)}$`, "i") };
  if (excludeId) filter._id = { $ne: excludeId };
  const existing = await ProductModel.exists(filter);
  if (existing) throw new SkuConflictError();
}

export function resolveSkuForUpdate(currentSku, incomingSku) {
  const current = normalizeManualSku(currentSku);
  const incoming = normalizeManualSku(incomingSku);
  if (!incoming || incoming === current) {
    return { sku: current, changed: false };
  }
  return { sku: incoming, changed: true };
}

function variantCodeBase(productSku) {
  const trimmed = normalizeManualSku(productSku);
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(trimmed)) return trimmed;
  return skuBaseFromName(trimmed);
}

export function assignVariantSkus(variants, productSku) {
  if (!Array.isArray(variants)) return variants;
  const codeBase = variantCodeBase(productSku);
  const productKey = normalizeManualSku(productSku).toLowerCase();
  const used = new Set(productKey ? [productKey] : []);

  return variants.map((variant, index) => {
    const current = normalizeManualSku(variant?.sku);
    const key = current.toLowerCase();
    if (current && !used.has(key)) {
      used.add(key);
      return { ...variant, sku: current };
    }

    let sequence = index + 1;
    let candidate = `${codeBase}-v${String(sequence).padStart(3, "0")}`;
    while (used.has(candidate.toLowerCase())) {
      sequence += 1;
      candidate = `${codeBase}-v${String(sequence).padStart(3, "0")}`;
    }
    used.add(candidate.toLowerCase());
    return { ...variant, sku: candidate };
  });
}

export function fillMissingVariantSkus(variants, productSku) {
  if (!Array.isArray(variants)) return variants;
  const codeBase = variantCodeBase(productSku);
  const used = new Set(
    [normalizeManualSku(productSku).toLowerCase()].filter(Boolean),
  );
  for (const variant of variants) {
    const current = normalizeManualSku(variant?.sku).toLowerCase();
    if (current) used.add(current);
  }

  return variants.map((variant, index) => {
    const current = normalizeManualSku(variant?.sku);
    if (current) return { ...variant, sku: current };

    let sequence = index + 1;
    let candidate = `${codeBase}-v${String(sequence).padStart(3, "0")}`;
    while (used.has(candidate.toLowerCase())) {
      sequence += 1;
      candidate = `${codeBase}-v${String(sequence).padStart(3, "0")}`;
    }
    used.add(candidate.toLowerCase());
    return { ...variant, sku: candidate };
  });
}

export async function insertUniqueProduct(ProductModel, productData) {
  const manualSku = normalizeManualSku(productData.sku);
  const autoSku = !manualSku;
  const fromName = slugify(productData.name) || "item";
  const requestedSlug = slugify(productData.slug || "") || fromName;
  const autoSlug = !normalizeManualSku(productData.slug) || requestedSlug === fromName;
  const rawVariants = productData.variants;

  if (!autoSku) {
    await assertSkuAvailable(ProductModel, manualSku);
  }

  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const sku = autoSku ? await allocateNextSku(ProductModel, productData.name) : manualSku;
    const slug = autoSlug ? await allocateNextSlug(ProductModel, fromName) : requestedSlug;
    try {
      return await ProductModel.create({
        ...productData,
        sku,
        slug,
        variants: assignVariantSkus(rawVariants, sku),
      });
    } catch (error) {
      const field = duplicateField(error);
      if (error?.code === 11000 && field === "sku") {
        if (!autoSku) throw new SkuConflictError();
        lastError = error;
        continue;
      }
      if (error?.code === 11000 && field === "slug" && autoSlug) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error("Could not allocate a unique SKU");
}
