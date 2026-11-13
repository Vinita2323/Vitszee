import { jest } from "@jest/globals";

// Mocked Delhivery responses only: no network, no DB.
const mockProductFind = jest.fn();
const mockCategoryFind = jest.fn();
const mockSellerFindById = jest.fn();
const mockFinanceSettings = jest.fn();
const mockDelhiveryConfig = jest.fn();
const mockLocalConfig = jest.fn();
const mockServiceability = jest.fn();
const mockRateQuote = jest.fn();
const mockComputeOrderDiscount = jest.fn();
const mockGetCachedRoute = jest.fn();

const chain = (result) => {
  const c = { select: jest.fn().mockReturnThis(), lean: jest.fn(), session: jest.fn().mockReturnThis() };
  c.lean.mockImplementation(() => {
    const p = Promise.resolve(result);
    p.session = () => p;
    return p;
  });
  return c;
};

jest.unstable_mockModule("../app/models/product.js", () => ({ default: { find: mockProductFind } }));
jest.unstable_mockModule("../app/models/category.js", () => ({ default: { find: mockCategoryFind } }));
jest.unstable_mockModule("../app/models/seller.js", () => ({ default: { findById: mockSellerFindById } }));
jest.unstable_mockModule("../app/services/finance/financeSettingsService.js", () => ({
  getOrCreateFinanceSettings: mockFinanceSettings,
}));
jest.unstable_mockModule("../app/services/delhivery/delhiveryConfig.js", () => ({
  getDelhiveryConfig: mockDelhiveryConfig,
}));
jest.unstable_mockModule("../app/services/delhiveryLocal/delhiveryLocalConfig.js", () => ({
  getDelhiveryLocalConfig: mockLocalConfig,
}));
// In-city = both pincodes in the 380xxx block (mirrors the default Ahmedabad gate).
jest.unstable_mockModule("../app/services/delhiveryLocal/delhiveryLocalRouting.js", () => ({
  dropPincode: (order = {}) => {
    const a = order.address || {};
    const pin = String(a.pincode || "").trim();
    if (/^\d{6}$/.test(pin)) return pin;
    const m = `${a.fullAddress || ""} ${a.address || ""} ${a.city || ""}`.match(/\b\d{6}\b/);
    return m ? m[0] : "";
  },
  evaluateLocalEligibility: ({ seller, address }) => {
    const sp = String(seller?.pincode || "");
    const cp = String(address?.pincode || "");
    const eligible = sp.startsWith("380") && cp.startsWith("380");
    return { eligible, sellerOk: sp.startsWith("380"), customerOk: cp.startsWith("380"), reason: "mock" };
  },
}));
jest.unstable_mockModule("../app/services/delhivery/delhiveryForwardService.js", () => ({
  checkForwardServiceability: mockServiceability,
  getForwardRateQuote: mockRateQuote,
}));
jest.unstable_mockModule("../app/services/finance/couponService.js", () => ({
  computeOrderDiscount: mockComputeOrderDiscount,
}));
jest.unstable_mockModule("../app/services/mapsRouteService.js", () => ({
  getCachedRoute: mockGetCachedRoute,
}));
jest.unstable_mockModule("../app/services/deliveryEstimate.js", () => ({
  resolveDeliveryEstimateForSellers: jest.fn().mockResolvedValue(null),
}));

const { buildCheckoutPricingSnapshot } = await import("../app/services/checkoutPricingService.js");
const courier = await import("../app/services/finance/courierPricingService.js");

const SETTINGS = {
  deliveryPricingMode: "distance_based",
  customerBaseDeliveryFee: 40,
  baseDistanceCapacityKm: 0,
  incrementalKmSurcharge: 5,
  riderBasePayout: 30,
  deliveryPartnerRatePerKm: 4,
  fixedDeliveryFee: 40,
  handlingFeeStrategy: "highest_category_fee",
};

const AHMEDABAD_SELLER = { _id: "s1", pincode: "380001", city: "Ahmedabad" };
const MUMBAI_ADDRESS = { address: "Andheri", city: "Mumbai", pincode: "400001" };
const AHMEDABAD_ADDRESS = { address: "Satellite", city: "Ahmedabad", pincode: "380015" };

function product(id, sellerId, extra = {}) {
  return {
    _id: id,
    name: `P-${id}`,
    salePrice: 0,
    price: 249,
    mainImage: "",
    headerId: "h1",
    sellerId,
    status: "active",
    approvalStatus: "approved",
    variants: [],
    ...extra,
  };
}

function setup({ products, sellers = { s1: AHMEDABAD_SELLER }, local = {}, shippingMode = "Surface" } = {}) {
  mockProductFind.mockReturnValue(chain(products));
  mockCategoryFind.mockReturnValue(
    chain([
      {
        _id: "h1",
        name: "H1",
        adminCommissionType: "percentage",
        adminCommissionValue: 0,
        adminCommissionFixedRule: "per_qty",
        handlingFeeType: "fixed",
        handlingFeeValue: 10,
        handlingFees: 10,
      },
    ]),
  );
  mockSellerFindById.mockImplementation((id) => chain(sellers[String(id)] || null));
  mockFinanceSettings.mockResolvedValue(SETTINGS);
  mockDelhiveryConfig.mockResolvedValue({ forwardEnabled: true, defaultWeightGrams: 500, shippingMode });
  mockLocalConfig.mockResolvedValue({ enabled: false, hasCredentials: false, ...local });
  mockServiceability.mockResolvedValue({ serviceable: true, reason: null, data: {} });
  mockComputeOrderDiscount.mockResolvedValue(null);
  mockGetCachedRoute.mockResolvedValue({ distanceMeters: 3000, degraded: false });
  mockRateQuote.mockImplementation(async ({ paymentType, codAmount, shippingMode: mode }) => ({
    provider: "delhivery",
    amount: paymentType === "COD" ? 127.2 : 59.14,
    shippingMode: String(mode).toLowerCase().startsWith("e") ? "Express" : "Surface",
    paymentType,
    zone: "D",
    chargedWeight: 500,
    breakdown: { chargeDL: 50, chargeCOD: paymentType === "COD" ? 40 : 0, grossAmount: 50, totalAmount: 59.14 },
  }));
}

const snap = (over = {}) =>
  buildCheckoutPricingSnapshot({
    orderItems: [{ product: "p1", quantity: 1 }],
    address: MUMBAI_ADDRESS,
    paymentMode: "ONLINE",
    session: null,
    ...over,
  });

describe("courier shipping pricing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    courier.clearCourierQuoteCache();
  });

  it("1. local COD in-city keeps the local per-km fee and never calls Delhivery rates", async () => {
    setup({ products: [product("p1", "s1")] });
    const s = await snap({ address: { ...AHMEDABAD_ADDRESS, location: { lat: 23.0, lng: 72.5 } }, paymentMode: "COD" });
    // sellers without coordinates -> distance 0 -> base fee only, exactly as before
    expect(s.aggregateBreakdown.deliveryFeeCharged).toBe(40);
    expect(s.sellerBreakdownEntries[0].lane).toBe("internal");
    expect(s.sellerBreakdownEntries[0].breakdown.riderPayoutBase).toBe(30);
    expect(mockRateQuote).not.toHaveBeenCalled();
  });

  it("2. local prepaid (quick lane) keeps the local fee and rider payout", async () => {
    setup({ products: [product("p1", "s1")], local: { enabled: true, hasCredentials: true } });
    const s = await snap({ address: AHMEDABAD_ADDRESS, paymentMode: "ONLINE" });
    expect(s.sellerBreakdownEntries[0].lane).toBe("quick");
    expect(s.aggregateBreakdown.deliveryFeeCharged).toBe(40);
    expect(s.sellerBreakdownEntries[0].breakdown.riderPayoutTotal).toBeGreaterThan(0);
    expect(mockRateQuote).not.toHaveBeenCalled();
  });

  it("3. Ahmedabad to Mumbai prepaid uses the real Delhivery quote, not the per-km formula", async () => {
    setup({ products: [product("p1", "s1")] });
    const s = await snap({ paymentMode: "ONLINE" });
    const b = s.sellerBreakdownEntries[0].breakdown;
    expect(s.sellerBreakdownEntries[0].lane).toBe("courier");
    expect(b.deliveryFeeCharged).toBe(59.14);
    expect(b.deliveryFeeCharged).toBeLessThan(500);
    expect(b.grandTotal).toBe(249 + 59.14 + 10);
    expect(mockRateQuote).toHaveBeenCalledTimes(1);
    expect(mockRateQuote.mock.calls[0][0]).toMatchObject({ paymentType: "Pre-paid", pickupPincode: "380001", deliveryPincode: "400001" });
  });

  it("4. courier COD includes the COD charge (quoted with the collectable amount incl. shipping)", async () => {
    setup({ products: [product("p1", "s1")] });
    const s = await snap({ paymentMode: "COD" });
    expect(s.sellerBreakdownEntries[0].breakdown.deliveryFeeCharged).toBe(127.2);
    expect(mockRateQuote).toHaveBeenCalledTimes(2);
    expect(mockRateQuote.mock.calls[0][0].paymentType).toBe("COD");
    expect(mockRateQuote.mock.calls[1][0].codAmount).toBe(Math.round(249 + 127.2));
  });

  it("5. Express shipping mode is sent to the quote API", async () => {
    setup({ products: [product("p1", "s1")], shippingMode: "Express" });
    const s = await snap();
    expect(mockRateQuote.mock.calls[0][0].shippingMode).toBe("Express");
    expect(s.sellerBreakdownEntries[0].breakdown.snapshots.courierQuote.shippingMode).toBe("Express");
  });

  it("6. Surface shipping mode is sent to the quote API", async () => {
    setup({ products: [product("p1", "s1")], shippingMode: "Surface" });
    const s = await snap();
    expect(mockRateQuote.mock.calls[0][0].shippingMode).toBe("Surface");
    expect(s.sellerBreakdownEntries[0].breakdown.snapshots.courierQuote.shippingMode).toBe("Surface");
  });

  it("7. missing product weight falls back to the configured default (500 g)", async () => {
    setup({ products: [product("p1", "s1")] });
    await snap();
    expect(mockRateQuote.mock.calls[0][0].weightGrams).toBe(500);
  });

  it("8. weight text parses g, gm, grams, kg and kilograms (invalid -> null)", () => {
    const p = courier.parseWeightToGrams;
    expect(p("250 g")).toBe(250);
    expect(p("250gm")).toBe(250);
    expect(p("750 grams")).toBe(750);
    expect(p("1.5 kg")).toBe(1500);
    expect(p("2 Kilograms")).toBe(2000);
    expect(p("heavy")).toBeNull();
    expect(p("0 g")).toBeNull();
    expect(p("")).toBeNull();
  });

  it("9. quantity multiplies the parsed weight", async () => {
    setup({ products: [product("p1", "s1", { weight: "1.5 kg" })] });
    await snap({ orderItems: [{ product: "p1", quantity: 3 }] });
    expect(mockRateQuote.mock.calls[0][0].weightGrams).toBe(4500);
  });

  it("10. multi-seller carts get a separate weight, pincode and quote per seller", async () => {
    setup({
      products: [
        product("p1", "s1", { weight: "500 g" }),
        product("p2", "s2", { weight: "2 kg" }),
      ],
      sellers: { s1: AHMEDABAD_SELLER, s2: { _id: "s2", pincode: "560001", city: "Bengaluru" } },
    });
    const s = await snap({ orderItems: [{ product: "p1", quantity: 1 }, { product: "p2", quantity: 1 }] });
    expect(mockRateQuote).toHaveBeenCalledTimes(2);
    const calls = mockRateQuote.mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.pickupPincode === "380001").weightGrams).toBe(500);
    expect(calls.find((c) => c.pickupPincode === "560001").weightGrams).toBe(2000);
    expect(s.sellerBreakdownEntries).toHaveLength(2);
  });

  it("11. Delhivery API failure returns a checkout error with NO fallback fee", async () => {
    setup({ products: [product("p1", "s1")] });
    mockRateQuote.mockRejectedValue(new Error("Delhivery down"));
    await expect(snap()).rejects.toMatchObject({ statusCode: 502, code: "COURIER_QUOTE_FAILED" });
  });

  it("12. invalid or missing delivery pincode is rejected before any quote", async () => {
    setup({ products: [product("p1", "s1")] });
    await expect(snap({ address: { address: "Somewhere", city: "Mumbai", pincode: "12" } })).rejects.toMatchObject({
      statusCode: 400,
      code: "COURIER_DELIVERY_PINCODE",
    });
    expect(mockRateQuote).not.toHaveBeenCalled();
  });

  it("13. courier orders have zero rider payout and the margin is just the handling fee", async () => {
    setup({ products: [product("p1", "s1")] });
    const s = await snap({ tipAmount: 20 });
    const b = s.sellerBreakdownEntries[0].breakdown;
    expect(b.riderPayoutBase + b.riderPayoutDistance + b.riderPayoutBonus).toBe(0);
    expect(b.riderPayoutTotal).toBe(0);
    expect(b.tipTotal).toBe(0); // no rider on a courier shipment, so no tip is collected
    expect(b.platformLogisticsMargin).toBe(10);
  });

  it("14. discount and free-delivery coupon work with the courier fee (platform absorbs it)", async () => {
    setup({ products: [product("p1", "s1")] });
    mockComputeOrderDiscount.mockResolvedValue({
      discountAmount: 25,
      couponSnapshot: { code: "FREE" },
      coupon: { _id: "c1" },
      freeDelivery: true,
    });
    const s = await snap({ couponCode: "FREE" });
    const b = s.sellerBreakdownEntries[0].breakdown;
    expect(b.deliveryFeeCharged).toBe(0);
    expect(b.snapshots.freeDeliveryRebate).toBe(59.14);
    expect(b.grandTotal).toBe(249 - 25 + 10);
    expect(b.platformLogisticsMargin).toBeCloseTo(10 - 59.14, 2); // courier cost shown as campaign cost
  });

  it("15. preview and order placement produce identical totals, with the quote cached", async () => {
    setup({ products: [product("p1", "s1")] });
    const preview = await snap({ paymentMode: "COD" });
    const callsAfterPreview = mockRateQuote.mock.calls.length;
    const placed = await snap({ paymentMode: "COD" });
    expect(placed.aggregateBreakdown.grandTotal).toBe(preview.aggregateBreakdown.grandTotal);
    expect(placed.aggregateBreakdown.deliveryFeeCharged).toBe(preview.aggregateBreakdown.deliveryFeeCharged);
    expect(mockRateQuote.mock.calls.length).toBe(callsAfterPreview); // served from the 15-minute cache
    const q = placed.sellerBreakdownEntries[0].breakdown.snapshots.courierQuote;
    expect(q).toMatchObject({
      provider: "delhivery",
      amount: 127.2,
      paymentType: "COD",
      pickupPincode: "380001",
      destinationPincode: "400001",
      actualWeightGrams: 500,
    });
    expect(q.quotedAt).toBeInstanceOf(Date);
    expect(q.reference).toMatch(/^CQ-/);
  });
});
