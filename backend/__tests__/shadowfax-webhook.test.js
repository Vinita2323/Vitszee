import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockWebhookCreate = jest.fn();
const mockShipmentFindOne = jest.fn();
const mockOrderFindOne = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
const mockApplyDeliveredSettlement = jest.fn();
const mockCompensateOrderCancellation = jest.fn();
const mockEmitNotificationEvent = jest.fn();

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
    findOneAndUpdate: mockOrderFindOneAndUpdate,
    updateOne: jest.fn(),
  },
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

const { processShadowfaxWebhook } = await import(
  "../app/services/shadowfax/shadowfaxWebhookService.js"
);

// Push callback body as documented by Shadowfax (Unified API, "Push Callback API").
function pushPayload(overrides = {}) {
  return {
    awb_number: "SF610198449AAA",
    order_id: "ORD-2001",
    event_timestamp: "2023-05-18 16:22:13",
    current_location: "CHN_Ambattur_EXP",
    comments: "Item Delivered at CHN_Ambattur_EXP",
    event: "delivered",
    status: "Delivered",
    otp_verified: "Y",
    rider_name: null,
    rider_contact: null,
    client_id: 2245,
    type: "FWD",
    ...overrides,
  };
}

function forwardShipment(shipmentStatus) {
  return {
    _id: "60d5ecb8b5c9c614b8c7e2b8",
    internalOrderId: "ORD-2001",
    awbNumber: "SF610198449AAA",
    providerType: "forward",
    shipmentStatus,
    timeline: [],
    save: jest.fn().mockResolvedValue(true),
  };
}

describe("Shadowfax Inbound Webhook Processing", () => {
  beforeEach(() => {
    mockWebhookCreate.mockReset();
    mockShipmentFindOne.mockReset();
    mockOrderFindOne.mockReset();
    mockOrderFindOneAndUpdate.mockReset();
    mockApplyDeliveredSettlement.mockReset();
    mockCompensateOrderCancellation.mockReset();
    mockEmitNotificationEvent.mockReset();
    mockWebhookCreate.mockResolvedValue({ processed: false, save: jest.fn().mockResolvedValue(true) });
  });

  it("should ignore duplicate webhook events safely", async () => {
    const duplicateError = new Error("Duplicate key");
    duplicateError.code = 11000;
    mockWebhookCreate.mockRejectedValue(duplicateError);

    const result = await processShadowfaxWebhook(pushPayload({ event_id: "EVT-1001" }), {}, "forward");
    expect(result.duplicate).toBe(true);
  });

  it("derives a stable event id from AWB, status and event_timestamp so retries dedupe", async () => {
    mockShipmentFindOne.mockResolvedValue(null);

    await processShadowfaxWebhook(pushPayload(), {}, "forward");
    await processShadowfaxWebhook(pushPayload(), {}, "forward");

    const ids = mockWebhookCreate.mock.calls.map(([doc]) => doc.eventId);
    expect(ids[0]).toBe("SF610198449AAA:delivered:2023-05-18 16:22:13");
    expect(ids[1]).toBe(ids[0]);
  });

  it("does not store webhook auth headers in the event log", async () => {
    mockShipmentFindOne.mockResolvedValue(null);

    await processShadowfaxWebhook(pushPayload(), { authorization: "Token secret-value", "content-type": "application/json" }, "forward");

    const [doc] = mockWebhookCreate.mock.calls[0];
    expect(doc.headers.authorization).toBe("[REDACTED]");
    expect(doc.headers["content-type"]).toBe("application/json");
  });

  it("marks the order delivered and settles it with the order id", async () => {
    const shipment = forwardShipment("OUT_FOR_DELIVERY");
    mockShipmentFindOne.mockResolvedValue(shipment);
    const deliveredOrder = { _id: "o1", orderId: "ORD-2001", customer: "c1", seller: "s1" };
    mockOrderFindOneAndUpdate.mockResolvedValue(deliveredOrder);

    const result = await processShadowfaxWebhook(pushPayload(), {}, "forward");

    expect(result.success).toBe(true);
    expect(mockShipmentFindOne).toHaveBeenCalledWith({ awbNumber: "SF610198449AAA" });
    expect(shipment.shipmentStatus).toBe("DELIVERED");
    expect(shipment.deliveredAt).toBeInstanceOf(Date);
    const [filter, update] = mockOrderFindOneAndUpdate.mock.calls[0];
    expect(filter.orderId).toBe("ORD-2001");
    expect(filter.workflowStatus.$nin).toEqual(expect.arrayContaining(["DELIVERED", "CANCELLED"]));
    expect(update.$set).toEqual(expect.objectContaining({ workflowStatus: "DELIVERED", status: "delivered" }));
    expect(mockApplyDeliveredSettlement).toHaveBeenCalledWith(deliveredOrder, "ORD-2001");
  });

  it("uses the event id, not the display text, for out-for-delivery", async () => {
    const shipment = forwardShipment("IN_TRANSIT");
    mockShipmentFindOne.mockResolvedValue(shipment);
    mockOrderFindOneAndUpdate.mockResolvedValue({ orderId: "ORD-2001", customer: "c1", seller: "s1" });

    await processShadowfaxWebhook(
      pushPayload({ event: "ofd", status: "Out For Delivery", comments: "Item OFD", rider_name: "Ravi", rider_contact: "9876543210" }),
      {},
      "forward"
    );

    expect(shipment.shipmentStatus).toBe("OUT_FOR_DELIVERY");
    expect(shipment.rider.name).toBe("Ravi");
    expect(mockOrderFindOneAndUpdate.mock.calls[0][1].$set.workflowStatus).toBe("OUT_FOR_DELIVERY");
  });

  it("does not show 'out for delivery' when a rider is only assigned for pickup", async () => {
    const shipment = forwardShipment("ORDER_CREATED");
    mockShipmentFindOne.mockResolvedValue(shipment);
    mockOrderFindOneAndUpdate.mockResolvedValue({ orderId: "ORD-2001" });

    await processShadowfaxWebhook(
      pushPayload({ event: "assigned_for_seller_pickup", status: "Assigned For Pickup" }),
      {},
      "forward"
    );

    expect(shipment.shipmentStatus).toBe("RIDER_ASSIGNED");
    expect(mockOrderFindOneAndUpdate.mock.calls[0][1].$set.workflowStatus).toBe("DELIVERY_ASSIGNED");
  });

  it("cancels the order with compensation when the seller cancels at Shadowfax", async () => {
    const shipment = forwardShipment("RIDER_ASSIGNED");
    mockShipmentFindOne.mockResolvedValue(shipment);
    const cancelledOrder = { _id: "o1", orderId: "ORD-2001", customer: "c1", seller: "s1" };
    mockOrderFindOneAndUpdate.mockResolvedValue(cancelledOrder);

    await processShadowfaxWebhook(
      pushPayload({ event: "cancelled_by_seller", status: "Cancelled by Seller", comments: "Item cancelled by seller" }),
      {},
      "forward"
    );

    expect(shipment.shipmentStatus).toBe("CANCELLED");
    expect(mockOrderFindOneAndUpdate.mock.calls[0][1].$set).toEqual(
      expect.objectContaining({ workflowStatus: "CANCELLED", status: "cancelled", cancelledBy: "system" })
    );
    expect(mockCompensateOrderCancellation).toHaveBeenCalledWith(cancelledOrder, "ORD-2001", expect.any(Object));
  });

  it("records exception statuses without changing shipment or order state", async () => {
    const shipment = forwardShipment("OUT_FOR_DELIVERY");
    mockShipmentFindOne.mockResolvedValue(shipment);

    await processShadowfaxWebhook(pushPayload({ event: "nc", status: "Not Contactable" }), {}, "forward");

    expect(shipment.shipmentStatus).toBe("OUT_FOR_DELIVERY");
    expect(shipment.providerStatus).toBe("nc");
    expect(shipment.timeline).toHaveLength(1);
    expect(mockOrderFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("should process reverse webhook with QC results", async () => {
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
