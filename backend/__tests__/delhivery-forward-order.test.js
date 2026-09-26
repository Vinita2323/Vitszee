import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockAxios = jest.fn();
const mockShipmentFindOne = jest.fn();
const mockShipmentSave = jest.fn();
const mockOrderFindOne = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
const mockOrderUpdateOne = jest.fn();
const mockSellerUpdateOne = jest.fn();
const mockSettingFindOne = jest.fn();
let mockLastShipment = null;

jest.unstable_mockModule("axios", () => ({ default: mockAxios }));

jest.unstable_mockModule("../app/models/setting.js", () => ({
  default: { findOne: mockSettingFindOne },
}));

jest.unstable_mockModule("../app/models/shipment.js", () => {
  function MockShipment(data) {
    Object.assign(this, data);
    this.timeline = this.timeline || [];
    this.save = mockShipmentSave.mockResolvedValue(this);
    mockLastShipment = this;
  }
  MockShipment.findOne = mockShipmentFindOne;
  return { default: MockShipment };
});

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: mockOrderFindOne,
    findOneAndUpdate: mockOrderFindOneAndUpdate,
    updateOne: mockOrderUpdateOne,
  },
}));

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: { updateOne: mockSellerUpdateOne },
}));

jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: jest.fn(),
  emitToCustomer: jest.fn(),
  emitToSeller: jest.fn(),
}));

jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: jest.fn(),
}));

jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({
  applyDeliveredSettlement: jest.fn(),
}));

jest.unstable_mockModule("../app/services/orderCompensation.js", () => ({
  compensateOrderCancellation: jest.fn(),
}));

const { createForwardOrder, cancelForwardOrder, trackForwardOrder, checkForwardServiceability } = await import(
  "../app/services/delhivery/delhiveryForwardService.js"
);

const SELLER = {
  _id: "60d5ecb8b5c9c614b8c7e2aa",
  shopName: "Green Store",
  phone: "9876543211",
  email: "store@example.com",
  address: "8th main, Teachers colony",
  city: "Ahmedabad",
  state: "Gujarat",
  pincode: "382480",
  delhiveryWarehouse: { name: "Green Store C7E2AA" },
};

function buildOrder(overrides = {}) {
  return {
    _id: "60d5ecb8b5c9c614b8c7e2b1",
    orderId: "ORD-9999",
    workflowStatus: "DELIVERY_SEARCH",
    status: "confirmed",
    createdAt: new Date("2026-09-26T10:00:00Z"),
    customer: { name: "Test Customer", phone: "9876543210" },
    seller: { ...SELLER },
    address: {
      name: "Test Customer",
      phone: "9876543210",
      address: "Door 12, Main Street",
      city: "Delhi",
      state: "Delhi",
      pincode: "110009",
    },
    items: [{ name: "Fresh Apples", price: 150, quantity: 2, product: { sku: "SKU-1" } }],
    paymentBreakdown: { grandTotal: 300 },
    paymentMode: "ONLINE",
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function mockOrderLookup(order) {
  mockOrderFindOne.mockReturnValue({
    populate: jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(order),
      }),
    }),
  });
}

const pincodeResponse = (pin, extra = {}) => ({
  status: 200,
  data: { delivery_codes: [{ postal_code: { pin, cod: "Y", pre_paid: "Y", pickup: "Y", ...extra } }] },
  headers: {},
});

function mockServiceable() {
  mockAxios.mockResolvedValueOnce(pincodeResponse(382480)); // pickup
  mockAxios.mockResolvedValueOnce(pincodeResponse(110009)); // delivery
}

function liveShipment(overrides = {}) {
  return {
    _id: "shp-1",
    internalOrderId: "ORD-9999",
    awbNumber: "1234567890123",
    shipmentStatus: "ORDER_CREATED",
    environment: "production",
    timeline: [],
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const manifestSuccess = (waybill = "1234567890123") => ({
  status: 200,
  data: {
    success: true,
    package_count: 1,
    upload_wbn: "UPL123",
    packages: [{ status: "Success", waybill, refnum: "ORD-9999", remarks: [""], payment: "Prepaid", serviceable: true }],
  },
  headers: {},
});

function httpError(status, data) {
  return Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } });
}

describe("Delhivery forward shipment flow", () => {
  beforeEach(() => {
    mockAxios.mockReset();
    mockShipmentFindOne.mockReset();
    mockShipmentSave.mockReset();
    mockOrderFindOne.mockReset();
    mockOrderFindOneAndUpdate.mockReset();
    mockOrderFindOneAndUpdate.mockResolvedValue({});
    mockOrderUpdateOne.mockReset();
    mockOrderUpdateOne.mockResolvedValue({});
    mockSellerUpdateOne.mockReset();
    mockSellerUpdateOne.mockResolvedValue({});
    mockLastShipment = null;
    mockSettingFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({}) });

    process.env.DELHIVERY_ENVIRONMENT = "production";
    process.env.DELHIVERY_API_TOKEN = "test_token";
    process.env.DELHIVERY_FORWARD_ENABLED = "true";
    process.env.DELHIVERY_AUTO_PICKUP_REQUEST = "false";
    delete process.env.DELHIVERY_DEFAULT_WEIGHT_GRAMS;
  });

  it("creates a shipment with the documented form body and returns the AWB", async () => {
    mockOrderLookup(buildOrder());
    mockShipmentFindOne.mockResolvedValue(null);
    mockServiceable();
    mockAxios.mockResolvedValueOnce(manifestSuccess());

    const shipment = await createForwardOrder("ORD-9999");

    const manifestCall = mockAxios.mock.calls[2][0];
    expect(manifestCall.url).toContain("https://track.delhivery.com/api/cmu/create.json");
    expect(manifestCall.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    // Delhivery requires format=json&data=<json>
    const body = new URLSearchParams(manifestCall.data);
    expect(body.get("format")).toBe("json");
    const payload = JSON.parse(body.get("data"));
    expect(payload.pickup_location.name).toBe("Green Store C7E2AA");
    expect(payload.shipments[0]).toEqual(
      expect.objectContaining({
        order: "ORD-9999",
        pin: "110009",
        phone: "9876543210",
        payment_mode: "Prepaid",
        cod_amount: 0,
        total_amount: 300,
        weight: "500", // grams
      })
    );
    expect(shipment.awbNumber).toBe("1234567890123");
    expect(shipment.shipmentStatus).toBe("ORDER_CREATED");
  });

  it("sends COD orders with the collectable amount", async () => {
    mockOrderLookup(buildOrder({ paymentMode: "COD" }));
    mockShipmentFindOne.mockResolvedValue(null);
    mockServiceable();
    mockAxios.mockResolvedValueOnce(manifestSuccess());

    await createForwardOrder("ORD-9999");

    const payload = JSON.parse(new URLSearchParams(mockAxios.mock.calls[2][0].data).get("data"));
    expect(payload.shipments[0].payment_mode).toBe("COD");
    expect(payload.shipments[0].cod_amount).toBe(300);
  });

  it("treats a rejected package as a failure instead of inventing an AWB", async () => {
    const order = buildOrder();
    mockOrderLookup(order);
    mockShipmentFindOne.mockResolvedValue(null);
    mockServiceable();
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: {
        success: false,
        packages: [{ status: "Fail", waybill: "", refnum: "ORD-9999", remarks: ["ClientWarehouse matching query does not exist"] }],
      },
      headers: {},
    });

    await expect(createForwardOrder("ORD-9999")).rejects.toThrow("ClientWarehouse matching query does not exist");
    expect(mockLastShipment.shipmentStatus).toBe("FAILED");
    expect(mockLastShipment.awbNumber).toBeUndefined();
    expect(order.deliveryFailureReason).toContain("ClientWarehouse");
  });

  it("does not dispatch when Delhivery cannot deliver to the customer pincode", async () => {
    const order = buildOrder();
    mockOrderLookup(order);
    mockShipmentFindOne.mockResolvedValue(null);
    mockAxios.mockResolvedValueOnce(pincodeResponse(382480));
    mockAxios.mockResolvedValueOnce({ status: 200, data: { delivery_codes: [] }, headers: {} });

    await expect(createForwardOrder("ORD-9999")).rejects.toThrow("does not deliver to pincode 110009");
    expect(mockAxios).toHaveBeenCalledTimes(2); // no manifestation call
  });

  it("refuses COD when the destination pincode is prepaid only", async () => {
    const result = await (async () => {
      mockAxios.mockResolvedValueOnce(pincodeResponse(382480));
      mockAxios.mockResolvedValueOnce(pincodeResponse(110009, { cod: "N" }));
      return checkForwardServiceability({ pickupPincode: "382480", deliveryPincode: "110009", isCod: true });
    })();
    expect(result.serviceable).toBe(false);
    expect(result.reason).toContain("COD");
  });

  it("reuses a live shipment instead of creating a second one", async () => {
    mockOrderLookup(buildOrder());
    mockShipmentFindOne.mockResolvedValue(liveShipment({ shipmentStatus: "IN_TRANSIT" }));

    const shipment = await createForwardOrder("ORD-9999");

    expect(shipment.awbNumber).toBe("1234567890123");
    expect(mockAxios).not.toHaveBeenCalled();
  });

  it("refuses to re-dispatch an order whose shipment was cancelled", async () => {
    mockOrderLookup(buildOrder());
    mockShipmentFindOne.mockResolvedValue(liveShipment({ shipmentStatus: "CANCELLED" }));

    await expect(createForwardOrder("ORD-9999")).rejects.toThrow("cancelled Delhivery shipment");
    expect(mockAxios).not.toHaveBeenCalled();
  });

  it("cancels a shipment with the documented cancellation body", async () => {
    const shipment = liveShipment();
    mockShipmentFindOne.mockResolvedValue(shipment);
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: { status: true, waybill: "1234567890123", remark: "Shipment has been cancelled" },
      headers: {},
    });

    await cancelForwardOrder("ORD-9999", "Cancelled by admin");

    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/api/p/edit"),
        data: { waybill: "1234567890123", cancellation: "true" },
      })
    );
    expect(shipment.shipmentStatus).toBe("CANCELLED");
  });

  it("surfaces Delhivery's reason when a cancellation is refused", async () => {
    mockShipmentFindOne.mockResolvedValue(liveShipment());
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: { status: false, remark: "Package is already dispatched" },
      headers: {},
    });

    await expect(cancelForwardOrder("ORD-9999")).rejects.toThrow("Package is already dispatched");
  });

  it("does not call Delhivery when there is no live shipment to cancel", async () => {
    mockShipmentFindOne.mockResolvedValue(liveShipment({ shipmentStatus: "FAILED" }));

    expect(await cancelForwardOrder("ORD-9999")).toBeNull();
    expect(mockAxios).not.toHaveBeenCalled();
  });

  it("applies a tracked scan to the shipment and the order", async () => {
    const shipment = liveShipment({ shipmentStatus: "IN_TRANSIT" });
    mockShipmentFindOne.mockResolvedValue(shipment);
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: {
        ShipmentData: [
          {
            Shipment: {
              AWB: "1234567890123",
              Status: { Status: "Dispatched", StatusType: "UD", StatusLocation: "Delhi_Hub", Instructions: "Out for delivery" },
            },
          },
        ],
      },
      headers: {},
    });

    const result = await trackForwardOrder("ORD-9999");

    expect(mockAxios.mock.calls[0][0].params).toEqual({ waybill: "1234567890123" });
    expect(result.shipmentStatus).toBe("OUT_FOR_DELIVERY");
    expect(mockOrderFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "ORD-9999" }),
      { $set: expect.objectContaining({ workflowStatus: "OUT_FOR_DELIVERY", status: "out_for_delivery" }) },
      { new: true }
    );
  });

  it("marks a shipment FAILED when Delhivery does not know the AWB", async () => {
    const shipment = liveShipment({ awbNumber: "AWB-PLACEHOLDER" });
    mockShipmentFindOne.mockResolvedValue(shipment);
    mockAxios.mockResolvedValueOnce({ status: 200, data: { ShipmentData: [] }, headers: {} });

    await expect(trackForwardOrder("ORD-9999")).rejects.toThrow("no data for AWB");
    expect(shipment.shipmentStatus).toBe("FAILED");
    expect(mockOrderUpdateOne).toHaveBeenCalled();
  });

  it("reports Delhivery's message when the API rejects the request", async () => {
    mockShipmentFindOne.mockResolvedValue(liveShipment());
    mockAxios.mockRejectedValueOnce(httpError(401, "Login or API Key Required"));

    await expect(trackForwardOrder("ORD-9999")).rejects.toThrow("Login or API Key Required");
  });
});
