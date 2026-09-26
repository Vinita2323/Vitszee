import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockAxios = jest.fn();
const mockShipmentFindOne = jest.fn();
const mockShipmentPrototypeSave = jest.fn();
const mockOrderFindOne = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
const mockSettingFindOne = jest.fn();
let mockLastShipment = null;

jest.unstable_mockModule("axios", () => ({
  default: mockAxios,
}));

jest.unstable_mockModule("../app/models/setting.js", () => ({
  default: {
    findOne: mockSettingFindOne,
  },
}));

jest.unstable_mockModule("../app/models/shipment.js", () => {
  function MockShipment(data) {
    Object.assign(this, data);
    this.timeline = this.timeline || [];
    this.save = mockShipmentPrototypeSave.mockResolvedValue(this);
    mockLastShipment = this;
  }
  MockShipment.findOne = mockShipmentFindOne;
  return { default: MockShipment };
});

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: mockOrderFindOne,
    findOneAndUpdate: mockOrderFindOneAndUpdate,
    updateOne: jest.fn().mockResolvedValue({}),
  },
}));

jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: jest.fn(),
  emitToCustomer: jest.fn(),
  emitToSeller: jest.fn(),
}));

jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: jest.fn(),
}));

const { createForwardOrder, cancelForwardOrder, trackForwardOrder } = await import(
  "../app/services/shadowfax/shadowfaxForwardService.js"
);

function buildOrder(overrides = {}) {
  return {
    _id: "60d5ecb8b5c9c614b8c7e2b1",
    orderId: "ORD-9999",
    workflowStatus: "SELLER_ACCEPTED",
    status: "confirmed",
    customer: { name: "Test Customer", phone: "9876543210" },
    seller: {
      shopName: "Green Store",
      phone: "9876543211",
      address: "Store Address 123",
      city: "Delhi",
      state: "Delhi",
      pincode: "110009",
      location: { coordinates: [77.19, 28.7] },
    },
    address: {
      name: "Test Customer",
      phone: "9876543210",
      address: "Door 12, Main St",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560007",
      location: { lat: 12.97, lng: 77.64 },
    },
    items: [{ name: "Fresh Apples", price: 150, quantity: 2, product: { sku: "SKU-APPLE-1" } }],
    pricing: { total: 300 },
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

function mockServiceable() {
  mockAxios.mockResolvedValueOnce({ status: 200, data: [{ code: 110009, services: ["Marketplace"] }], headers: {} });
  mockAxios.mockResolvedValueOnce({ status: 200, data: [{ code: 560007, services: ["Regular"] }], headers: {} });
}

function liveShipment(overrides = {}) {
  return {
    _id: "shp-1",
    internalOrderId: "ORD-9999",
    awbNumber: "SF401022456TST",
    shadowfaxOrderId: "2199782",
    shipmentStatus: "ORDER_CREATED",
    environment: "sandbox",
    timeline: [],
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function httpError(status, data) {
  return Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } });
}

describe("Shadowfax Forward Order Flow", () => {
  beforeEach(() => {
    mockAxios.mockReset();
    mockShipmentFindOne.mockReset();
    mockShipmentPrototypeSave.mockReset();
    mockOrderFindOne.mockReset();
    mockOrderFindOneAndUpdate.mockReset();
    mockOrderFindOneAndUpdate.mockResolvedValue({});
    mockLastShipment = null;
    mockSettingFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        shadowfax: {
          forwardEnabled: true,
          autoServiceabilityCheck: true,
          environment: "sandbox",
          forwardToken: "test_token",
        },
      }),
    });

    process.env.SHADOWFAX_ENVIRONMENT = "sandbox";
    process.env.SHADOWFAX_FORWARD_TOKEN = "test_token";
    process.env.SHADOWFAX_FORWARD_ENABLED = "true";
    delete process.env.SHADOWFAX_SANDBOX_SIMULATION;
    delete process.env.SHADOWFAX_DEFAULT_WEIGHT_GRAMS;
  });

  it("should create forward order and save shipment record", async () => {
    const mockOrder = {
      _id: "60d5ecb8b5c9c614b8c7e2b1",
      orderId: "ORD-9999",
      workflowStatus: "SELLER_ACCEPTED",
      status: "confirmed",
      customer: {
        name: "Test Customer",
        phone: "9876543210",
        email: "customer@example.com",
      },
      seller: {
        shopName: "Green Store",
        name: "Store Manager",
        phone: "9876543211",
        address: "Store Address 123",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560002",
        location: { coordinates: [77.5946, 12.9716] },
      },
      address: {
        name: "Test Customer",
        phone: "9876543210",
        address: "Door 12, Main St",
        city: "Bengaluru",
        pincode: "560001",
        location: { lat: 12.9352, lng: 77.6245 },
      },
      items: [
        {
          name: "Fresh Apples",
          price: 150,
          quantity: 2,
          product: { sku: "SKU-APPLE-1" },
        },
      ],
      pricing: { total: 300 },
      paymentMode: "ONLINE",
      save: jest.fn().mockResolvedValue(true),
    };

    mockOrderFindOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockOrder),
        }),
      }),
    });

    mockShipmentFindOne.mockResolvedValue(null);

    // Mock Serviceability check (pickup leg, then delivery leg)
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: [{ code: 560002, services: ["Regular"] }],
      headers: {},
    });
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: [{ code: 560001, services: ["Regular"] }],
      headers: {},
    });

    // Mock Order creation
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: {
        message: "Success",
        data: {
          id: 9999,
          client_order_id: "ORD-9999",
          awb_number: "AWB-9999",
        },
      },
      headers: {},
    });

    const result = await createForwardOrder("ORD-9999");

    expect(result).toBeDefined();
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: expect.stringContaining("/api/v3/clients/orders/"),
        data: expect.objectContaining({
          order_type: "marketplace",
          order_details: expect.objectContaining({
            client_order_id: "ORD-9999",
            payment_mode: "Prepaid",
          }),
        }),
      })
    );
  });

  it("should reuse existing active shipment to prevent duplicate order creation", async () => {
    const existingShipment = {
      internalOrderId: "ORD-9999",
      shadowfaxOrderId: "SFX-ALREADY-CREATED",
      awbNumber: "AWB-ALREADY-CREATED",
      shipmentStatus: "ORDER_CREATED",
    };

    mockOrderFindOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue({ orderId: "ORD-9999" }),
        }),
      }),
    });

    mockShipmentFindOne.mockResolvedValue(existingShipment);

    const result = await createForwardOrder("ORD-9999");

    expect(result.shadowfaxOrderId).toBe("SFX-ALREADY-CREATED");
    // axios should not be called to create another order
    expect(mockAxios).not.toHaveBeenCalled();
  });

  it("sends parcel weights in grams", async () => {
    mockOrderLookup(buildOrder());
    mockShipmentFindOne.mockResolvedValue(null);
    mockServiceable();
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: { message: "Success", errors: null, data: { id: 2199782, awb_number: "SF401022456TST", status: "new" } },
      headers: {},
    });

    await createForwardOrder("ORD-9999");

    const payload = mockAxios.mock.calls[2][0].data;
    expect(payload.order_details.actual_weight).toBe(500);
    expect(payload.order_details.volumetric_weight).toBe(500);
    expect(mockLastShipment.awbNumber).toBe("SF401022456TST");
    expect(mockLastShipment.shadowfaxOrderId).toBe("2199782");
  });

  it("treats Shadowfax's HTTP 200 'Failure' reply as a failed order, without inventing an AWB", async () => {
    const order = buildOrder();
    mockOrderLookup(order);
    mockShipmentFindOne.mockResolvedValue(null);
    mockServiceable();
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: { message: "Failure", errors: "Invalid Delivery Pincode. Pincode 560007 is not serviceble" },
      headers: {},
    });

    await expect(createForwardOrder("ORD-9999")).rejects.toThrow("Invalid Delivery Pincode");

    expect(mockLastShipment.shipmentStatus).toBe("FAILED");
    expect(mockLastShipment.awbNumber).toBeUndefined();
    expect(order.awbNumber).toBeUndefined();
    expect(order.deliveryFailureReason).toContain("Invalid Delivery Pincode");
  });

  it("flattens nested validation errors into a readable message", async () => {
    mockOrderLookup(buildOrder());
    mockShipmentFindOne.mockResolvedValue(null);
    mockServiceable();
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: { message: "Failure", errors: { order_details: { client_order_id: ["This field is required."] } }, data: {} },
      headers: {},
    });

    await expect(createForwardOrder("ORD-9999")).rejects.toThrow("order_details.client_order_id: This field is required.");
  });

  it("adopts the existing AWB when Shadowfax reports the order was already created", async () => {
    mockOrderLookup(buildOrder());
    mockShipmentFindOne.mockResolvedValue(null);
    mockServiceable();
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: {
        message: "Failure",
        errors: "Order for COID : ORD-9999 is already created with AWB : SF325110257MY",
        COID: "ORD-9999",
        AWB: "SF325110257MY",
      },
      headers: {},
    });

    const shipment = await createForwardOrder("ORD-9999");

    expect(shipment.shipmentStatus).toBe("ORDER_CREATED");
    expect(shipment.awbNumber).toBe("SF325110257MY");
  });

  it("retries a previously FAILED shipment instead of reusing it", async () => {
    mockOrderLookup(buildOrder());
    const failed = liveShipment({ shipmentStatus: "FAILED", awbNumber: "AWB-SFX-ORD-9999", shadowfaxOrderId: "SFX-ORD-9999" });
    mockShipmentFindOne.mockResolvedValue(failed);
    mockServiceable();
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: { message: "Success", data: { id: 2199790, awb_number: "SF401022499TST", status: "new" } },
      headers: {},
    });

    const shipment = await createForwardOrder("ORD-9999");

    expect(mockAxios).toHaveBeenCalledTimes(3);
    expect(shipment.awbNumber).toBe("SF401022499TST");
    expect(shipment.shipmentStatus).toBe("ORDER_CREATED");
  });

  it("cancels using the AWB as request_id", async () => {
    const shipment = liveShipment();
    mockShipmentFindOne.mockResolvedValue(shipment);
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: { responseMsg: "Request has been marked as cancelled", responseCode: 200 },
      headers: {},
    });

    await cancelForwardOrder("ORD-9999", "Cancelled by admin");

    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/api/v3/clients/orders/cancel/"),
        data: { request_id: "SF401022456TST", cancel_remarks: "Cancelled by admin" },
      })
    );
    expect(shipment.shipmentStatus).toBe("CANCELLED");
  });

  it("keeps the shipment live when Shadowfax only queues the cancellation", async () => {
    const shipment = liveShipment({ shipmentStatus: "OUT_FOR_DELIVERY" });
    mockShipmentFindOne.mockResolvedValue(shipment);
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: { responseMsg: "Request is queued for cancellation.", responseCode: 304 },
      headers: {},
    });

    await cancelForwardOrder("ORD-9999", "Cancelled by admin");

    expect(shipment.shipmentStatus).toBe("OUT_FOR_DELIVERY");
    expect(shipment.cancellationRequestedAt).toBeInstanceOf(Date);
  });

  it("surfaces Shadowfax's reason when a cancellation is refused", async () => {
    mockShipmentFindOne.mockResolvedValue(liveShipment());
    mockAxios.mockRejectedValueOnce(
      httpError(400, { responseMsg: "Order cannot be cancelled. Invalid state.", responseCode: 400 })
    );

    await expect(cancelForwardOrder("ORD-9999")).rejects.toThrow("Order cannot be cancelled. Invalid state.");
  });

  it("does not call Shadowfax when there is no live shipment to cancel", async () => {
    mockShipmentFindOne.mockResolvedValue(liveShipment({ shipmentStatus: "FAILED" }));

    const result = await cancelForwardOrder("ORD-9999");

    expect(result).toBeNull();
    expect(mockAxios).not.toHaveBeenCalled();
  });

  it("applies the tracked status to the order (v4 bulk_track response)", async () => {
    const shipment = liveShipment({ shipmentStatus: "IN_TRANSIT" });
    mockShipmentFindOne.mockResolvedValue(shipment);
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: {
        message: "Success",
        data: [
          {
            awb_number: "SF401022456TST",
            status: "ofd",
            status_display: "Out For Delivery",
            tracking_details: [{ status_id: "ofd", status: "Out For Delivery", remarks: "Item OFD at TestHub2" }],
          },
        ],
      },
      headers: {},
    });

    const result = await trackForwardOrder("ORD-9999");

    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: expect.stringContaining("/api/v4/clients/bulk_track/"),
        data: { awb_numbers: ["SF401022456TST"] },
      })
    );
    expect(result.shipmentStatus).toBe("OUT_FOR_DELIVERY");
    expect(mockOrderFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "ORD-9999" }),
      { $set: expect.objectContaining({ workflowStatus: "OUT_FOR_DELIVERY", status: "out_for_delivery" }) },
      { new: true }
    );
  });

  it("falls back to single-order tracking when bulk_track omits the AWB", async () => {
    const shipment = liveShipment();
    mockShipmentFindOne.mockResolvedValue(shipment);
    mockAxios
      .mockResolvedValueOnce({ status: 200, data: { message: "Success", data: [] }, headers: {} })
      .mockResolvedValueOnce({
        status: 200,
        data: { message: "Success", order_details: { status: "picked", status_display: "Picked" }, tracking_details: [] },
        headers: {},
      });

    const result = await trackForwardOrder("ORD-9999");

    expect(mockAxios.mock.calls[1][0].url).toContain("/api/v4/clients/orders/SF401022456TST/track/");
    expect(result.shipmentStatus).toBe("PICKED_UP");
  });

  it("marks a shipment FAILED when Shadowfax does not recognise its AWB", async () => {
    const shipment = liveShipment({ awbNumber: "AWB-SFX-ORD-9999" });
    mockShipmentFindOne.mockResolvedValue(shipment);
    // bulk_track answers 200 with no entry; the single-order endpoint then rejects the AWB.
    mockAxios.mockResolvedValueOnce({ status: 200, data: { message: "Success", data: [] }, headers: {} });
    mockAxios.mockRejectedValueOnce(httpError(400, { message: "Invalid AWB Number" }));

    await expect(trackForwardOrder("ORD-9999")).rejects.toThrow("Invalid AWB Number");

    expect(shipment.shipmentStatus).toBe("FAILED");
    expect(shipment.failureReason).toContain("AWB-SFX-ORD-9999");
  });
});
