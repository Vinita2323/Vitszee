import { jest } from "@jest/globals";

const mockOrderFindOne = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
const mockDeliveryAssignmentCreate = jest.fn();
const mockEmitOrderStatusUpdate = jest.fn();
const mockEmitToSeller = jest.fn();
const mockEmitToOrder = jest.fn();
const mockEmitDeliveryBroadcastForSeller = jest.fn();
const mockEmitNotificationEvent = jest.fn();
const mockCompensateOrderCancellation = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: mockOrderFindOne,
    findOneAndUpdate: mockOrderFindOneAndUpdate,
    find: jest.fn(),
  },
}));

jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  requireCanonicalOrderId: jest.fn((id) => Promise.resolve(id)),
  orderMatchQueryFromRouteParam: jest.fn((id) => ({ orderId: id })),
}));

jest.unstable_mockModule("../app/models/deliveryAssignment.js", () => ({
  default: {
    create: mockDeliveryAssignmentCreate,
  },
}));

jest.unstable_mockModule("../app/models/setting.js", () => ({
  default: {
    findOne: jest.fn().mockResolvedValue({ paymentTimeoutMinutes: 10 }),
  },
}));

jest.unstable_mockModule("../app/models/orderOtp.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/seller.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/delivery.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/services/firebaseService.js", () => ({
  clearOrderTracking: jest.fn(),
  clearRiderPresence: jest.fn(),
}));

jest.unstable_mockModule("../app/services/workflow/jobSchedulerPort.js", () => ({
  scheduleSellerTimeout: jest.fn().mockResolvedValue(true),
  removeSellerTimeout: jest.fn().mockResolvedValue(true),
  scheduleDeliveryTimeout: jest.fn().mockResolvedValue(true),
  removeDeliveryTimeout: jest.fn().mockResolvedValue(true),
  scheduleReturnPickupTimeout: jest.fn().mockResolvedValue(true),
  removeReturnPickupTimeout: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: mockEmitOrderStatusUpdate,
  emitToSeller: mockEmitToSeller,
  emitDeliveryBroadcastForSeller: mockEmitDeliveryBroadcastForSeller,
  emitReturnBroadcastForCustomer: jest.fn(),
  emitToCustomer: jest.fn(),
  emitToOrder: mockEmitToOrder,
  retractDeliveryBroadcastForOrder: jest.fn(),
}));

jest.unstable_mockModule("../app/services/orderCompensation.js", () => ({
  compensateOrderCancellation: mockCompensateOrderCancellation,
}));

jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({
  applyDeliveredSettlement: jest.fn(),
}));

jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: mockEmitNotificationEvent,
}));

jest.unstable_mockModule("../app/utils/geoUtils.js", () => ({
  distanceMeters: jest.fn(),
}));

const {
  sellerAcceptAtomic,
  sellerRejectAtomic,
  processSellerTimeoutJob,
  executeOrderAcceptance,
} = await import("../app/services/orderWorkflowService.js");

describe("Seller Auto-Accept 20s Workflow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // These tests cover seller acceptance only; keep courier dispatch out of the way
    // so no Delhivery call is attempted.
    process.env.DELHIVERY_FORWARD_ENABLED = "false";
  });

  describe("executeOrderAcceptance", () => {
    it("atomically accepts order with acceptedBy: 'SELLER' and autoAccepted: false", async () => {
      const mockOrder = {
        _id: "mongo-1",
        orderId: "ORD100",
        paymentMode: "COD",
        paymentStatus: "CREATED",
        seller: "seller-1",
        customer: "cust-1",
        workflowStatus: "SELLER_PENDING",
        sellerResponseStatus: "PENDING",
      };

      mockOrderFindOne.mockResolvedValue(mockOrder);

      const updatedOrder = {
        ...mockOrder,
        workflowStatus: "DELIVERY_SEARCH",
        sellerResponseStatus: "ACCEPTED",
        acceptedBy: "SELLER",
        autoAccepted: false,
        deliverySearchExpiresAt: new Date(),
        customer: { _id: "cust-1", name: "John", phone: "1234567890" },
        seller: { _id: "seller-1", shopName: "Best Mart" },
      };

      const populateChain = {
        populate: jest.fn().mockReturnThis(),
      };
      populateChain.populate
        .mockReturnValueOnce(populateChain)
        .mockResolvedValueOnce(updatedOrder);

      mockOrderFindOneAndUpdate.mockReturnValue(populateChain);

      const result = await executeOrderAcceptance({
        orderId: "ORD100",
        sellerId: "seller-1",
        acceptedBy: "SELLER",
        isAutoAccepted: false,
      });

      expect(result).toBeDefined();
      expect(result.acceptedBy).toBe("SELLER");
      expect(result.autoAccepted).toBe(false);
      expect(result.sellerResponseStatus).toBe("ACCEPTED");

      expect(mockOrderFindOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: "mongo-1",
          workflowStatus: "SELLER_PENDING",
          sellerResponseStatus: "PENDING",
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            acceptedBy: "SELLER",
            autoAccepted: false,
            sellerResponseStatus: "ACCEPTED",
          }),
        }),
        expect.any(Object)
      );

      expect(mockDeliveryAssignmentCreate).not.toHaveBeenCalled();
      expect(mockEmitDeliveryBroadcastForSeller).not.toHaveBeenCalled();
      expect(mockEmitOrderStatusUpdate).toHaveBeenCalled();
    });

    it("atomically accepts order with acceptedBy: 'SYSTEM' and autoAccepted: true", async () => {
      const mockOrder = {
        _id: "mongo-2",
        orderId: "ORD200",
        paymentMode: "COD",
        paymentStatus: "CREATED",
        seller: "seller-1",
        customer: "cust-1",
        workflowStatus: "SELLER_PENDING",
        sellerResponseStatus: "PENDING",
      };

      mockOrderFindOne.mockResolvedValue(mockOrder);

      const updatedOrder = {
        ...mockOrder,
        workflowStatus: "DELIVERY_SEARCH",
        sellerResponseStatus: "AUTO_ACCEPTED",
        acceptedBy: "SYSTEM",
        autoAccepted: true,
        deliverySearchExpiresAt: new Date(),
        customer: { _id: "cust-1", name: "John", phone: "1234567890" },
        seller: { _id: "seller-1", shopName: "Best Mart" },
      };

      const populateChain = {
        populate: jest.fn().mockReturnThis(),
      };
      populateChain.populate
        .mockReturnValueOnce(populateChain)
        .mockResolvedValueOnce(updatedOrder);

      mockOrderFindOneAndUpdate.mockReturnValue(populateChain);

      const result = await executeOrderAcceptance({
        orderId: "ORD200",
        sellerId: "seller-1",
        acceptedBy: "SYSTEM",
        isAutoAccepted: true,
      });

      expect(result).toBeDefined();
      expect(result.acceptedBy).toBe("SYSTEM");
      expect(result.autoAccepted).toBe(true);
      expect(result.sellerResponseStatus).toBe("AUTO_ACCEPTED");
    });
  });

  describe("sellerAcceptAtomic", () => {
    it("rejects with 409 if order deadline has already passed", async () => {
      mockOrderFindOne.mockResolvedValue(null);

      await expect(sellerAcceptAtomic("seller-1", "ORD-EXPIRED")).rejects.toThrow(
        "Order not available for acceptance or expired"
      );
    });
  });

  describe("sellerRejectAtomic", () => {
    it("successfully cancels order and marks sellerResponseStatus as REJECTED", async () => {
      const cancelledOrder = {
        _id: "mongo-3",
        orderId: "ORD300",
        seller: "seller-1",
        customer: "cust-1",
        workflowStatus: "CANCELLED",
        status: "cancelled",
        sellerResponseStatus: "REJECTED",
      };

      mockOrderFindOneAndUpdate.mockResolvedValue(cancelledOrder);

      const result = await sellerRejectAtomic("seller-1", "ORD300");

      expect(result.sellerResponseStatus).toBe("REJECTED");
      expect(result.workflowStatus).toBe("CANCELLED");
      expect(mockCompensateOrderCancellation).toHaveBeenCalledWith(
        cancelledOrder,
        "ORD300"
      );
    });

    it("rejects with 409 if order is not pending or already handled", async () => {
      mockOrderFindOneAndUpdate.mockResolvedValue(null);

      await expect(sellerRejectAtomic("seller-1", "ORD-NONE")).rejects.toThrow(
        "Order not available to reject or already expired/accepted"
      );
    });
  });

  describe("processSellerTimeoutJob (Auto-Accept)", () => {
    it("auto-accepts order when deadline has expired", async () => {
      const pastDeadline = new Date(Date.now() - 5000);
      const mockOrder = {
        _id: "mongo-4",
        orderId: "ORD400",
        workflowVersion: 2,
        workflowStatus: "SELLER_PENDING",
        sellerResponseStatus: "PENDING",
        sellerResponseDeadline: pastDeadline,
        seller: "seller-1",
        customer: "cust-1",
        paymentMode: "COD",
      };

      mockOrderFindOne
        .mockResolvedValueOnce(mockOrder)
        .mockResolvedValueOnce(mockOrder);

      const updatedOrder = {
        ...mockOrder,
        workflowStatus: "DELIVERY_SEARCH",
        status: "confirmed",
        sellerResponseStatus: "AUTO_ACCEPTED",
        acceptedBy: "SYSTEM",
        autoAccepted: true,
        deliverySearchExpiresAt: new Date(),
        customer: { _id: "cust-1", name: "Alice" },
        seller: { _id: "seller-1", shopName: "Quick Mart" },
      };

      const populateChain = {
        populate: jest.fn().mockReturnThis(),
      };
      populateChain.populate
        .mockReturnValueOnce(populateChain)
        .mockResolvedValueOnce(updatedOrder);

      mockOrderFindOneAndUpdate.mockReturnValue(populateChain);

      const result = await processSellerTimeoutJob({ orderId: "ORD400" });

      expect(result).toBeDefined();
      expect(result.autoAccepted).toBe(true);
      expect(result.acceptedBy).toBe("SYSTEM");
      expect(result.sellerResponseStatus).toBe("AUTO_ACCEPTED");

      expect(mockEmitToSeller).toHaveBeenCalledWith(
        "seller-1",
        expect.objectContaining({
          event: "order:auto_accepted",
          payload: expect.objectContaining({
            orderId: "ORD400",
            autoAccepted: true,
            acceptedBy: "SYSTEM",
          }),
        })
      );
    });

    it("does NOT auto-accept prematurely if deadline has not elapsed", async () => {
      const futureDeadline = new Date(Date.now() + 15000);
      const mockOrder = {
        _id: "mongo-5",
        orderId: "ORD500",
        workflowVersion: 2,
        workflowStatus: "SELLER_PENDING",
        sellerResponseStatus: "PENDING",
        sellerResponseDeadline: futureDeadline,
      };

      mockOrderFindOne.mockResolvedValue(mockOrder);

      const result = await processSellerTimeoutJob({ orderId: "ORD500" });

      expect(result).toBeNull();
      expect(mockOrderFindOneAndUpdate).not.toHaveBeenCalled();
    });

    it("is completely idempotent if run twice", async () => {
      mockOrderFindOne.mockResolvedValue(null);

      const result = await processSellerTimeoutJob({ orderId: "ORD-ALREADY-ACCEPTED" });

      expect(result).toBeNull();
      expect(mockOrderFindOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
