import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockAxios = jest.fn();
const mockShipmentFindOne = jest.fn();
const mockShipmentPrototypeSave = jest.fn();
const mockOrderFindOne = jest.fn();
const mockSettingFindOne = jest.fn();

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
  }
  MockShipment.findOne = mockShipmentFindOne;
  return { default: MockShipment };
});

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: mockOrderFindOne,
    findOneAndUpdate: jest.fn().mockResolvedValue({}),
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

const { createForwardOrder } = await import(
  "../app/services/shadowfax/shadowfaxForwardService.js"
);

describe("Shadowfax Forward Order Flow", () => {
  beforeEach(() => {
    mockAxios.mockReset();
    mockShipmentFindOne.mockReset();
    mockShipmentPrototypeSave.mockReset();
    mockOrderFindOne.mockReset();
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

    process.env.SHADOWFAX_FORWARD_TOKEN = "test_token";
    process.env.SHADOWFAX_FORWARD_ENABLED = "true";
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
});
