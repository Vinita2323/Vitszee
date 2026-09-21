import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockAxios = jest.fn();
const mockEmitOrderStatusUpdate = jest.fn();
const mockEmitDeliveryBroadcastForSeller = jest.fn();
const mockDeliveryAssignmentCreate = jest.fn();
const mockScheduleDeliveryTimeout = jest.fn();

jest.unstable_mockModule("axios", () => ({
  default: mockAxios,
}));

jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: mockEmitOrderStatusUpdate,
  emitToSeller: jest.fn(),
  emitToDelivery: jest.fn(),
  emitToCustomer: jest.fn(),
  emitToAdmin: jest.fn(),
  emitToOrder: jest.fn(),
  emitDeliveryBroadcastForSeller: mockEmitDeliveryBroadcastForSeller,
  emitReturnBroadcastForCustomer: jest.fn(),
  retractDeliveryBroadcastForOrder: jest.fn(),
  emitDeliveryBroadcast: jest.fn(),
  registerOrderSocketGetter: jest.fn(),
}));

jest.unstable_mockModule("../app/models/deliveryAssignment.js", () => ({
  default: {
    create: mockDeliveryAssignmentCreate,
  },
}));

jest.unstable_mockModule("../app/services/workflow/jobSchedulerPort.js", () => ({
  scheduleSellerTimeout: jest.fn().mockResolvedValue(true),
  removeSellerTimeout: jest.fn().mockResolvedValue(true),
  scheduleDeliveryTimeout: mockScheduleDeliveryTimeout,
  removeDeliveryTimeout: jest.fn().mockResolvedValue(true),
  scheduleReturnPickupTimeout: jest.fn().mockResolvedValue(true),
  removeReturnPickupTimeout: jest.fn().mockResolvedValue(true),
}));

const mockOrderFindOne = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
const mockShipmentFindOne = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: mockOrderFindOne,
    findOneAndUpdate: mockOrderFindOneAndUpdate,
  },
}));

let mockShipmentInstance = null;

jest.unstable_mockModule("../app/models/shipment.js", () => {
  class MockShipment {
    constructor(data) {
      Object.assign(this, data);
      this._id = "mock-shipment-oid-1";
      this.timeline = [];
      mockShipmentInstance = this;
    }
    save = jest.fn().mockResolvedValue(this);
    static findOne = mockShipmentFindOne;
  }
  return { default: MockShipment };
});

jest.unstable_mockModule("../app/models/setting.js", () => ({
  default: {
    findOne: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        shadowfax: {
          forwardEnabled: true,
          autoShipmentCreation: true,
          autoServiceabilityCheck: true,
          environment: "sandbox",
          forwardToken: "test_forward_token",
        },
      }),
    }),
  },
}));

const { createForwardOrder } = await import(
  "../app/services/shadowfax/shadowfaxForwardService.js"
);
const { dispatchOrderToShadowfax } = await import(
  "../app/services/orderWorkflowService.js"
);
const { acceptOrder } = await import(
  "../app/controller/orderController.js"
);

describe("Shadowfax Exclusive Delivery Workflow Integration", () => {
  beforeEach(() => {
    mockAxios.mockReset();
    mockEmitOrderStatusUpdate.mockReset();
    mockEmitDeliveryBroadcastForSeller.mockReset();
    mockDeliveryAssignmentCreate.mockReset();
    mockScheduleDeliveryTimeout.mockReset();
    mockOrderFindOne.mockReset();
    mockOrderFindOneAndUpdate.mockReset();
    mockShipmentFindOne.mockReset();
    mockShipmentInstance = null;

    process.env.SHADOWFAX_FORWARD_TOKEN = "test_forward_token";
    process.env.SHADOWFAX_FORWARD_ENABLED = "true";
  });

  it("automatically creates a Shadowfax forward shipment and avoids captain broadcast", async () => {
    const mockOrder = {
      _id: "mongo-ord-1",
      orderId: "ORD-SFX-101",
      workflowVersion: 2,
      workflowStatus: "DELIVERY_SEARCH",
      status: "confirmed",
      paymentMode: "ONLINE",
      paymentBreakdown: { grandTotal: 450 },
      customer: {
        name: "Rohit Sharma",
        phone: "9876543210",
        email: "rohit@example.com",
      },
      seller: {
        shopName: "Metro Fresh",
        name: "Seller Manager",
        phone: "9811122233",
        address: "Shop 12, Indiranagar",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560038",
        location: { coordinates: [77.64, 12.97] },
      },
      address: {
        name: "Rohit Sharma",
        phone: "9876543210",
        address: "Flat 201, Sunrise Apts, Indiranagar",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560038",
        location: { lat: 12.97, lng: 77.64 },
      },
      items: [
        {
          name: "Fresh Milk",
          price: 60,
          quantity: 2,
          product: { sku: "SKU-MILK-1" },
        },
      ],
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

    // Mock Shadowfax API calls: 2 serviceability calls, 1 order creation call
    mockAxios
      .mockResolvedValueOnce({
        status: 200,
        data: [{ code: 560038, services: ["Marketplace"] }],
        headers: {},
      })
      .mockResolvedValueOnce({
        status: 200,
        data: [{ code: 560038, services: ["Marketplace"] }],
        headers: {},
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          data: {
            id: "SFX-LIVE-999",
            awb_number: "AWB-SFX-999",
          },
        },
        headers: {},
      });

    const shipment = await dispatchOrderToShadowfax("ORD-SFX-101", mockOrder);

    expect(shipment).toBeDefined();
    expect(shipment.shadowfaxOrderId).toBe("SFX-LIVE-999");
    expect(shipment.awbNumber).toBe("AWB-SFX-999");
    expect(shipment.deliveryProvider).toBe("shadowfax");
    expect(mockOrder.deliveryProvider).toBe("shadowfax");
    expect(mockOrder.awbNumber).toBe("AWB-SFX-999");

    // CRITICAL: Ensure internal captain broadcasting and timeouts were NOT invoked
    expect(mockDeliveryAssignmentCreate).not.toHaveBeenCalled();
    expect(mockEmitDeliveryBroadcastForSeller).not.toHaveBeenCalled();
    expect(mockScheduleDeliveryTimeout).not.toHaveBeenCalled();
  });

  it("stops shipment creation and returns error if customer pincode is missing", async () => {
    const mockOrderIncompleteAddress = {
      _id: "mongo-ord-2",
      orderId: "ORD-SFX-BAD-ADDR",
      workflowStatus: "SELLER_ACCEPTED",
      seller: {
        name: "Shop Keeper",
        phone: "9811122233",
        address: "Market Road",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400001",
      },
      customer: {
        name: "Ankit",
        phone: "9876543210",
      },
      address: {
        address: "Somewhere on MG Road", // No 6-digit pincode!
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "", // empty
      },
      save: jest.fn().mockResolvedValue(true),
    };

    mockOrderFindOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockOrderIncompleteAddress),
        }),
      }),
    });

    mockShipmentFindOne.mockResolvedValue(null);

    await expect(
      createForwardOrder("ORD-SFX-BAD-ADDR")
    ).rejects.toThrow("Customer delivery address is missing a valid 6-digit postal pincode.");

    expect(mockOrderIncompleteAddress.deliveryFailureReason).toContain("missing a valid 6-digit postal pincode");
    // Ensure no Axios call to Shadowfax was made
    expect(mockAxios).not.toHaveBeenCalled();
  });

  it("is idempotent: reuses active shipment and avoids duplicate API calls", async () => {
    const existingActiveShipment = {
      _id: "shipment-existing-1",
      internalOrderId: "ORD-SFX-IDEM",
      shadowfaxOrderId: "SFX-EXISTING-123",
      awbNumber: "AWB-EXISTING-123",
      shipmentStatus: "ORDER_CREATED",
      deliveryProvider: "shadowfax",
    };

    const mockOrder = {
      _id: "mongo-ord-3",
      orderId: "ORD-SFX-IDEM",
      customer: { phone: "9876543210" },
      seller: { phone: "9876543211" },
      save: jest.fn().mockResolvedValue(true),
    };

    mockOrderFindOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockOrder),
        }),
      }),
    });

    mockShipmentFindOne.mockResolvedValue(existingActiveShipment);

    const result = await createForwardOrder("ORD-SFX-IDEM");

    expect(result.shadowfaxOrderId).toBe("SFX-EXISTING-123");
    expect(result.awbNumber).toBe("AWB-EXISTING-123");
    // Axios must not be called because existing shipment was reused
    expect(mockAxios).not.toHaveBeenCalled();
  });

  it("handles serviceability failure without falling back to internal captain", async () => {
    const mockOrderUnserviceable = {
      _id: "mongo-ord-4",
      orderId: "ORD-SFX-UNSERV",
      workflowStatus: "SELLER_ACCEPTED",
      customer: {
        name: "Customer Remote",
        phone: "9876543210",
      },
      seller: {
        name: "City Store",
        phone: "9811122233",
        address: "City Center",
        city: "Delhi",
        state: "Delhi",
        pincode: "110001",
      },
      address: {
        name: "Remote Customer",
        phone: "9876543210",
        address: "Remote Village Pincode 999999",
        city: "Remote",
        state: "Remote State",
        pincode: "999999",
      },
      save: jest.fn().mockResolvedValue(true),
    };

    mockOrderFindOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockOrderUnserviceable),
        }),
      }),
    });

    mockShipmentFindOne.mockResolvedValue(null);

    // Mock Serviceability API: pickup serviceable, but delivery returns []
    mockAxios
      .mockResolvedValueOnce({
        status: 200,
        data: [{ code: 110001, services: ["Marketplace"] }],
      })
      .mockResolvedValueOnce({
        status: 200,
        data: [], // 999999 unserviceable!
      });

    await expect(
      createForwardOrder("ORD-SFX-UNSERV")
    ).rejects.toThrow("Delivery pincode 999999 is not serviceable by Shadowfax");

    expect(mockOrderUnserviceable.deliveryFailureReason).toContain("not serviceable by Shadowfax");
    // Ensure no order creation call was sent
    expect(mockAxios).toHaveBeenCalledTimes(2);
  });

  it("rejects internal delivery riders trying to accept a Shadowfax order", async () => {
    const mockShadowfaxOrder = {
      orderId: "ORD-SFX-LOCKED",
      deliveryProvider: "shadowfax",
      status: "pending",
      workflowVersion: 2,
    };

    mockOrderFindOne.mockResolvedValue(mockShadowfaxOrder);

    const req = {
      params: { orderId: "ORD-SFX-LOCKED" },
      user: { id: "rider-123", role: "delivery" },
      headers: {},
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await acceptOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Orders are delivered exclusively through Shadowfax logistics partner.",
      })
    );
  });
});
