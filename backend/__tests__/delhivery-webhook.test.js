import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockWebhookCreate = jest.fn();
const mockShipmentFindOne = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
const mockApplyDeliveredSettlement = jest.fn();
const mockCompensateOrderCancellation = jest.fn();
const mockEmitNotificationEvent = jest.fn();

jest.unstable_mockModule("../app/models/webhookEventLog.js", () => ({
  default: { create: mockWebhookCreate },
}));

jest.unstable_mockModule("../app/models/shipment.js", () => ({
  default: { findOne: mockShipmentFindOne },
}));

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { findOne: jest.fn(), findOneAndUpdate: mockOrderFindOneAndUpdate, updateOne: jest.fn() },
}));

jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({
  applyDeliveredSettlement: mockApplyDeliveredSettlement,
}));

jest.unstable_mockModule("../app/services/orderCompensation.js", () => ({
  compensateOrderCancellation: mockCompensateOrderCancellation,
}));

jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: jest.fn(),
  emitToCustomer: jest.fn(),
  emitToSeller: jest.fn(),
}));

jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: mockEmitNotificationEvent,
}));

const { processDelhiveryWebhook } = await import("../app/services/delhivery/delhiveryWebhookService.js");

// Scan payload exactly as documented by Delhivery ("Tracking Via PUSH API - Web hook").
function scan(status, statusType = "UD", overrides = {}) {
  return {
    Shipment: {
      Status: {
        Status: status,
        StatusDateTime: `2026-09-26T17:10:${String(status.length).padStart(2, "0")}.767`,
        StatusType: statusType,
        StatusLocation: "Ahmedabad_Nikol (Gujarat)",
        Instructions: `${status} scan`,
        ...(overrides.Status || {}),
      },
      PickUpDate: "2026-09-26T17:10:42.543",
      NSLCode: "X-UCI",
      Sortcode: "IXC/MDP",
      ReferenceNo: "ORD-2001",
      AWB: "1234567890123",
      ...overrides,
    },
  };
}

function forwardShipment(shipmentStatus) {
  return {
    _id: "60d5ecb8b5c9c614b8c7e2b8",
    internalOrderId: "ORD-2001",
    awbNumber: "1234567890123",
    providerType: "forward",
    shipmentStatus,
    timeline: [],
    save: jest.fn().mockResolvedValue(true),
  };
}

describe("Delhivery scan webhook", () => {
  beforeEach(() => {
    mockWebhookCreate.mockReset();
    mockShipmentFindOne.mockReset();
    mockOrderFindOneAndUpdate.mockReset();
    mockApplyDeliveredSettlement.mockReset();
    mockCompensateOrderCancellation.mockReset();
    mockEmitNotificationEvent.mockReset();
    mockWebhookCreate.mockResolvedValue({ processed: false, save: jest.fn().mockResolvedValue(true) });
  });

  it("ignores a repeated scan", async () => {
    const duplicate = new Error("Duplicate key");
    duplicate.code = 11000;
    mockWebhookCreate.mockRejectedValue(duplicate);

    const result = await processDelhiveryWebhook(scan("Delivered", "DL"), {});
    expect(result.duplicate).toBe(true);
  });

  it("derives a stable event id from AWB, status and scan time", async () => {
    mockShipmentFindOne.mockResolvedValue(null);
    await processDelhiveryWebhook(scan("In Transit"), {});
    await processDelhiveryWebhook(scan("In Transit"), {});

    const ids = mockWebhookCreate.mock.calls.map(([doc]) => doc.eventId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).toContain("1234567890123:In Transit:");
  });

  it("does not store auth headers in the event log", async () => {
    mockShipmentFindOne.mockResolvedValue(null);
    await processDelhiveryWebhook(scan("In Transit"), { authorization: "Token super-secret", "content-type": "application/json" });

    const [doc] = mockWebhookCreate.mock.calls[0];
    expect(doc.headers.authorization).toBe("[REDACTED]");
    expect(doc.headers["content-type"]).toBe("application/json");
  });

  it("moves the order forward on an in-transit scan", async () => {
    const shipment = forwardShipment("ORDER_CREATED");
    mockShipmentFindOne.mockResolvedValue(shipment);
    mockOrderFindOneAndUpdate.mockResolvedValue({ orderId: "ORD-2001", customer: "c1", seller: "s1" });

    const result = await processDelhiveryWebhook(scan("In Transit"), {});

    expect(result.success).toBe(true);
    expect(mockShipmentFindOne).toHaveBeenCalledWith({ awbNumber: "1234567890123" });
    expect(shipment.shipmentStatus).toBe("IN_TRANSIT");
    expect(mockOrderFindOneAndUpdate.mock.calls[0][1].$set.workflowStatus).toBe("PICKUP_READY");
  });

  it("settles the order once when Delhivery reports delivery", async () => {
    const shipment = forwardShipment("OUT_FOR_DELIVERY");
    mockShipmentFindOne.mockResolvedValue(shipment);
    const deliveredOrder = { orderId: "ORD-2001", customer: "c1", seller: "s1" };
    mockOrderFindOneAndUpdate.mockResolvedValue(deliveredOrder);

    await processDelhiveryWebhook(scan("Delivered", "DL"), {});

    expect(shipment.shipmentStatus).toBe("DELIVERED");
    expect(shipment.deliveredAt).toBeInstanceOf(Date);
    expect(mockApplyDeliveredSettlement).toHaveBeenCalledWith(deliveredOrder, "ORD-2001");
    expect(mockEmitNotificationEvent).toHaveBeenCalledWith("ORDER_DELIVERED", expect.objectContaining({ orderId: "ORD-2001" }));
  });

  it("cancels and refunds the order when the parcel goes back to the seller (RTO)", async () => {
    const shipment = forwardShipment("OUT_FOR_DELIVERY");
    mockShipmentFindOne.mockResolvedValue(shipment);
    const cancelledOrder = { orderId: "ORD-2001", customer: "c1", seller: "s1" };
    mockOrderFindOneAndUpdate.mockResolvedValue(cancelledOrder);

    await processDelhiveryWebhook(scan("RTO", "RT"), {});

    expect(shipment.shipmentStatus).toBe("FAILED");
    expect(mockOrderFindOneAndUpdate.mock.calls[0][1].$set).toEqual(
      expect.objectContaining({ workflowStatus: "CANCELLED", status: "cancelled", cancelledBy: "system" })
    );
    expect(mockCompensateOrderCancellation).toHaveBeenCalledWith(cancelledOrder, "ORD-2001", expect.any(Object));
  });

  it("records an unknown scan without changing the state", async () => {
    const shipment = forwardShipment("IN_TRANSIT");
    mockShipmentFindOne.mockResolvedValue(shipment);

    await processDelhiveryWebhook(scan("Some new wording", "XX"), {});

    expect(shipment.shipmentStatus).toBe("IN_TRANSIT");
    expect(shipment.providerStatus).toBe("Some new wording");
    expect(shipment.timeline).toHaveLength(1);
    expect(mockOrderFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("ignores a scan that arrives out of order", async () => {
    const shipment = forwardShipment("DELIVERED");
    mockShipmentFindOne.mockResolvedValue(shipment);

    await processDelhiveryWebhook(scan("In Transit"), {});

    expect(shipment.shipmentStatus).toBe("DELIVERED");
    expect(mockOrderFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("falls back to the order reference when the AWB is unknown to us", async () => {
    mockShipmentFindOne.mockResolvedValueOnce(null).mockResolvedValueOnce(forwardShipment("ORDER_CREATED"));
    mockOrderFindOneAndUpdate.mockResolvedValue({ orderId: "ORD-2001" });

    const result = await processDelhiveryWebhook(scan("In Transit"), {});

    expect(result.success).toBe(true);
    expect(mockShipmentFindOne.mock.calls[1][0]).toEqual(
      expect.objectContaining({ providerType: "forward" })
    );
  });
});
