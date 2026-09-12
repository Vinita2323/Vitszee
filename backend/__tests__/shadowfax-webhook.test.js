import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockWebhookCreate = jest.fn();
const mockShipmentFindOne = jest.fn();
const mockOrderFindOne = jest.fn();

jest.unstable_mockModule("../app/models/webhookEventLog.js", () => ({
  default: {
    create: mockWebhookCreate,
  },
}));

jest.unstable_mockModule("../app/models/shipment.js", () => ({
  default: {
    findOne: mockShipmentFindOne,
  },
}));

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: mockOrderFindOne,
  },
}));

jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({
  applyDeliveredSettlement: jest.fn().mockResolvedValue({}),
}));

const { processShadowfaxWebhook } = await import(
  "../app/services/shadowfax/shadowfaxWebhookService.js"
);

describe("Shadowfax Inbound Webhook Processing", () => {
  beforeEach(() => {
    mockWebhookCreate.mockReset();
    mockShipmentFindOne.mockReset();
    mockOrderFindOne.mockReset();
  });

  it("should ignore duplicate webhook events safely", async () => {
    const duplicateError = new Error("Duplicate key");
    duplicateError.code = 11000;
    mockWebhookCreate.mockRejectedValue(duplicateError);

    const payload = {
      event_id: "EVT-1001",
      order_id: "SFX-1001",
      client_order_id: "ORD-1001",
      status: "delivered",
    };

    const result = await processShadowfaxWebhook(payload, {}, "forward");
    expect(result.duplicate).toBe(true);
  });

  it("should process valid forward webhook, update shipment and order status", async () => {
    const mockEventLog = {
      processed: false,
      save: jest.fn().mockResolvedValue(true),
    };
    mockWebhookCreate.mockResolvedValue(mockEventLog);

    const mockShipment = {
      _id: "60d5ecb8b5c9c614b8c7e2b8",
      internalOrderId: "ORD-2001",
      providerType: "forward",
      shipmentStatus: "OUT_FOR_DELIVERY",
      timeline: [],
      save: jest.fn().mockResolvedValue(true),
    };
    mockShipmentFindOne.mockResolvedValue(mockShipment);

    const mockOrder = {
      orderId: "ORD-2001",
      workflowStatus: "OUT_FOR_DELIVERY",
      status: "out_for_delivery",
      save: jest.fn().mockResolvedValue(true),
    };
    mockOrderFindOne.mockResolvedValue(mockOrder);

    const payload = {
      event_id: "EVT-2001",
      client_order_id: "ORD-2001",
      awb_number: "AWB-2001",
      status: "delivered",
      rider_name: "Rahul Rider",
      rider_phone: "9876543210",
    };

    const result = await processShadowfaxWebhook(payload, {}, "forward");

    expect(result.success).toBe(true);
    expect(mockShipment.shipmentStatus).toBe("DELIVERED");
    expect(mockOrder.status).toBe("delivered");
    expect(mockOrder.workflowStatus).toBe("DELIVERED");
    expect(mockShipment.save).toHaveBeenCalled();
    expect(mockOrder.save).toHaveBeenCalled();
  });

  it("should process reverse webhook with QC results", async () => {
    const mockEventLog = {
      processed: false,
      save: jest.fn().mockResolvedValue(true),
    };
    mockWebhookCreate.mockResolvedValue(mockEventLog);

    const mockShipment = {
      _id: "60d5ecb8b5c9c614b8c7e2b7",
      internalOrderId: "ORD-3001",
      providerType: "reverse",
      providerStatus: "assigned",
      timeline: [],
      qcDetails: {},
      save: jest.fn().mockResolvedValue(true),
    };
    mockShipmentFindOne.mockResolvedValue(mockShipment);

    const mockOrder = {
      orderId: "ORD-3001",
      returnStatus: "return_pickup_assigned",
      save: jest.fn().mockResolvedValue(true),
    };
    mockOrderFindOne.mockResolvedValue(mockOrder);

    const payload = {
      event_id: "EVT-3001",
      client_order_id: "ORD-3001",
      status: "qc_passed",
      type: "REV",
      qc_status: "passed",
      qc_result: "Physical condition verified good",
    };

    const result = await processShadowfaxWebhook(payload, {}, "reverse");

    expect(result.success).toBe(true);
    expect(mockShipment.qcDetails.qcStatus).toBe("PASSED");
    expect(mockOrder.returnStatus).toBe("return_in_transit");
    expect(mockOrder.returnQcStatus).toBe("passed");
  });
});
