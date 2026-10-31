import { jest } from "@jest/globals";
import mongoose from "mongoose";
import { createFakeModel } from "./helpers/fakeCollection.js";

/**
 * Captain Shift & Cash Settlement Test Suite.
 * Fakes MongoDB models and notification emitters; tests actual domain services
 * and controller/route logic.
 */

// Fake Models
const Shift = createFakeModel({
  uniqueActive: { flag: "status", key: "captain" },
});
const Delivery = createFakeModel();
const Order = createFakeModel();
const CashCollection = createFakeModel();
const CashDeposit = createFakeModel();
const CashDiscrepancy = createFakeModel();
const CashLimitOverride = createFakeModel();
const CashSettlementAudit = createFakeModel();

// Session mock for transactions
const mockSession = {
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  abortTransaction: jest.fn(),
  endSession: jest.fn(),
  withTransaction: jest.fn(async (fn) => fn()),
};

jest.spyOn(mongoose, "startSession").mockImplementation(async () => mockSession);

// Mock external service dependencies
const mockReconcileCodCash = jest.fn(async (orderId, amount, partnerId, opts = {}) => {
  const row = Order.rows.find((r) => String(r._id) === String(orderId) || r.orderId === orderId);
  if (row && row.paymentBreakdown) {
    const curPending = row.paymentBreakdown.codPendingAmount || 0;
    row.paymentBreakdown.codPendingAmount = Math.max(0, curPending - amount);
    row.paymentBreakdown.codCollectedAmount = (row.paymentBreakdown.codCollectedAmount || 0) + amount;
  }
  return row;
});

jest.unstable_mockModule("../app/models/shift.js", () => ({ default: Shift }));
jest.unstable_mockModule("../app/models/delivery.js", () => ({ default: Delivery }));
jest.unstable_mockModule("../app/models/order.js", () => ({ default: Order }));
jest.unstable_mockModule("../app/models/cashCollection.js", () => ({ default: CashCollection }));
jest.unstable_mockModule("../app/models/cashDeposit.js", () => ({ default: CashDeposit }));
jest.unstable_mockModule("../app/models/cashDiscrepancy.js", () => ({ default: CashDiscrepancy }));
jest.unstable_mockModule("../app/models/cashLimitOverride.js", () => ({ default: CashLimitOverride }));
jest.unstable_mockModule("../app/models/cashSettlementAudit.js", () => ({
  default: CashSettlementAudit,
  auditHash: () => "mock-hash",
}));
jest.unstable_mockModule("../app/models/transaction.js", () => ({ default: createFakeModel() }));

jest.unstable_mockModule("../app/services/finance/orderFinanceService.js", () => ({
  reconcileCodCash: mockReconcileCodCash,
}));

jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: jest.fn(),
}));

jest.unstable_mockModule("../app/services/mediaService.js", () => ({
  uploadToCloudinary: jest.fn(async () => "https://cloudinary.test/proof.jpg"),
}));

jest.unstable_mockModule("../app/services/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Dynamic import of target services
const shiftService = await import("../app/services/cashSettlement/shiftService.js");
const limitService = await import("../app/services/cashSettlement/limitService.js");
const depositService = await import("../app/services/cashSettlement/depositService.js");
const positionService = await import("../app/services/cashSettlement/position.js");
const controller = await import("../app/controller/cashSettlementController.js");

const CAPTAIN_ID = "507f1f77bcf86cd799439011";
const ADMIN_ID = "507f1f77bcf86cd799439099";

describe("Captain Shift & Cash Settlement Architecture", () => {
  beforeEach(() => {
    Shift.reset();
    Delivery.reset();
    Order.reset();
    CashCollection.reset();
    CashDeposit.reset();
    CashDiscrepancy.reset();
    CashLimitOverride.reset();
    CashSettlementAudit.reset();
    jest.clearAllMocks();

    // Default active captain
    Delivery.seed({
      _id: CAPTAIN_ID,
      name: "Rider Test",
      phone: "9876543210",
      isActive: true,
      isVerified: true,
    });
  });

  /* ─────────────────────── Shift Management ─────────────────────── */

  describe("Shift Management (shiftService)", () => {
    it("starts a shift for an active captain", async () => {
      const shift = await shiftService.startShift(CAPTAIN_ID);

      expect(shift).toBeDefined();
      expect(shift.shiftId).toMatch(/^SHF-\d{8}-[A-F0-9]{6}$/);
      expect(shift.status).toBe("ACTIVE");
      expect(String(shift.captain)).toBe(CAPTAIN_ID);

      const active = await shiftService.getActiveShift(CAPTAIN_ID);
      expect(active).not.toBeNull();
      expect(active.shiftId).toBe(shift.shiftId);
    });

    it("rejects starting a shift if captain already has an active shift", async () => {
      await shiftService.startShift(CAPTAIN_ID);

      await expect(shiftService.startShift(CAPTAIN_ID)).rejects.toMatchObject({
        statusCode: 409,
        code: "SHIFT_ALREADY_ACTIVE",
      });
    });

    it("rejects starting a shift if captain account is inactive", async () => {
      const inactiveCaptainId = "507f1f77bcf86cd799439022";
      Delivery.seed({
        _id: inactiveCaptainId,
        name: "Inactive Rider",
        isActive: false,
      });

      await expect(shiftService.startShift(inactiveCaptainId)).rejects.toMatchObject({
        statusCode: 403,
        code: "ACCOUNT_INACTIVE",
      });
    });

    it("assertActiveShiftForCash enforces active shift requirement for COD", async () => {
      // Without active shift -> rejects
      await expect(shiftService.assertActiveShiftForCash(CAPTAIN_ID)).rejects.toMatchObject({
        statusCode: 409,
        code: "SHIFT_REQUIRED",
      });

      // After starting shift -> passes
      await shiftService.startShift(CAPTAIN_ID);
      const shift = await shiftService.assertActiveShiftForCash(CAPTAIN_ID);
      expect(shift).toBeDefined();
      expect(shift.status).toBe("ACTIVE");
    });

    it("rejects ending a shift while deliveries are still in progress", async () => {
      await shiftService.startShift(CAPTAIN_ID);

      Order.seed({
        orderId: "ORD-ACTIVE-1",
        deliveryBoy: new mongoose.Types.ObjectId(CAPTAIN_ID),
        status: "out_for_delivery",
        orderStatus: "out_for_delivery",
      });

      await expect(shiftService.endShift(CAPTAIN_ID)).rejects.toMatchObject({
        statusCode: 409,
        code: "ACTIVE_ORDERS_PENDING",
      });
    });

    it("successfully ends a shift when all orders are completed", async () => {
      await shiftService.startShift(CAPTAIN_ID);

      const closed = await shiftService.endShift(CAPTAIN_ID);
      expect(closed.shift.status).toBe("CLOSED");
      expect(closed.shift.endedAt).toBeInstanceOf(Date);
      expect(closed.shift.dueAt).toBeInstanceOf(Date);
      expect(closed.totals).toBeDefined();

      const active = await shiftService.getActiveShift(CAPTAIN_ID);
      expect(active).toBeNull();
    });
  });

  /* ─────────────────────── Cash Limit Enforcement ─────────────────────── */

  describe("Cash Limit Enforcement (limitService)", () => {
    it("allows COD order assignments when overdue cash is within limit", async () => {
      const state = await limitService.assertCodAssignmentAllowed(CAPTAIN_ID);
      expect(state.blocked).toBe(false);
      expect(state.pendingCash).toBe(0);
    });

    it("blocks new COD assignments when overdue pending cash exceeds the limit", async () => {
      // Create a closed past shift with dueAt in the past
      const pastShift = Shift.seed({
        shiftId: "SHF-PAST-1",
        captain: new mongoose.Types.ObjectId(CAPTAIN_ID),
        status: "CLOSED",
        endedAt: new Date(Date.now() - 48 * 3600 * 1000),
        dueAt: new Date(Date.now() - 24 * 3600 * 1000), // overdue!
      });

      const orderOid = new mongoose.Types.ObjectId();
      Order.seed({
        _id: orderOid,
        orderId: "ORD-COD-OVERDUE",
        paymentBreakdown: { codPendingAmount: 6000 }, // limit is 5000
      });

      CashCollection.seed({
        shift: pastShift._id,
        captain: new mongoose.Types.ObjectId(CAPTAIN_ID),
        order: orderOid,
        orderId: "ORD-COD-OVERDUE",
        amount: 6000,
        countsTowardCash: true,
        collectedAt: pastShift.endedAt,
      });

      await expect(limitService.assertCodAssignmentAllowed(CAPTAIN_ID)).rejects.toMatchObject({
        statusCode: 403,
        code: "CASH_LIMIT_EXCEEDED",
      });
    });

    it("permits COD assignment when an active admin override is present", async () => {
      const pastShift = Shift.seed({
        shiftId: "SHF-PAST-2",
        captain: new mongoose.Types.ObjectId(CAPTAIN_ID),
        status: "CLOSED",
        endedAt: new Date(Date.now() - 48 * 3600 * 1000),
        dueAt: new Date(Date.now() - 24 * 3600 * 1000),
      });

      const orderOid = new mongoose.Types.ObjectId();
      Order.seed({
        _id: orderOid,
        orderId: "ORD-COD-2",
        paymentBreakdown: { codPendingAmount: 8000 },
      });

      CashCollection.seed({
        shift: pastShift._id,
        captain: new mongoose.Types.ObjectId(CAPTAIN_ID),
        order: orderOid,
        amount: 8000,
        countsTowardCash: true,
        collectedAt: pastShift.endedAt,
      });

      // Grant admin override for 4 hours
      CashLimitOverride.seed({
        captain: new mongoose.Types.ObjectId(CAPTAIN_ID),
        grantedBy: new mongoose.Types.ObjectId(ADMIN_ID),
        expiresAt: new Date(Date.now() + 4 * 3600 * 1000),
        reason: "Heavy festival rush, cash deposit promised at end of day",
        revokedAt: null,
      });

      const state = await limitService.assertCodAssignmentAllowed(CAPTAIN_ID);
      expect(state.blocked).toBe(false);
      expect(state.override).not.toBeNull();
      expect(state.override.reason).toContain("Heavy festival rush");
    });
  });

  /* ─────────────────────── Deposits & Reconciliation ─────────────────────── */

  describe("Deposit Submission & FIFO Reconciliation (depositService)", () => {
    beforeEach(() => {
      // Seed pending cash for the captain so deposits can be accepted
      const o = new mongoose.Types.ObjectId();
      Order.seed({
        _id: o,
        orderId: "ORD-PENDING-INIT",
        paymentBreakdown: { codPendingAmount: 5000, codCollectedAmount: 0 },
      });
      CashCollection.seed({
        captain: new mongoose.Types.ObjectId(CAPTAIN_ID),
        order: o,
        orderId: "ORD-PENDING-INIT",
        amount: 5000,
        countsTowardCash: true,
        collectedAt: new Date(Date.now() - 10000),
      });
    });

    it("submits a bank/UPI deposit and enforces submission validation", async () => {
      const res = await depositService.submitDeposit({
        captainId: CAPTAIN_ID,
        method: "BANK_UPI",
        amount: 2500,
        utr: "SBIN1234567890",
        proofUrl: "https://cloudinary.test/proof.jpg",
      });

      expect(res.duplicate).toBe(false);
      expect(res.deposit.status).toBe("SUBMITTED");
      expect(res.deposit.amount).toBe(2500);
      expect(res.deposit.method).toBe("BANK_UPI");
      expect(res.deposit.utr).toBe("SBIN1234567890");

      // Reject non-positive amounts
      await expect(
        depositService.submitDeposit({
          captainId: CAPTAIN_ID,
          method: "BANK_UPI",
          amount: -100,
          utr: "SBIN1234567891",
          proofUrl: "https://cloudinary.test/proof.jpg",
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_AMOUNT",
      });

      // Reject invalid method
      await expect(
        depositService.submitDeposit({
          captainId: CAPTAIN_ID,
          method: "BITCOIN",
          amount: 500,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_METHOD",
      });
    });

    it("admin rejects a deposit with reason", async () => {
      const { deposit } = await depositService.submitDeposit({
        captainId: CAPTAIN_ID,
        method: "PHYSICAL_CASH",
        amount: 1500,
        receiptNumber: "REC-9988",
        receivedBy: "ADMIN_OFFICER",
      });

      const rejected = await depositService.rejectDeposit({
        depositId: deposit._id,
        adminId: ADMIN_ID,
        reason: "Receipt number does not match branch receipt books",
      });

      expect(rejected.status).toBe("REJECTED");
      expect(rejected.rejectionReason).toBe("Receipt number does not match branch receipt books");
    });

    it("approves a deposit and reconciles pending orders via FIFO", async () => {
      // Clear initial collections and seed fresh 2 orders
      Order.reset();
      CashCollection.reset();

      const o1 = new mongoose.Types.ObjectId();
      const o2 = new mongoose.Types.ObjectId();

      Order.seed({
        _id: o1,
        orderId: "ORD-FIFO-1",
        paymentBreakdown: { codPendingAmount: 1000, codCollectedAmount: 0 },
      });
      Order.seed({
        _id: o2,
        orderId: "ORD-FIFO-2",
        paymentBreakdown: { codPendingAmount: 1500, codCollectedAmount: 0 },
      });

      CashCollection.seed({
        captain: new mongoose.Types.ObjectId(CAPTAIN_ID),
        order: o1,
        orderId: "ORD-FIFO-1",
        amount: 1000,
        countsTowardCash: true,
        collectedAt: new Date(Date.now() - 5000),
      });
      CashCollection.seed({
        captain: new mongoose.Types.ObjectId(CAPTAIN_ID),
        order: o2,
        orderId: "ORD-FIFO-2",
        amount: 1500,
        countsTowardCash: true,
        collectedAt: new Date(Date.now() - 2000),
      });

      // Submit deposit of 2000 (covers order 1 entirely, order 2 partially)
      const { deposit } = await depositService.submitDeposit({
        captainId: CAPTAIN_ID,
        method: "BANK_UPI",
        amount: 2000,
        utr: "HDFC987654321",
        proofUrl: "https://cloudinary.test/proof.jpg",
      });

      const outcome = await depositService.approveDeposit({
        depositId: deposit._id,
        adminId: ADMIN_ID,
        verifiedAmount: 2000,
      });

      expect(outcome.status).toBe("APPROVED");
      expect(outcome.allocated).toBe(2000);
      expect(outcome.excess).toBe(0);
      expect(outcome.pendingAfter).toBe(500); // 2500 - 2000 = 500 remaining

      // Check reconcileCodCash was called in FIFO order:
      // 1. Order 1 for 1000
      // 2. Order 2 for 1000 (partial)
      expect(mockReconcileCodCash).toHaveBeenCalledTimes(2);
      expect(mockReconcileCodCash).toHaveBeenNthCalledWith(
        1,
        o1,
        1000,
        new mongoose.Types.ObjectId(CAPTAIN_ID),
        expect.any(Object),
      );
      expect(mockReconcileCodCash).toHaveBeenNthCalledWith(
        2,
        o2,
        1000,
        new mongoose.Types.ObjectId(CAPTAIN_ID),
        expect.any(Object),
      );
    });
  });

  /* ─────────────────────── Controller Endpoints ─────────────────────── */

  describe("Controller Handlers (cashSettlementController)", () => {
    function mockReqRes({
      user = { id: CAPTAIN_ID, role: "delivery" },
      body = {},
      params = {},
      query = {},
      file = null,
    } = {}) {
      const req = { user, body, params, query, file, headers: {} };
      const res = {
        statusCode: 200,
        payload: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          this.payload = data;
          return this;
        },
        send(data) {
          this.payload = data;
          return this;
        },
        setHeader: jest.fn(),
      };
      return { req, res };
    }

    it("captainStartShift returns 201 and shift details", async () => {
      const { req, res } = mockReqRes();
      await controller.captainStartShift(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.payload?.success).toBe(true);
      expect(res.payload?.result?.shiftId).toBeDefined();
    });

    it("captainCurrentSummary returns 200 with shift summary", async () => {
      await shiftService.startShift(CAPTAIN_ID);

      const { req, res } = mockReqRes();
      await controller.captainCurrentSummary(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.payload?.success).toBe(true);
      expect(res.payload?.result?.shift?.status).toBe("ACTIVE");
    });

    it("captainEndShift returns 200 and ends active shift", async () => {
      await shiftService.startShift(CAPTAIN_ID);

      const { req, res } = mockReqRes();
      await controller.captainEndShift(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.payload?.success).toBe(true);
      expect(res.payload?.result?.shift?.status).toBe("CLOSED");
    });

    it("adminGrantOverride returns 201 when granting a temporary cash limit override", async () => {
      const { req, res } = mockReqRes({
        user: { id: ADMIN_ID, role: "admin" },
        params: { captainId: CAPTAIN_ID },
        body: { hours: 6, reason: "Urgent festival dispatch" },
      });

      await controller.adminGrantOverride(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.payload?.success).toBe(true);
      expect(res.payload?.result?.reason).toBe("Urgent festival dispatch");
    });
  });
});

