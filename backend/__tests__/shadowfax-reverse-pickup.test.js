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

const { createReversePickup, cancelReversePickup, trackReversePickup } = await import(
  "../app/services/shadowfax/shadowfaxReverseService.js"
);

describe("Shadowfax Reverse Pickup Flow", () => {
  beforeEach(() => {
    mockAxios.mockReset();
    mockShipmentFindOne.mockReset();
    mockShipmentPrototypeSave.mockReset();
    mockOrderFindOne.mockReset();
    mockSettingFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        shadowfax: {
          reverseEnabled: true,
          autoServiceabilityCheck: true,
          environment: "sandbox",
          reverseToken: "test_reverse_token",
          qcEnabled: true,
        },
      }),
    });

    process.env.SHADOWFAX_REVERSE_TOKEN = "test_reverse_token";
    process.env.SHADOWFAX_REVERSE_ENABLED = "true";
  });

  it("should create reverse pickup request with Doorstep QC rules", async () => {
    const mockOrder = {
      _id: "60d5ecb8b5c9c614b8c7e2b1",
      orderId: "ORD-RETURN-101",
      status: "delivered",
      returnStatus: "return_approved",
      customer: {
        name: "Returning Customer",
        phone: "9876543210",
        email: "returner@example.com",
      },
      seller: {
        shopName: "Return Hub Store",
        name: "Warehouse Receiver",
        phone: "9876543211",
        address: "Hub Address 456",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560002",
        location: { coordinates: [77.5946, 12.9716] },
      },
      address: {
        name: "Returning Customer",
        phone: "9876543210",
        address: "Door 12, Main St",
        city: "Bengaluru",
        pincode: "560001",
        location: { lat: 12.9352, lng: 77.6245 },
      },
      items: [
        {
          name: "Casual T-Shirt",
          price: 499,
          quantity: 1,
          product: { sku: "SKU-TSHIRT-L" },
        },
      ],
      pricing: { total: 499 },
      returnReason: "Size does not fit",
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

    // Mock Serviceability check
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: { serviceable: true, status: "success" },
      headers: {},
    });

    // Mock Reverse Request creation
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: {
        status: "success",
        request_id: "SFX-REV-101",
        awb_number: "AWB-REV-101",
      },
      headers: {},
    });

    const result = await createReversePickup("ORD-RETURN-101", {
      qcRules: [
        { parameter: "condition", expected_value: "unused", description: "Item must be unworn" },
      ],
    });

    expect(result).toBeDefined();
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: expect.stringContaining("/api/v2/clients/requests"),
        data: expect.objectContaining({
          client_order_number: "ORD-RETURN-101",
          destination_pincode: "560002",
          address: expect.objectContaining({
            contact: "9876543210",
          }),
        }),
      })
    );
  });
});
