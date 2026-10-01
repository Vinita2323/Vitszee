import {
  SkuConflictError,
  allocateNextSku,
  assignVariantSkus,
  fillMissingVariantSkus,
  insertUniqueProduct,
  resolveSkuForUpdate,
  skuBaseFromName,
} from "../app/services/productSkuService.js";

function matches(doc, filter = {}) {
  if (filter._id?.$ne && String(doc._id) === String(filter._id.$ne)) return false;
  if (filter.sku instanceof RegExp && !filter.sku.test(String(doc.sku || ""))) return false;
  if (typeof filter.sku === "string" && doc.sku !== filter.sku) return false;
  if (filter.slug instanceof RegExp && !filter.slug.test(String(doc.slug || ""))) return false;
  if (typeof filter.slug === "string" && doc.slug !== filter.slug) return false;
  return true;
}

function duplicateError(field) {
  const error = new Error(`E11000 duplicate key ${field}`);
  error.code = 11000;
  error.keyPattern = { [field]: 1 };
  return error;
}

function createMemoryCatalog(seed = [], { findDelayMs = 0 } = {}) {
  const docs = seed.map((item, index) => ({ _id: item._id || `id-${index + 1}`, ...item }));
  return {
    docs,
    async find(filter) {
      if (findDelayMs) await new Promise((resolve) => setTimeout(resolve, findDelayMs));
      return docs.filter((doc) => matches(doc, filter));
    },
    async exists(filter) {
      const found = docs.find((doc) => matches(doc, filter));
      return found ? { _id: found._id } : null;
    },
    async create(data) {
      if (docs.some((doc) => doc.sku === data.sku)) throw duplicateError("sku");
      if (docs.some((doc) => doc.slug === data.slug)) throw duplicateError("slug");
      const doc = { _id: `id-${docs.length + 1}`, ...data };
      docs.push(doc);
      return doc;
    },
  };
}

const baseProduct = {
  name: "Mouse",
  price: 100,
  stock: 1,
  headerId: "h1",
  categoryId: "c1",
  sellerId: "s1",
  variants: [{ name: "1 pack", price: 100, stock: 1, sku: "" }],
};

describe("product SKU generation", () => {
  test("builds a full-name base and strips special characters", () => {
    expect(skuBaseFromName("Mouse")).toBe("mouse");
    expect(skuBaseFromName("Wireless Mouse")).toBe("wireless-mouse");
    expect(skuBaseFromName("Floor Cleaner")).toBe("floor-cleaner");
    expect(skuBaseFromName("Floor Cleaner 5L")).toBe("floor-cleaner-5l");
    expect(skuBaseFromName("Men's Face Wash")).toBe("mens-face-wash");
    expect(skuBaseFromName("Nivea Body Lotion 200 ML")).toBe("nivea-body-lotion-200-ml");
    expect(skuBaseFromName("  Herbal   Body Wax Powder!! ")).toBe("herbal-body-wax-powder");
  });

  test("numbers each product name separately and increments repeats", async () => {
    const catalog = createMemoryCatalog();

    const mouse = await insertUniqueProduct(catalog, { ...baseProduct, name: "Mouse", variants: [] });
    const mouseAgain = await insertUniqueProduct(catalog, { ...baseProduct, name: "Mouse", variants: [] });
    const wireless = await insertUniqueProduct(catalog, { ...baseProduct, name: "Wireless Mouse", variants: [] });
    const cleaner = await insertUniqueProduct(catalog, { ...baseProduct, name: "Floor Cleaner", variants: [] });
    const cleanerAgain = await insertUniqueProduct(catalog, { ...baseProduct, name: "Floor Cleaner", variants: [] });

    expect(mouse.sku).toBe("mouse-001");
    expect(mouseAgain.sku).toBe("mouse-002");
    expect(wireless.sku).toBe("wireless-mouse-001");
    expect(cleaner.sku).toBe("floor-cleaner-001");
    expect(cleanerAgain.sku).toBe("floor-cleaner-002");
    expect(mouse.slug).toBe("mouse");
    expect(mouseAgain.slug).toBe("mouse-2");
  });

  test("keeps a unique manual SKU and rejects a duplicate", async () => {
    const catalog = createMemoryCatalog();
    const custom = await insertUniqueProduct(catalog, {
      ...baseProduct,
      name: "Mouse",
      sku: "Desk-Mouse",
      variants: [],
    });
    expect(custom.sku).toBe("Desk-Mouse");

    await expect(
      insertUniqueProduct(catalog, {
        ...baseProduct,
        name: "Another Mouse",
        sku: "desk-mouse",
        variants: [],
      }),
    ).rejects.toBeInstanceOf(SkuConflictError);
    expect(catalog.docs).toHaveLength(1);
  });

  test("keeps the stored SKU on edit unless it is explicitly changed", () => {
    expect(resolveSkuForUpdate("mouse-001", "")).toEqual({ sku: "mouse-001", changed: false });
    expect(resolveSkuForUpdate("mouse-001", "mouse-001")).toEqual({ sku: "mouse-001", changed: false });
    expect(resolveSkuForUpdate("vitszeecare floor cleaner", "vitszeecare floor cleaner")).toEqual({
      sku: "vitszeecare floor cleaner",
      changed: false,
    });
    expect(resolveSkuForUpdate("mouse-001", "custom-sku")).toEqual({ sku: "custom-sku", changed: true });
  });

  test("does not copy the product SKU onto every variant", () => {
    const variants = assignVariantSkus(
      [
        { name: "Red", sku: "" },
        { name: "Blue", sku: "" },
        { name: "Custom", sku: "special-blue" },
      ],
      "wireless-mouse-001",
    );
    expect(variants.map((variant) => variant.sku)).toEqual([
      "wireless-mouse-001-v001",
      "wireless-mouse-001-v002",
      "special-blue",
    ]);
    expect(new Set(variants.map((variant) => variant.sku)).size).toBe(3);
  });

  test("fills only blank variant SKUs during an update", () => {
    const variants = fillMissingVariantSkus(
      [
        { name: "Old", sku: "mouse-001" },
        { name: "New", sku: "" },
      ],
      "mouse-001",
    );
    expect(variants[0].sku).toBe("mouse-001");
    expect(variants[1].sku).toBe("mouse-001-v002");
  });

  test("two creates at the same time receive different SKUs", async () => {
    const catalog = createMemoryCatalog([], { findDelayMs: 30 });
    const [first, second] = await Promise.all([
      insertUniqueProduct(catalog, { ...baseProduct, name: "Gaming Mouse", variants: [] }),
      insertUniqueProduct(catalog, { ...baseProduct, name: "Gaming Mouse", variants: [] }),
    ]);
    const skus = [first.sku, second.sku].sort();
    expect(skus).toEqual(["gaming-mouse-001", "gaming-mouse-002"]);
    expect(new Set(catalog.docs.map((doc) => doc.sku)).size).toBe(2);
  });

  test("preview uses the next free sequence for that full name", async () => {
    const catalog = createMemoryCatalog([{ sku: "herbal-body-wax-powder-001", slug: "herbal-body-wax-powder" }]);
    await expect(allocateNextSku(catalog, "Herbal Body Wax Powder")).resolves.toBe(
      "herbal-body-wax-powder-002",
    );
  });
});
