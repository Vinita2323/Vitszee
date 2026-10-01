import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const emitToCustomer = jest.fn();
const emitToSeller = jest.fn();
const emitToOrder = jest.fn();
const emitNotificationEvent = jest.fn();
const syncOrderWithShipmentStatus = jest.fn(async () => null);

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: jest.fn(() => ({
      select: () => ({ lean: async () => ({ orderId: "ORD-RT", seller: "s1", customer: "c1" }) }),
    })),
  },
}));
jest.unstable_mockModule("../app/models/shipment.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/setting.js", () => ({ default: { findOne: () => ({ lean: async () => null }) } }));
jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: jest.fn(), emitToCustomer, emitToSeller, emitToOrder,
}));
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({ emitNotificationEvent }));
jest.unstable_mockModule("../app/services/delhivery/delhiveryOrderSync.js", () => ({ syncOrderWithShipmentStatus }));
jest.unstable_mockModule("../app/services/delhivery/delhiveryWarehouseService.js", () => ({
  resolveSellerPickupDetails: jest.fn(), ensureSellerPickupLocation: jest.fn(),
}));

const { applyLocalFulfilment } = await import("../app/services/delhiveryLocal/delhiveryLocalService.js");

function shipment(status) {
  return {
    internalOrderId: "ORD-RT", awbNumber: "CRN-RT", shipmentStatus: status, providerStatus: null,
    timeline: [], rider: undefined, save: jest.fn(async function () { return this; }),
  };
}
const RIDER = { name: "Panchal Kanaiyalala", vehicleNumber: "GJ01PJ5384", vehicleType: "2-wheeler", mobile: { mobileNumber: "9428416228" }, location: { lat: 23.1, long: 72.5 } };

beforeEach(() => {
  [emitToCustomer, emitToSeller, emitToOrder, emitNotificationEvent, syncOrderWithShipmentStatus].forEach((m) => m.mockReset());
});

describe("Delhivery Local rider updates", () => {
  it("captures rider info and notifies seller + customer when a rider is assigned", async () => {
    const sh = shipment("ORDER_CREATED");
    const reached = await applyLocalFulfilment(sh, {
      fulfilmentStatus: "agent_assigned", partnerInfo: RIDER,
      trackingUrl: "https://v3.delhivery.com/local?order_id=abc",
    });
    expect(reached).toBe("RIDER_ASSIGNED");
    expect(sh.rider.vehicleNumber).toBe("GJ01PJ5384");
    expect(sh.rider.vehicleType).toBe("2-wheeler");
    expect(sh.rider.phone).toBe("9428416228");
    expect(sh.trackingUrl).toBe("https://v3.delhivery.com/local?order_id=abc");

    const cust = emitToCustomer.mock.calls[0][1];
    expect(cust.event).toBe("order:quick:update");
    expect(cust.payload.statusLabel).toBe("Rider assigned");
    expect(cust.payload.rider.vehicleNumber).toBe("GJ01PJ5384");
    expect(cust.payload.rider.phone).toBe("9428416228");
    expect(cust.payload.trackingUrl).toContain("v3.delhivery.com");
    expect(emitToSeller).toHaveBeenCalled();
    expect(emitToOrder).toHaveBeenCalled();

    const events = emitNotificationEvent.mock.calls.map((c) => c[0]);
    expect(events).toContain("CUSTOMER_RIDER_ASSIGNED");
    expect(events).toContain("SELLER_RIDER_ASSIGNED");
  });

  it("notifies the seller on pickup (out_for_delivery)", async () => {
    const sh = shipment("RIDER_ARRIVED");
    const reached = await applyLocalFulfilment(sh, { fulfilmentStatus: "out_for_delivery", partnerInfo: RIDER });
    expect(reached).toBe("OUT_FOR_DELIVERY");
    expect(emitNotificationEvent.mock.calls.map((c) => c[0])).toContain("SELLER_DELIVERY_PICKED");
  });

  it("pushes live updates but fires no duplicate notification when status repeats", async () => {
    const sh = shipment("RIDER_ASSIGNED");
    sh.providerStatus = "agent_assigned";
    const reached = await applyLocalFulfilment(sh, {
      fulfilmentStatus: "agent_assigned",
      partnerInfo: { ...RIDER, location: { lat: 23.2, long: 72.6 } },
    });
    expect(emitToCustomer).toHaveBeenCalled(); // live location still pushed
    expect(emitNotificationEvent).not.toHaveBeenCalled(); // no duplicate notification
  });
});
