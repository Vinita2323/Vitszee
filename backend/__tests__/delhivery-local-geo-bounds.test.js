import { jest, describe, it, expect } from "@jest/globals";

// Capture the payload we send to Delhivery; quote serviceable, create succeeds.
const sent = [];
const mockSend = jest.fn(async ({ path, json }) => {
  sent.push({ path, json });
  if (path.includes("/pricing/quote"))
    return { data: { data: { vehicles: [{ type: "2-wheeler", fare: { amount: 95 } }] } } };
  if (path.includes("/orders/create"))
    return { data: { success: true, data: { success: true, order_id: "CRN-GEO-1" } } };
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

// Mirrors the real "doller home care" seller: Ahmedabad address, but a placeholder
// Indore coordinate saved on the record.
const fakeOrder = {
  _id: "60d5ecb8b5c9c614b8c7e2cc",
  orderId: "ORD-GEO-TEST",
  address: {
    name: "Test Customer",
    phone: "9876500000",
    address: "Satellite Road, Ahmedabad 380015",
    city: "Ahmedabad",
    pincode: "380015",
    location: { lat: 23.027, lng: 72.51 }, // valid Ahmedabad
  },
  customer: { name: "Test Customer", phone: "9876500000" },
  seller: {
    shopName: "doller home care",
    phone: "9876543210",
    city: "ahmedabad",
    state: "gujarat",
    address: "42 ratnasagar height nr gst crossing new ranip ahmedabad 382470",
    pincode: "381480",
    location: { type: "Point", coordinates: [75.87197, 22.7176] }, // INDORE placeholder
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
  resolveSellerPickupDetails: () => ({
    phone: "9876543210",
    address: "42 ratnasagar height nr gst crossing new ranip ahmedabad 382470",
    city: "ahmedabad", state: "gujarat", pin: "381480",
  }),
  ensureSellerPickupLocation: async () => "doller home care 480",
}));
jest.unstable_mockModule("../app/services/delhivery/delhiveryOrderSync.js", () => ({ syncOrderWithShipmentStatus: jest.fn(async () => null) }));
jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: jest.fn(), emitToCustomer: jest.fn(), emitToSeller: jest.fn(), emitToOrder: jest.fn(),
}));

const { createLocalOrder } = await import("../app/services/delhiveryLocal/delhiveryLocalService.js");

describe("Delhivery Local geo sanity bounds", () => {
  it("drops out-of-city seller coordinates but still creates the order from the address", async () => {
    const shipment = await createLocalOrder("ORD-GEO-TEST");
    const create = sent.find((c) => c.path.includes("/orders/create"));
    expect(create).toBeTruthy();

    // Indore placeholder must NOT be sent as the pickup point...
    expect(create.json.pickupDetails.geoLocation).toBeUndefined();
    // ...but the address + pincode still are, so Delhivery can geocode it.
    expect(create.json.pickupDetails.address1).toContain("ranip");
    expect(create.json.pickupDetails.pinCode).toBe("381480");

    // A valid in-city customer coordinate is preserved.
    expect(create.json.dropDetails.geoLocation).toEqual({ latitude: "23.027000", longitude: "72.510000" });

    expect(String(shipment.awbNumber)).toBe("CRN-GEO-1");
    expect(shipment.shipmentStatus).toBe("ORDER_CREATED");
  });
});
