/**
 * LIVE staging integration test — exercises the REAL createLocalOrder/trackLocalOrder
 * code against Delhivery's staging API, with the DB + sockets mocked so no real data
 * is touched. Skipped unless DELHIVERY_LOCAL_LIVE_TEST=1 (it makes network calls).
 *
 *   DELHIVERY_LOCAL_LIVE_TEST=1 npx jest delhivery-local-live-staging
 */
import { jest, describe, it, expect, beforeAll } from "@jest/globals";

// Credentials are read from the environment (never hardcoded here). Run with, e.g.:
//   DELHIVERY_LOCAL_LIVE_TEST=1 DELHIVERY_LOCAL_ENVIRONMENT=staging \
//   DELHIVERY_LOCAL_STAGING_CLIENT_ID=... DELHIVERY_LOCAL_STAGING_CLIENT_SECRET=... \
//   DELHIVERY_LOCAL_CLIENT_CODE=... npx jest delhivery-local-live-staging
const env = (process.env.DELHIVERY_LOCAL_ENVIRONMENT || "staging").toLowerCase();
const hasCreds =
  env === "production"
    ? process.env.DELHIVERY_LOCAL_PROD_CLIENT_ID && process.env.DELHIVERY_LOCAL_PROD_CLIENT_SECRET
    : process.env.DELHIVERY_LOCAL_STAGING_CLIENT_ID && process.env.DELHIVERY_LOCAL_STAGING_CLIENT_SECRET;
const RUN = process.env.DELHIVERY_LOCAL_LIVE_TEST === "1" && hasCreds && process.env.DELHIVERY_LOCAL_CLIENT_CODE;
const suite = RUN ? describe : describe.skip;

process.env.DELHIVERY_LOCAL_ENABLED = "true";

const orderId = `TEST-LOCAL-${Date.now()}`;
const fakeOrder = {
  _id: "60d5ecb8b5c9c614b8c7e2b9",
  orderId,
  address: {
    name: "Test Customer",
    phone: "9876500000",
    fullAddress: "Satellite, Ahmedabad",
    address: "Satellite",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: "380015",
    location: { lat: 23.027, lng: 72.51 },
  },
  customer: { name: "Test Customer", phone: "9876500000" },
  seller: {
    shopName: "Test Shop",
    name: "Seller",
    phone: "9876543210",
    address: "Navrangpura",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: "380009",
    location: { lat: 23.037, lng: 72.561 },
  },
  items: [{ name: "Test item", quantity: 1 }],
  paymentMode: "COD",
  paymentBreakdown: { grandTotal: 100 },
  workflowStatus: "SELLER_ACCEPTED",
  save: async () => fakeOrder,
};

// Order.findOne(...).populate().populate().populate() -> fakeOrder
function orderBuilder() {
  const b = {
    populate() {
      return b;
    },
    then(resolve, reject) {
      return Promise.resolve(fakeOrder).then(resolve, reject);
    },
  };
  return b;
}
jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { findOne: jest.fn(() => orderBuilder()), findOneAndUpdate: jest.fn(), updateOne: jest.fn() },
}));

let createdShipment = null;
function Shipment(doc) {
  Object.assign(this, doc);
  this.timeline = [];
  this.save = async () => this;
  createdShipment = this;
}
Shipment.findOne = jest.fn(async () => createdShipment);
jest.unstable_mockModule("../app/models/shipment.js", () => ({ default: Shipment }));

jest.unstable_mockModule("../app/models/setting.js", () => ({
  default: { findOne: () => ({ lean: async () => null }) },
}));

// Isolate from the Express warehouse API + real order side effects.
jest.unstable_mockModule("../app/services/delhivery/delhiveryWarehouseService.js", () => ({
  resolveSellerPickupDetails: () => ({
    phone: "9876543210",
    address: "Navrangpura",
    city: "Ahmedabad",
    state: "Gujarat",
    pin: "380009",
  }),
  ensureSellerPickupLocation: async () => "Test Shop 009",
}));
jest.unstable_mockModule("../app/services/delhivery/delhiveryOrderSync.js", () => ({
  syncOrderWithShipmentStatus: jest.fn(async () => null),
}));
jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: jest.fn(),
  emitToCustomer: jest.fn(),
  emitToSeller: jest.fn(),
  emitToOrder: jest.fn(),
}));

const { createLocalOrder, trackLocalOrder } = await import(
  "../app/services/delhiveryLocal/delhiveryLocalService.js"
);

suite("Delhivery Local — live staging via app code", () => {
  let crn = null;

  it("creates a real Local order through createLocalOrder()", async () => {
    const shipment = await createLocalOrder(orderId);
    console.log("CREATE ->", { crn: shipment.awbNumber, status: shipment.shipmentStatus });
    expect(shipment.shipmentStatus).toBe("ORDER_CREATED");
    expect(String(shipment.awbNumber)).toMatch(/^CRN/);
    expect(fakeOrder.awbNumber).toBe(shipment.awbNumber);
    expect(fakeOrder.deliveryProvider).toBe("delhivery");
    crn = shipment.awbNumber;
  }, 60000);

  it("tracks the order through trackLocalOrder()", async () => {
    expect(crn).toBeTruthy();
    // Create is async (HTTP 202 "order is being created"): the CRN isn't queryable for
    // a moment, so poll briefly — mirrors how the reconciliation job runs later.
    let result = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        result = await trackLocalOrder(orderId);
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (!result) throw lastErr;
    console.log("TRACK ->", {
      status: result.shipmentStatus,
      provider: result.providerStatus,
      tracking: result.trackingUrl,
    });
    expect(result.orderId).toBe(crn);
    expect(["ORDER_CREATED", "RIDER_ASSIGNED", "RIDER_ARRIVED", "OUT_FOR_DELIVERY"]).toContain(
      result.shipmentStatus
    );
  }, 60000);
});
