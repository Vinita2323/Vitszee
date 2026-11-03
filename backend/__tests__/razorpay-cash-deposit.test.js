import crypto from "crypto";
import { jest } from "@jest/globals";
import mongoose from "mongoose";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { startMemoryMongo, prepareCollections, clearAll, stopMemoryMongo } from "./helpers/memoryMongo.js";
import { rzp, makeDeliver, WEBHOOK_SECRET } from "./helpers/razorpayEvents.js";

/**
 * Captain cash deposit via Razorpay Checkout, against an isolated in-memory
 * MongoDB replica set (real orders, cash collections, wallets, transactions).
 * Only Razorpay's HTTP client is faked (at the SDK boundary), so the real
 * signature verification and settlement code run.
 */

const KEY_SECRET = "rzp_test_secret_value";
process.env.NODE_ENV = "test";
process.env.PAYMENT_PROVIDER = "razorpay";
process.env.RAZORPAY_KEY_ID = "rzp_test_ABC123";
process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.JWT_SECRET = "test-jwt-secret";

// ── fake Razorpay API ───────────────────────────────────────────────────
const rzpOrders = new Map(); // orderId -> { amount, receipt, notes }
const paymentsByOrder = new Map(); // orderId -> payment[]
let failFetch = false;
let orderSeq = 0;
const createOrderSpy = jest.fn();
class FakeRazorpay {
  constructor() {
    this.orders = {
      create: async (params) => {
        createOrderSpy(params);
        orderSeq += 1;
        const id = `order_test_${orderSeq}`;
        rzpOrders.set(id, params);
        return { id, ...params, status: "created" };
      },
      fetchPayments: async (orderId) => {
        if (failFetch) {
          const e = new Error("net");
          e.error = { description: "gateway timeout" };
          throw e;
        }
        return { items: paymentsByOrder.get(orderId) || [] };
      },
    };
  }
  static validateWebhookSignature() {
    return true;
  }
}
jest.unstable_mockModule("razorpay", () => ({ default: FakeRazorpay }));

const emitted = [];
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: (type, payload) => emitted.push({ type, payload }),
  default: {},
}));
jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  afterPlaceOrderV2: jest.fn(async () => {}),
  proceedToDeliverySearch: jest.fn(async () => {}),
}));

await startMemoryMongo("razorpay_deposit");
const { default: Order } = await import("../app/models/order.js");
const { default: Shift } = await import("../app/models/shift.js");
const { default: CashCollection } = await import("../app/models/cashCollection.js");
const { default: CashDeposit } = await import("../app/models/cashDeposit.js");
const { default: CashSettlementAudit } = await import("../app/models/cashSettlementAudit.js");
const { default: Wallet } = await import("../app/models/wallet.js");
const svc = await import("../app/services/cashSettlement/razorpayDepositService.js");
const depositSvc = await import("../app/services/cashSettlement/depositService.js");
const adminSvc = await import("../app/services/cashSettlement/adminService.js");
const { getCashPosition } = await import("../app/services/cashSettlement/position.js");
const { processWebhook } = await import("../app/services/paymentService.js");
const { default: cashSettlementRoutes } = await import("../app/routes/cashSettlementRoutes.js");
await prepareCollections();

const deliver = makeDeliver(processWebhook);
const customer = new mongoose.Types.ObjectId();
let captain;
let otherCaptain;
let shift;
let n = 0;

async function cashOrder(captainId, shiftDoc, amount) {
  n += 1;
  const order = await Order.create({
    orderId: `ORD-DEP-${n}`,
    customer,
    seller: new mongoose.Types.ObjectId(),
    deliveryBoy: captainId,
    paymentMode: "COD",
    paymentStatus: "CASH_COLLECTED",
    status: "delivered",
    orderStatus: "delivered",
    workflowVersion: 2,
    workflowStatus: "DELIVERED",
    pricing: { total: amount },
    paymentBreakdown: { grandTotal: amount, codCollectedAmount: amount, codRemittedAmount: 0, codPendingAmount: amount },
    financeFlags: { codMarkedCollected: true },
  });
  await CashCollection.create({
    order: order._id,
    orderId: order.orderId,
    captain: captainId,
    shift: shiftDoc?._id || null,
    customer,
    amount,
    paymentMethod: "CASH",
    countsTowardCash: true,
    collectedAt: new Date(Date.now() - (100 - n) * 1000),
    reference: `COL-${order.orderId}`,
  });
  return order;
}

const pendingOf = async (id = captain) => (await getCashPosition(id)).pendingCash;
const sign = (orderId, paymentId, secret = KEY_SECRET) =>
  crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
const capturedPayment = (orderId, id, amountPaise) => ({
  id, entity: "payment", order_id: orderId, status: "captured", amount: amountPaise, currency: "INR", method: "upi",
});
const emits = (t) => emitted.filter((e) => e.type === t);

beforeEach(async () => {
  await clearAll();
  rzpOrders.clear();
  paymentsByOrder.clear();
  failFetch = false;
  emitted.length = 0;
  createOrderSpy.mockClear();
  captain = new mongoose.Types.ObjectId();
  otherCaptain = new mongoose.Types.ObjectId();
  shift = await Shift.create({ shiftId: `SHF-T-${Date.now()}`, captain, status: "ACTIVE", startedAt: new Date() });
  // ₹1,200 + ₹800 of cash collected = ₹2,000 pending
  await cashOrder(captain, shift, 1200);
  await cashOrder(captain, shift, 800);
  await Wallet.updateOne(
    { ownerType: "DELIVERY_PARTNER", ownerId: captain },
    { $set: { cashInHand: 2000 } },
    { upsert: true },
  );
});
afterAll(async () => {
  await stopMemoryMongo();
});

describe("create the Razorpay order", () => {
  it("creates a server-side order for exactly the entered amount and stores a PENDING deposit", async () => {
    const res = await svc.createRazorpayDeposit({ captainId: captain, amount: 1500 });

    expect(createOrderSpy).toHaveBeenCalledTimes(1);
    expect(createOrderSpy.mock.calls[0][0]).toMatchObject({
      amount: 150000, // paise
      currency: "INR",
      receipt: res.deposit.depositId,
      notes: expect.objectContaining({ purpose: "captain_cash_deposit", captainId: String(captain) }),
    });

    const row = await CashDeposit.findById(res.deposit._id).lean();
    expect(row).toMatchObject({
      method: "RAZORPAY",
      amount: 1500,
      status: "PAYMENT_PENDING",
      paymentStatus: "PENDING",
      razorpayOrderId: res.checkout.orderId,
    });
    expect(String(row.captain)).toBe(String(captain));
    expect(String(row.shift)).toBe(String(shift._id));
    expect(row.submittedAt).toBeInstanceOf(Date);
    expect(row.razorpayPaymentId).toBeUndefined();
    // nothing is settled yet
    expect(await pendingOf()).toBe(2000);
  });

  it("gives the browser only public checkout data — never the key secret", async () => {
    const res = await svc.createRazorpayDeposit({ captainId: captain, amount: 500 });
    expect(res.checkout).toMatchObject({ keyId: "rzp_test_ABC123", amount: 50000, currency: "INR" });
    expect(JSON.stringify(res)).not.toContain(KEY_SECRET);
  });

  it("rejects amounts that are invalid or above the pending cash", async () => {
    await expect(svc.createRazorpayDeposit({ captainId: captain, amount: 0 })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    await expect(svc.createRazorpayDeposit({ captainId: captain, amount: "abc" })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    await expect(svc.createRazorpayDeposit({ captainId: captain, amount: 2500 })).rejects.toMatchObject({ code: "AMOUNT_EXCEEDS_PENDING" });
    expect(createOrderSpy).not.toHaveBeenCalled();
  });

  it("rejects a captain with nothing to deposit", async () => {
    await expect(svc.createRazorpayDeposit({ captainId: otherCaptain, amount: 100 })).rejects.toMatchObject({ code: "NOTHING_TO_DEPOSIT" });
  });

  it("does not create duplicate deposits: same idempotency key or an identical open payment reuses the order", async () => {
    const a = await svc.createRazorpayDeposit({ captainId: captain, amount: 700, idempotencyKey: "k1" });
    const b = await svc.createRazorpayDeposit({ captainId: captain, amount: 700, idempotencyKey: "k1" });
    const c = await svc.createRazorpayDeposit({ captainId: captain, amount: 700 });
    expect(b.duplicate).toBe(true);
    expect(c.duplicate).toBe(true);
    expect(String(b.deposit._id)).toBe(String(a.deposit._id));
    expect(String(c.deposit._id)).toBe(String(a.deposit._id));
    expect(createOrderSpy).toHaveBeenCalledTimes(1);
    expect(await CashDeposit.countDocuments({ method: "RAZORPAY" })).toBe(1);
  });

  it("marks the deposit FAILED when Razorpay refuses to create the order", async () => {
    createOrderSpy.mockImplementationOnce(() => {
      throw Object.assign(new Error("x"), { error: { description: "Authentication failed" } });
    });
    await expect(svc.createRazorpayDeposit({ captainId: captain, amount: 400 })).rejects.toMatchObject({ code: "RAZORPAY_ORDER_FAILED" });
    const row = await CashDeposit.findOne({ method: "RAZORPAY" }).lean();
    expect(row).toMatchObject({ status: "PAYMENT_FAILED", paymentStatus: "FAILED" });
  });

  it("fails clearly when Razorpay is not configured", async () => {
    const saved = process.env.RAZORPAY_KEY_SECRET;
    process.env.RAZORPAY_KEY_SECRET = "";
    try {
      await expect(svc.createRazorpayDeposit({ captainId: captain, amount: 100 })).rejects.toMatchObject({ code: "RAZORPAY_NOT_CONFIGURED", statusCode: 503 });
    } finally {
      process.env.RAZORPAY_KEY_SECRET = saved;
    }
  });
});

describe("verify after Checkout (backend verification)", () => {
  async function start(amount) {
    return svc.createRazorpayDeposit({ captainId: captain, amount });
  }

  it("settles a full-amount payment: PAID/APPROVED, ids and server time saved, cash orders reduced", async () => {
    const { deposit, checkout } = await start(2000);
    paymentsByOrder.set(checkout.orderId, [capturedPayment(checkout.orderId, "pay_ok1", 200000)]);

    const r = await svc.verifyRazorpayDeposit({
      captainId: captain,
      razorpayOrderId: checkout.orderId,
      razorpayPaymentId: "pay_ok1",
      razorpaySignature: sign(checkout.orderId, "pay_ok1"),
    });
    expect(r.settled).toBe(true);

    const row = await CashDeposit.findById(deposit._id).lean();
    expect(row).toMatchObject({
      status: "APPROVED",
      paymentStatus: "PAID",
      razorpayOrderId: checkout.orderId,
      razorpayPaymentId: "pay_ok1",
      verifiedAmount: 2000,
      allocatedAmount: 2000,
      excessAmount: 0,
    });
    expect(row.paidAt).toBeInstanceOf(Date);
    expect(row.allocations.map((a) => a.amount).sort((x, y) => x - y)).toEqual([800, 1200]);

    expect(await pendingOf()).toBe(0);
    const orders = await Order.find({ deliveryBoy: captain }).lean();
    expect(orders.every((o) => o.paymentBreakdown.codPendingAmount === 0)).toBe(true);
    expect(orders.every((o) => o.paymentStatus === "COD_RECONCILED")).toBe(true);
    expect(emits("GENERIC_ALERT").some((e) => e.payload.title === "Payment received")).toBe(true);

    const audit = await CashSettlementAudit.find({ entityId: deposit._id }).lean();
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["RAZORPAY_DEPOSIT_STARTED", "RAZORPAY_PAYMENT_VERIFIED", "DEPOSIT_PAID_VERIFIED"]));
  });

  it("a partial payment settles oldest cash first and leaves the rest pending", async () => {
    const { checkout } = await start(1500);
    paymentsByOrder.set(checkout.orderId, [capturedPayment(checkout.orderId, "pay_p1", 150000)]);
    await svc.verifyRazorpayDeposit({
      captainId: captain, razorpayOrderId: checkout.orderId, razorpayPaymentId: "pay_p1", razorpaySignature: sign(checkout.orderId, "pay_p1"),
    });
    expect(await pendingOf()).toBe(500);
    const [first, second] = await Order.find({ deliveryBoy: captain }).sort({ orderId: 1 }).lean();
    expect(first.paymentBreakdown.codPendingAmount).toBe(0); // ₹1,200 fully paid
    expect(second.paymentBreakdown.codPendingAmount).toBe(500); // ₹300 of ₹800 paid
  });

  it("rejects an invalid signature and settles nothing", async () => {
    const { deposit, checkout } = await start(2000);
    paymentsByOrder.set(checkout.orderId, [capturedPayment(checkout.orderId, "pay_x", 200000)]);
    await expect(
      svc.verifyRazorpayDeposit({
        captainId: captain, razorpayOrderId: checkout.orderId, razorpayPaymentId: "pay_x",
        razorpaySignature: sign(checkout.orderId, "pay_x", "wrong-secret"),
      }),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE", statusCode: 400 });
    expect((await CashDeposit.findById(deposit._id).lean()).status).toBe("PAYMENT_PENDING");
    expect(await pendingOf()).toBe(2000);
    expect(await CashSettlementAudit.countDocuments({ action: "RAZORPAY_SIGNATURE_REJECTED", captain })).toBe(1);
  });

  it("a signature without a payment id (or vice versa) is rejected", async () => {
    const { checkout } = await start(2000);
    await expect(svc.verifyRazorpayDeposit({ captainId: captain, razorpayOrderId: checkout.orderId, razorpaySignature: "abc" }))
      .rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
  });

  it("never trusts the frontend: a valid signature is not enough unless Razorpay shows a captured payment", async () => {
    const { deposit, checkout } = await start(2000);
    paymentsByOrder.set(checkout.orderId, [{ ...capturedPayment(checkout.orderId, "pay_auth", 200000), status: "authorized" }]);
    const r = await svc.verifyRazorpayDeposit({
      captainId: captain, razorpayOrderId: checkout.orderId, razorpayPaymentId: "pay_auth", razorpaySignature: sign(checkout.orderId, "pay_auth"),
    });
    expect(r.settled).toBe(false);
    expect((await CashDeposit.findById(deposit._id).lean()).paymentStatus).toBe("PENDING");
    expect(await pendingOf()).toBe(2000);
  });

  it("does not settle when Razorpay has no payment at all, and keeps the deposit pending", async () => {
    const { deposit, checkout } = await start(1000);
    const r = await svc.verifyRazorpayDeposit({ captainId: captain, razorpayOrderId: checkout.orderId });
    expect(r.settled).toBe(false);
    expect((await CashDeposit.findById(deposit._id).lean()).status).toBe("PAYMENT_PENDING");
  });

  it("a payment of a different amount is refused and raised to admins", async () => {
    const { deposit, checkout } = await start(1000);
    paymentsByOrder.set(checkout.orderId, [capturedPayment(checkout.orderId, "pay_bad", 50000)]);
    await expect(
      svc.verifyRazorpayDeposit({ captainId: captain, razorpayOrderId: checkout.orderId, razorpayPaymentId: "pay_bad", razorpaySignature: sign(checkout.orderId, "pay_bad") }),
    ).rejects.toMatchObject({ code: "AMOUNT_MISMATCH" });
    expect((await CashDeposit.findById(deposit._id).lean()).paymentStatus).toBe("PENDING");
    expect(await pendingOf()).toBe(2000);
    expect(emits("GENERIC_ALERT")).toHaveLength(1);
  });

  it("a failed payment is recorded as FAILED, and a later successful retry recovers it", async () => {
    const { deposit, checkout } = await start(1000);
    paymentsByOrder.set(checkout.orderId, [{ id: "pay_f1", order_id: checkout.orderId, status: "failed", amount: 100000, currency: "INR", error_description: "Bank declined" }]);
    const failed = await svc.verifyRazorpayDeposit({ captainId: captain, razorpayOrderId: checkout.orderId });
    expect(failed.settled).toBe(false);
    let row = await CashDeposit.findById(deposit._id).lean();
    expect(row).toMatchObject({ status: "PAYMENT_FAILED", paymentStatus: "FAILED", failureReason: "Bank declined" });
    expect(row.failedAttempts).toHaveLength(1);
    expect(await pendingOf()).toBe(2000);

    paymentsByOrder.set(checkout.orderId, [
      { id: "pay_f1", order_id: checkout.orderId, status: "failed", amount: 100000, currency: "INR" },
      capturedPayment(checkout.orderId, "pay_f2", 100000),
    ]);
    await svc.verifyRazorpayDeposit({ captainId: captain, razorpayOrderId: checkout.orderId, razorpayPaymentId: "pay_f2", razorpaySignature: sign(checkout.orderId, "pay_f2") });
    row = await CashDeposit.findById(deposit._id).lean();
    expect(row).toMatchObject({ status: "APPROVED", paymentStatus: "PAID", razorpayPaymentId: "pay_f2" });
    expect(await pendingOf()).toBe(1000);
  });

  it("is idempotent: verifying the same payment again settles nothing twice", async () => {
    const { checkout } = await start(2000);
    paymentsByOrder.set(checkout.orderId, [capturedPayment(checkout.orderId, "pay_once", 200000)]);
    const args = { captainId: captain, razorpayOrderId: checkout.orderId, razorpayPaymentId: "pay_once", razorpaySignature: sign(checkout.orderId, "pay_once") };
    await svc.verifyRazorpayDeposit(args);
    await svc.verifyRazorpayDeposit(args);
    await Promise.all([svc.verifyRazorpayDeposit(args), svc.verifyRazorpayDeposit(args)]);
    expect(await pendingOf()).toBe(0);
    expect(await CashSettlementAudit.countDocuments({ action: "DEPOSIT_PAID_VERIFIED", captain })).toBe(1);
    const wallet = await Wallet.findOne({ ownerType: "DELIVERY_PARTNER", ownerId: captain }).lean();
    expect(wallet.cashInHand).toBe(0);
  });

  it("only the owning captain can verify a deposit", async () => {
    const { checkout } = await start(1000);
    paymentsByOrder.set(checkout.orderId, [capturedPayment(checkout.orderId, "pay_o", 100000)]);
    await expect(
      svc.verifyRazorpayDeposit({ captainId: otherCaptain, razorpayOrderId: checkout.orderId, razorpayPaymentId: "pay_o", razorpaySignature: sign(checkout.orderId, "pay_o") }),
    ).rejects.toMatchObject({ statusCode: 404, code: "DEPOSIT_NOT_FOUND" });
    expect(await pendingOf()).toBe(2000);
  });

  it("a gateway outage keeps the deposit pending and tells the app to retry", async () => {
    const { deposit, checkout } = await start(1000);
    failFetch = true;
    await expect(
      svc.verifyRazorpayDeposit({ captainId: captain, razorpayOrderId: checkout.orderId, razorpayPaymentId: "pay_q", razorpaySignature: sign(checkout.orderId, "pay_q") }),
    ).rejects.toMatchObject({ code: "GATEWAY_UNAVAILABLE", statusCode: 502 });
    expect((await CashDeposit.findById(deposit._id).lean()).status).toBe("PAYMENT_PENDING");
  });

  it("the same Razorpay payment cannot be attached to two deposits", async () => {
    const a = await start(1000);
    paymentsByOrder.set(a.checkout.orderId, [capturedPayment(a.checkout.orderId, "pay_dupe", 100000)]);
    await svc.verifyRazorpayDeposit({ captainId: captain, razorpayOrderId: a.checkout.orderId, razorpayPaymentId: "pay_dupe", razorpaySignature: sign(a.checkout.orderId, "pay_dupe") });
    const b = await start(500);
    paymentsByOrder.set(b.checkout.orderId, [capturedPayment(b.checkout.orderId, "pay_dupe", 50000)]);
    await expect(
      svc.verifyRazorpayDeposit({ captainId: captain, razorpayOrderId: b.checkout.orderId, razorpayPaymentId: "pay_dupe", razorpaySignature: sign(b.checkout.orderId, "pay_dupe") }),
    ).rejects.toMatchObject({ code: "DUPLICATE_PAYMENT" });
    expect(await pendingOf()).toBe(1000); // only the first ₹1,000 was applied
  });
});

describe("webhook confirmation", () => {
  async function start(amount) {
    return svc.createRazorpayDeposit({ captainId: captain, amount });
  }

  it("payment.captured settles the deposit even if the app never calls verify; redelivery is harmless", async () => {
    const { deposit, checkout } = await start(2000);
    const ev = rzp.paymentCaptured(rzp.payment("pay_wh1", "captured", { orderId: checkout.orderId, amount: 200000 }));
    const first = await deliver(ev, { eventId: "evt_d1" });
    const again = await deliver(ev, { eventId: "evt_d1" });
    expect(first.http).toBe(200);
    expect(again.result.duplicate).toBe(true);

    const row = await CashDeposit.findById(deposit._id).lean();
    expect(row).toMatchObject({ status: "APPROVED", paymentStatus: "PAID", razorpayPaymentId: "pay_wh1" });
    expect(await pendingOf()).toBe(0);
  });

  it("payment.captured followed by order.paid applies the money exactly once", async () => {
    const { checkout } = await start(1000);
    const p = rzp.payment("pay_wh2", "captured", { orderId: checkout.orderId, amount: 100000 });
    await deliver(rzp.paymentCaptured(p));
    await deliver(rzp.orderPaid(p));
    await Promise.all([deliver(rzp.paymentCaptured(p), { eventId: "x1" }), deliver(rzp.orderPaid(p), { eventId: "x2" })]);
    expect(await pendingOf()).toBe(1000);
    expect(await CashSettlementAudit.countDocuments({ action: "DEPOSIT_PAID_VERIFIED", captain })).toBe(1);
  });

  it("webhook then client verify do not double-apply", async () => {
    const { checkout } = await start(2000);
    await deliver(rzp.paymentCaptured(rzp.payment("pay_wh3", "captured", { orderId: checkout.orderId, amount: 200000 })));
    paymentsByOrder.set(checkout.orderId, [capturedPayment(checkout.orderId, "pay_wh3", 200000)]);
    const r = await svc.verifyRazorpayDeposit({ captainId: captain, razorpayOrderId: checkout.orderId, razorpayPaymentId: "pay_wh3", razorpaySignature: sign(checkout.orderId, "pay_wh3") });
    expect(r.settled).toBe(true);
    expect(await pendingOf()).toBe(0);
  });

  it("payment.failed marks the deposit FAILED; a later capture recovers it", async () => {
    const { deposit, checkout } = await start(1000);
    await deliver(rzp.paymentFailed(rzp.payment("pay_wf1", "failed", { orderId: checkout.orderId, amount: 100000 })));
    let row = await CashDeposit.findById(deposit._id).lean();
    expect(row).toMatchObject({ status: "PAYMENT_FAILED", paymentStatus: "FAILED" });
    expect(emits("GENERIC_ALERT").some((e) => /failed/i.test(e.payload.title))).toBe(true);

    await deliver(rzp.paymentCaptured(rzp.payment("pay_wf2", "captured", { orderId: checkout.orderId, amount: 100000 })));
    row = await CashDeposit.findById(deposit._id).lean();
    expect(row).toMatchObject({ status: "APPROVED", paymentStatus: "PAID", razorpayPaymentId: "pay_wf2" });
  });

  it("a webhook with the wrong amount is not settled", async () => {
    const { deposit, checkout } = await start(1000);
    await deliver(rzp.paymentCaptured(rzp.payment("pay_wm", "captured", { orderId: checkout.orderId, amount: 99900 })));
    expect((await CashDeposit.findById(deposit._id).lean()).paymentStatus).toBe("PENDING");
    expect(await pendingOf()).toBe(2000);
  });

  it("an invalid webhook signature is rejected before anything happens", async () => {
    const { checkout } = await start(1000);
    const r = await deliver(rzp.paymentCaptured(rzp.payment("pay_ws", "captured", { orderId: checkout.orderId, amount: 100000 })), { badSignature: true });
    expect(r.http).toBe(401);
    expect(await pendingOf()).toBe(2000);
  });

  it("events for unrelated orders do not touch deposits", async () => {
    await start(1000);
    const r = await deliver(rzp.paymentCaptured(rzp.payment("pay_other", "captured", { orderId: "order_unrelated", amount: 100000 })));
    expect(r.http).toBe(200);
    expect(await pendingOf()).toBe(2000);
  });
});

describe("abandoned attempts", () => {
  it("a deposit never paid is closed as FAILED and a fresh attempt can start", async () => {
    const a = await svc.createRazorpayDeposit({ captainId: captain, amount: 600 });
    await CashDeposit.collection.updateOne({ _id: a.deposit._id }, { $set: { createdAt: new Date(Date.now() - 60 * 60 * 1000) } }); // createdAt is immutable via Mongoose

    const b = await svc.createRazorpayDeposit({ captainId: captain, amount: 600 });
    expect(String(b.deposit._id)).not.toBe(String(a.deposit._id));
    expect((await CashDeposit.findById(a.deposit._id).lean())).toMatchObject({ status: "PAYMENT_FAILED", paymentStatus: "FAILED", failureReason: "Payment not completed" });
    expect(createOrderSpy).toHaveBeenCalledTimes(2);
  });

  it("but a late successful payment on an abandoned deposit still settles it", async () => {
    const a = await svc.createRazorpayDeposit({ captainId: captain, amount: 600 });
    await CashDeposit.collection.updateOne({ _id: a.deposit._id }, { $set: { createdAt: new Date(Date.now() - 60 * 60 * 1000) } }); // createdAt is immutable via Mongoose
    await svc.sweepAbandonedRazorpayDeposits(captain);
    await deliver(rzp.paymentCaptured(rzp.payment("pay_late", "captured", { orderId: a.checkout.orderId, amount: 60000 })));
    expect((await CashDeposit.findById(a.deposit._id).lean())).toMatchObject({ status: "APPROVED", paymentStatus: "PAID" });
    expect(await pendingOf()).toBe(1400);
  });
});

describe("existing deposit methods keep working", () => {
  it("Cash at Hub / Office: submit, then admin approval settles it", async () => {
    const { deposit } = await depositSvc.submitDeposit({
      captainId: captain, method: "PHYSICAL_CASH", amount: 800, receiptNumber: "RCPT-001", receivedBy: "Rahul Sharma",
    });
    expect(deposit.status).toBe("SUBMITTED"); // not settled by submitting
    expect(await pendingOf()).toBe(2000);
    const out = await depositSvc.approveDeposit({ depositId: deposit._id, adminId: new mongoose.Types.ObjectId() });
    expect(out.status).toBe("APPROVED");
    expect(await pendingOf()).toBe(1200);
  });

  it("Bank / UPI: still needs a UTR and proof, and a duplicate UTR is refused", async () => {
    await expect(
      depositSvc.submitDeposit({ captainId: captain, method: "BANK_UPI", amount: 500, utr: "UTR123456789" }),
    ).rejects.toMatchObject({ code: "PROOF_REQUIRED" });
    await depositSvc.submitDeposit({ captainId: captain, method: "BANK_UPI", amount: 500, utr: "UTR123456789", proofUrl: "https://x/p.png" });
    await expect(
      depositSvc.submitDeposit({ captainId: captain, method: "BANK_UPI", amount: 500, utr: "UTR123456789", proofUrl: "https://x/p.png" }),
    ).rejects.toMatchObject({ code: "DUPLICATE_REFERENCE" });
  });

  it("the manual endpoint cannot be used to fake a Razorpay deposit", async () => {
    await expect(
      depositSvc.submitDeposit({ captainId: captain, method: "RAZORPAY", amount: 500 }),
    ).rejects.toMatchObject({ code: "INVALID_METHOD" });
  });

  it("an admin cannot approve a Razorpay deposit that has not been paid", async () => {
    const { deposit } = await svc.createRazorpayDeposit({ captainId: captain, amount: 500 });
    await expect(
      depositSvc.approveDeposit({ depositId: deposit._id, adminId: new mongoose.Types.ObjectId() }),
    ).rejects.toMatchObject({ code: "DEPOSIT_ALREADY_PROCESSED" });
    expect(await pendingOf()).toBe(2000);
  });
});

describe("admin deposit list", () => {
  it("shows captain, shift, amount, payment id, payment status and date for every deposit", async () => {
    const { Delivery } = { Delivery: (await import("../app/models/delivery.js")).default };
    await Delivery.collection.insertOne({ _id: captain, name: "Vijay Panchal", phone: "9662148595" });
    const { checkout } = await svc.createRazorpayDeposit({ captainId: captain, amount: 1000 });
    paymentsByOrder.set(checkout.orderId, [capturedPayment(checkout.orderId, "pay_list", 100000)]);
    await svc.verifyRazorpayDeposit({ captainId: captain, razorpayOrderId: checkout.orderId, razorpayPaymentId: "pay_list", razorpaySignature: sign(checkout.orderId, "pay_list") });
    await depositSvc.submitDeposit({ captainId: captain, method: "PHYSICAL_CASH", amount: 300, receiptNumber: "RCPT-77", receivedBy: "Hub lead" });

    const all = await adminSvc.listDeposits({});
    expect(all.total).toBe(2);
    const online = all.items.find((d) => d.method === "RAZORPAY");
    expect(online).toMatchObject({
      amount: 1000,
      razorpayPaymentId: "pay_list",
      razorpayOrderId: checkout.orderId,
      paymentStatus: "PAID",
      status: "APPROVED",
    });
    expect(online.captain.name).toBe("Vijay Panchal");
    expect(online.shift.shiftId).toBe(shift.shiftId);
    expect(new Date(online.submittedAt).getTime()).toBeGreaterThan(0);
    expect(online.paidAt).toBeTruthy();

    const filtered = await adminSvc.listDeposits({ method: "RAZORPAY", paymentStatus: "PAID" });
    expect(filtered.items.map((d) => d.razorpayPaymentId)).toEqual(["pay_list"]);
    expect((await adminSvc.listDeposits({ method: "PHYSICAL_CASH" })).items).toHaveLength(1);
  });
});

describe("HTTP routes", () => {
  const app = express();
  app.use(express.json());
  app.use("/api/cash-settlement", cashSettlementRoutes);
  const token = (id, role) => jwt.sign({ id: String(id), role }, process.env.JWT_SECRET);

  it("require a delivery-partner login", async () => {
    const noAuth = await request(app).post("/api/cash-settlement/deposits/razorpay").send({ amount: 100 });
    expect(noAuth.status).toBe(401);
    const asCustomer = await request(app)
      .post("/api/cash-settlement/deposits/razorpay")
      .set("Authorization", `Bearer ${token(captain, "customer")}`)
      .send({ amount: 100 });
    expect(asCustomer.status).toBe(403);
    const verifyNoAuth = await request(app).post("/api/cash-settlement/deposits/razorpay/verify").send({});
    expect(verifyNoAuth.status).toBe(401);
  });

  it("create → verify works end to end and the response never contains the secret", async () => {
    const auth = { Authorization: `Bearer ${token(captain, "delivery")}` };
    const created = await request(app).post("/api/cash-settlement/deposits/razorpay").set(auth).send({ amount: 1000 });
    expect(created.status).toBe(201);
    const { checkout, deposit } = created.body.result;
    expect(checkout.keyId).toBe("rzp_test_ABC123");
    expect(deposit).toMatchObject({ method: "RAZORPAY", status: "PAYMENT_PENDING", paymentStatus: "PENDING" });
    expect(created.text).not.toContain(KEY_SECRET);

    paymentsByOrder.set(checkout.orderId, [capturedPayment(checkout.orderId, "pay_http", 100000)]);
    const verified = await request(app)
      .post("/api/cash-settlement/deposits/razorpay/verify")
      .set(auth)
      .send({ razorpay_order_id: checkout.orderId, razorpay_payment_id: "pay_http", razorpay_signature: sign(checkout.orderId, "pay_http") });
    expect(verified.status).toBe(200);
    expect(verified.body.result.settled).toBe(true);
    expect(verified.body.result.deposit).toMatchObject({ status: "APPROVED", paymentStatus: "PAID", razorpayPaymentId: "pay_http" });
    expect(verified.text).not.toContain(KEY_SECRET);
    expect(await pendingOf()).toBe(1000);
  });

  it("a forged signature over HTTP is a 400 and settles nothing", async () => {
    const auth = { Authorization: `Bearer ${token(captain, "delivery")}` };
    const created = await request(app).post("/api/cash-settlement/deposits/razorpay").set(auth).send({ amount: 1000 });
    const { checkout } = created.body.result;
    paymentsByOrder.set(checkout.orderId, [capturedPayment(checkout.orderId, "pay_forged", 100000)]);
    const res = await request(app)
      .post("/api/cash-settlement/deposits/razorpay/verify")
      .set(auth)
      .send({ razorpay_order_id: checkout.orderId, razorpay_payment_id: "pay_forged", razorpay_signature: "f".repeat(64) });
    expect(res.status).toBe(400);
    expect(await pendingOf()).toBe(2000);
  });

  it("an invalid amount over HTTP is a clear 400", async () => {
    const res = await request(app)
      .post("/api/cash-settlement/deposits/razorpay")
      .set({ Authorization: `Bearer ${token(captain, "delivery")}` })
      .send({ amount: 999999 });
    expect(res.status).toBe(400);
    expect(res.body.result.error.code).toBe("AMOUNT_EXCEEDS_PENDING");
  });
});

describe("captain overview (feeds the deposit page)", () => {
  it("returns the shapes both captain screens read, with the live pending cash and the new deposit fields", async () => {
    const { getCaptainOverview } = await import("../app/services/cashSettlement/shiftService.js");
    const { checkout } = await svc.createRazorpayDeposit({ captainId: captain, amount: 700 });
    const o = await getCaptainOverview(captain);

    // shifts screen
    expect(o.activeShift.shiftId).toBe(shift.shiftId);
    expect(o.currentSummary.totals.totalCashCollected).toBe(2000);
    expect(o.limits.pendingCash).toBe(2000);
    // wallet screen
    expect(o.currentShift.shiftId).toBe(shift.shiftId);
    expect(o.cash).toMatchObject({ totalCollected: 2000, outstanding: 2000, totalDeposited: 0 });
    expect(o.limit.pendingCash).toBe(2000);
    // history rows carry the online-payment fields
    expect(o.deposits[0]).toMatchObject({
      method: "RAZORPAY", status: "PAYMENT_PENDING", paymentStatus: "PENDING", razorpayOrderId: checkout.orderId, razorpayPaymentId: null,
    });
  });
});
