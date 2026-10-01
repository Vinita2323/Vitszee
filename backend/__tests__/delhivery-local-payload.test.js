import { jest, describe, it, expect } from "@jest/globals";

// Capture what we send to Delhivery; return serviceable quote + successful create.
const sent = [];
const mockSend = jest.fn(async ({ path, json }) => {
  sent.push({ path, json });
  if (path.includes("/pricing/quote"))
    return { data: { data: { vehicles: [{ type: "2-wheeler", fare: { amount: 71 } }] } } };
  if (path.includes("/orders/create"))
    return { data: { success: true, data: { success: true, order_id: "CRN-TEST-123" } } };
  return { data: {} };
});
jest.unstable_mockModule("../app/services/delhiveryLocal/delhiveryLocalClient.js", () => ({
  sendDelhiveryLocalRequest: mockSend,
  extractLocalErrorMessage: (b, f) => f,
}));

process.env.DELHIVERY_LOCAL_ENABLED = "true";
process.env.DELHIVERY_LOCAL_ENVIRONMENT = "staging";
process.env.DELHIVERY_LOCAL_STAGING_CLIENT_ID = "x";
process.env.DELHIVERY_LOCAL_STAGING_CLIENT_SECRET = "y";
process.env.DELHIVERY_LOCAL_CLIENT_CODE = "cms::client::test";

const fakeOrder = {
  _id: "60d5ecb8b5c9c614b8c7e2bb",
  orderId: "ORD-PAYLOAD-TEST",
  address: {
    name: "Test Customer",
    phone: "9876500000",
    address: "Vadaj, Ahmedabad 380013",
    city: "Vadaj, Gujarat, 380013", // polluted city
    pincode: "380013",
    location: { lat: 23.0609817636360147, lng: 72.5805692949328323 }, // high precision
  },
  customer: { name: "Test Customer", phone: "9876500000" },
  seller: {
    shopName: "Test Shop",
    name: "Seller",
    phone: "9876543210",
    // GeoJSON Point [lng, lat], high precision
    location: { type: "Point", coordinates: [72.55662113428116, 23.098407166461413] },
    pincode: "382470",
    city: "Ranip, Gujarat, 382470",
    state: "Gujarat",
    address: "NEW RANIP",
  },
  items: [{ name: "Item", quantity: 1 }],
  paymentMode: "COD",
  paymentBreakdown: { grandTotal: 100 },
  workflowStatus: "SELLER_ACCEPTED",
  save: async () => fakeOrder,
};

function orderBuilder() {
  const b = { populate() { return b; }, then(res, rej) { return Promise.resolve(fakeOrder).then(res, rej); } };
  return b;
}
jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { findOne: jest.fn(() => orderBuilder()), findOneAndUpdate: jest.fn(), updateOne: jest.fn() },
}));
let createdShipment = null;
function Shipment(doc) { Object.assign(this, doc); this.timeline = []; this.save = async () => this; createdShipment = this; }
Shipment.findOne = jest.fn(async () => createdShipment);
jest.unstable_mockModule("../app/models/shipment.js", () => ({ default: Shipment }));
jest.unstable_mockModule("../app/models/setting.js", () => ({ default: { findOne: () => ({ lean: async () => null }) } }));
jest.unstable_mockModule("../app/services/delhivery/delhiveryWarehouseService.js", () => ({
  resolveSellerPickupDetails: () => ({ phone: "9876543210", address: "NEW RANIP", city: "Ranip, Gujarat, 382470", state: "Gujarat", pin: "382470" }),
  ensureSellerPickupLocation: async () => "Test Shop 470",
}));
jest.unstable_mockModule("../app/services/delhivery/delhiveryOrderSync.js", () => ({ syncOrderWithShipmentStatus: jest.fn(async () => null) }));
jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({ emitOrderStatusUpdate: jest.fn() }));

const { createLocalOrder } = await import("../app/services/delhiveryLocal/delhiveryLocalService.js");

const MAX_6DP = /^-?\d+(\.\d{1,6})?$/;

describe("Delhivery Local payload sanitisation", () => {
  it("rounds geo to <=6 decimals and cleans city before creating", async () => {
    const shipment = await createLocalOrder("ORD-PAYLOAD-TEST");
    const create = sent.find((c) => c.path.includes("/orders/create"));
    expect(create).toBeTruthy();
    const { pickupDetails, dropDetails } = create.json;

    // pickup geo comes from GeoJSON [lng,lat]; drop from {lat,lng}
    expect(pickupDetails.geoLocation).toEqual({ latitude: "23.098407", longitude: "72.556621" });
    expect(dropDetails.geoLocation).toEqual({ latitude: "23.060982", longitude: "72.580569" });

    // every coordinate has at most 6 decimal places
    for (const d of [pickupDetails, dropDetails]) {
      expect(d.geoLocation.latitude).toMatch(MAX_6DP);
      expect(d.geoLocation.longitude).toMatch(MAX_6DP);
    }

    // cities cleaned to plain names (no commas/digits)
    expect(dropDetails.city).toBe("Vadaj");
    expect(pickupDetails.city).toBe("Ranip");

    // create succeeded
    expect(String(shipment.awbNumber)).toBe("CRN-TEST-123");
    expect(shipment.shipmentStatus).toBe("ORDER_CREATED");
  });
});
