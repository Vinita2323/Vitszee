import { jest } from "@jest/globals";
import mongoose from "mongoose";
import { startMemoryMongo, prepareCollections, clearAll, stopMemoryMongo } from "./helpers/memoryMongo.js";
import { rzp, makeDeliver, WEBHOOK_SECRET } from "./helpers/razorpayEvents.js";

/**
 * Razorpay webhook pipeline against an isolated in-memory MongoDB replica set
 * (real transactions, real models, real finance code). Only the notification
 * emitter, the order-workflow side effects and the COD-QR service are stubbed.
 */

process.env.NODE_ENV = "test";
process.env.PAYMENT_PROVIDER = "razorpay";
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

const emitted = [];
let failEmitOnce = null;
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: (type, payload) => {
    if (failEmitOnce && type === failEmitOnce) {
      failEmitOnce = null;
      throw new Error("injected failure");
    }
    emitted.push({ type, payload });
  },
  default: {},
}));

const mockAfterPlaceOrderV2 = jest.fn(async () => {});
const mockProceed = jest.fn(async () => {});
jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  afterPlaceOrderV2: mockAfterPlaceOrderV2,
  proceedToDeliverySearch: mockProceed,
}));

const mockProcessQr = jest.fn(async () => ({ handled: true, completed: true }));
jest.unstable_mockModule("../app/services/codQrPaymentService.js", () => ({
  processQrWebhookEvent: mockProcessQr,
  processCollectLinkWebhookEvent: jest.fn(async () => ({ handled: false })),
}));

await startMemoryMongo("webhook_reliability");
const { default: Order } = await import("../app/models/order.js");
const { default: Payment } = await import("../app/models/payment.js");
const { default: PaymentWebhookEvent } = await import("../app/models/paymentWebhookEvent.js");
const { default: CodQrPayment } = await import("../app/models/codQrPayment.js");
const { processWebhook } = await import("../app/services/paymentService.js");
await prepareCollections();

const deliver = makeDeliver(processWebhook);
const customer = new mongoose.Types.ObjectId();
let n = 0;

async function fresh({ orderOverrides = {}, paymentOverrides = {} } = {}) {
  n += 1;
  const order = await Order.create({
    customer,
    seller: new mongoose.Types.ObjectId(),
    orderId: `ORD-WH-${n}`,
    paymentMode: "ONLINE",
    workflowVersion: 2,
    workflowStatus: "CREATED",
    status: "pending",
    paymentStatus: "CREATED",
    pricing: { total: 100 },
    paymentBreakdown: { grandTotal: 100 },
    ...orderOverrides,
  });
  const payment = await Payment.create({
    order: order._id,
    orderIds: [order._id],
    publicOrderId: order.orderId,
    customer,
    gatewayName: "RAZORPAY",
    gatewayOrderId: `${order.orderId}-A1`,
    gatewayLinkId: `plink_${n}`,
    amount: 10000,
    status: "PENDING",
    attemptCount: 1,
    ...paymentOverrides,
  });
  return { order, payment, mid: payment.gatewayOrderId, linkId: `plink_${n}` };
}

const reload = async (order, payment) => ({
  order: await Order.findById(order._id).lean(),
  payment: await Payment.findById(payment._id).lean(),
});
const emits = (type) => emitted.filter((e) => e.type === type);

beforeEach(async () => {
  await clearAll();
  emitted.length = 0;
  failEmitOnce = null;
  jest.clearAllMocks();
});

afterAll(async () => {
  await stopMemoryMongo();
});

describe("Phase 1 — payment retry and recovery", () => {
  it("a failed attempt does NOT cancel the order; the link stays usable", async () => {
    const { order, payment, mid } = await fresh();
    const r = await deliver(rzp.paymentFailed(rzp.payment("pay_f1", "failed", { merchantOrderId: mid })));
    expect(r.http).toBe(200);

    const s = await reload(order, payment);
    expect(s.payment.status).toBe("PENDING");
    expect(s.payment.failedAttempts.map((a) => a.paymentId)).toEqual(["pay_f1"]);
    expect(s.order.status).toBe("pending");
    expect(s.order.workflowStatus).toBe("CREATED");
    expect(emits("ORDER_CANCELLED")).toHaveLength(0);
    expect(emits("CUSTOMER_PAYMENT_FAILED")).toHaveLength(1);
  });

  it("the same failed attempt delivered again is recorded and notified once", async () => {
    const { payment, mid } = await fresh();
    const ev = rzp.paymentFailed(rzp.payment("pay_f1", "failed", { merchantOrderId: mid }));
    await deliver(ev, { eventId: "evt_f_a" });
    await deliver(ev, { eventId: "evt_f_b" }); // different event id, same payment attempt
    const p = await Payment.findById(payment._id).lean();
    expect(p.failedAttempts).toHaveLength(1);
    expect(emits("CUSTOMER_PAYMENT_FAILED")).toHaveLength(1);
  });

  it("fail → retry on the same link → paid: the order is recovered and processed normally", async () => {
    const { order, payment, mid } = await fresh();
    await deliver(rzp.paymentFailed(rzp.payment("pay_f1", "failed", { merchantOrderId: mid })));
    const r = await deliver(rzp.paymentCaptured(rzp.payment("pay_ok", "captured", { merchantOrderId: mid })));
    expect(r.http).toBe(200);

    const s = await reload(order, payment);
    expect(s.payment.status).toBe("CAPTURED");
    expect(s.payment.gatewayPaymentId).toBe("pay_ok");
    expect(s.order.paymentStatus).toBe("PAID");
    expect(s.order.workflowStatus).toBe("SELLER_PENDING");
    expect(s.order.financeFlags.onlinePaymentCaptured).toBe(true);
    expect(s.payment.reconciliation.required).toBe(false);
    expect(mockAfterPlaceOrderV2).toHaveBeenCalledTimes(1);
  });

  it("a payment already marked FAILED by the old logic is still recoverable", async () => {
    const { order, payment, mid } = await fresh({ paymentOverrides: { status: "FAILED" } });
    await deliver(rzp.paymentCaptured(rzp.payment("pay_ok", "captured", { merchantOrderId: mid })));
    const s = await reload(order, payment);
    expect(s.payment.status).toBe("CAPTURED");
    expect(s.order.paymentStatus).toBe("PAID");
  });

  it("payment_link.expired cancels the unpaid order and releases it", async () => {
    const { order, payment, linkId, mid } = await fresh();
    const r = await deliver(rzp.linkEvent("payment_link.expired", { linkId, referenceId: mid, status: "expired", amountPaid: 0 }));
    expect(r.http).toBe(200);
    const s = await reload(order, payment);
    expect(s.payment.status).toBe("CANCELLED");
    expect(s.order.status).toBe("cancelled");
    expect(s.order.workflowStatus).toBe("CANCELLED");
    expect(s.order.paymentStatus).toBe("FAILED");
    expect(emits("ORDER_CANCELLED")).toHaveLength(1);
  });

  it("payment_link.cancelled behaves the same, and is not re-notified on redelivery", async () => {
    const { order, payment, linkId, mid } = await fresh();
    const ev = rzp.linkEvent("payment_link.cancelled", { linkId, referenceId: mid, status: "cancelled", amountPaid: 0 });
    await deliver(ev, { eventId: "evt_c1" });
    await deliver(ev, { eventId: "evt_c2" }); // new id but order already cancelled
    const s = await reload(order, payment);
    expect(s.payment.status).toBe("CANCELLED");
    expect(s.order.status).toBe("cancelled");
    expect(emits("ORDER_CANCELLED")).toHaveLength(1);
  });

  it("expiry only cancels orders that are still waiting for payment (state-checked)", async () => {
    const { order, payment, linkId, mid } = await fresh({ orderOverrides: { workflowStatus: "SELLER_PENDING" } });
    await deliver(rzp.linkEvent("payment_link.expired", { linkId, referenceId: mid, status: "expired", amountPaid: 0 }));
    const s = await reload(order, payment);
    expect(s.payment.status).toBe("CANCELLED");
    expect(s.order.status).toBe("pending");
    expect(s.order.workflowStatus).toBe("SELLER_PENDING");
    expect(emits("ORDER_CANCELLED")).toHaveLength(0);
  });

  it("expiry arriving after a capture is ignored (out-of-order event)", async () => {
    const { order, payment, linkId, mid } = await fresh();
    await deliver(rzp.paymentCaptured(rzp.payment("pay_ok", "captured", { merchantOrderId: mid })));
    const r = await deliver(rzp.linkEvent("payment_link.expired", { linkId, referenceId: mid, status: "expired" }));
    expect(r.http).toBe(200);
    const s = await reload(order, payment);
    expect(s.payment.status).toBe("CAPTURED");
    expect(s.order.status).not.toBe("cancelled");
  });

  it("money captured AFTER the order was cancelled is flagged for reconciliation, never ignored", async () => {
    const { order, payment, linkId, mid } = await fresh();
    await deliver(rzp.linkEvent("payment_link.expired", { linkId, referenceId: mid, status: "expired", amountPaid: 0 }));
    emitted.length = 0;

    const cap = rzp.paymentCaptured(rzp.payment("pay_late", "captured", { merchantOrderId: mid }));
    const r = await deliver(cap, { eventId: "evt_late" });
    expect(r.http).toBe(200);

    const s = await reload(order, payment);
    expect(s.payment.status).toBe("CAPTURED");
    expect(s.payment.reconciliation.required).toBe(true);
    expect(s.payment.reconciliation.items.map((i) => i.reason)).toEqual(["LATE_CAPTURE_AFTER_CANCEL"]);
    expect(s.payment.reconciliation.items[0].details.cancelledOrderIds).toEqual([order.orderId]);
    expect(s.order.status).toBe("cancelled"); // order is not silently resurrected
    expect(s.order.financeFlags.onlinePaymentCaptured).toBe(false);
    expect(mockAfterPlaceOrderV2).not.toHaveBeenCalled();
    const alerts = emits("GENERIC_ALERT");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].payload.title).toMatch(/reconciliation/i);

    // redelivery (same + different event id) must not alert again
    await deliver(cap, { eventId: "evt_late" });
    await deliver(rzp.orderPaid(rzp.payment("pay_late", "captured", { merchantOrderId: mid })), { eventId: "evt_late_paid" });
    expect(emits("GENERIC_ALERT")).toHaveLength(1);
    expect((await Payment.findById(payment._id).lean()).reconciliation.items).toHaveLength(1);
  });

  it("rejects a captured amount that differs from what was requested and flags it", async () => {
    const { order, payment, mid } = await fresh();
    const r = await deliver(rzp.paymentCaptured(rzp.payment("pay_x", "captured", { merchantOrderId: mid, amount: 5000 })));
    expect(r.http).toBe(200);
    const s = await reload(order, payment);
    expect(s.payment.status).toBe("PENDING");
    expect(s.order.paymentStatus).toBe("CREATED");
    expect(s.payment.reconciliation.items[0].reason).toBe("AMOUNT_MISMATCH");
    expect(emits("GENERIC_ALERT")).toHaveLength(1);
  });

  it("rejects a currency mismatch", async () => {
    const { order, payment, mid } = await fresh();
    await deliver(rzp.paymentCaptured(rzp.payment("pay_x", "captured", { merchantOrderId: mid, currency: "USD" })));
    const s = await reload(order, payment);
    expect(s.payment.status).toBe("PENDING");
    expect(s.payment.reconciliation.items[0].reason).toBe("AMOUNT_MISMATCH");
  });

  it("payment.captured + order.paid + payment_link.paid for ONE payment apply side effects exactly once", async () => {
    const { order, payment, mid, linkId } = await fresh();
    const p = rzp.payment("pay_one", "captured", { merchantOrderId: mid, orderId: "order_r1" });
    await deliver(rzp.paymentCaptured(p));
    await deliver(rzp.orderPaid(p, { receipt: mid }));
    await deliver(rzp.linkEvent("payment_link.paid", { linkId, referenceId: mid, status: "paid", payment: p }));

    const s = await reload(order, payment);
    expect(s.payment.status).toBe("CAPTURED");
    expect(s.payment.statusHistory.filter((h) => h.toStatus === "CAPTURED")).toHaveLength(1);
    expect(mockAfterPlaceOrderV2).toHaveBeenCalledTimes(1);
    expect(emits("PAYMENT_SUCCESS")).toHaveLength(1);
    expect(emits("NEW_ORDER")).toHaveLength(1);
    expect(s.order.paymentStatus).toBe("PAID");
    expect(s.payment.reconciliation.required).toBe(false);
  });

  it("concurrent capture signals still process the order once", async () => {
    const { order, payment, mid, linkId } = await fresh();
    const p = rzp.payment("pay_race", "captured", { merchantOrderId: mid, orderId: "order_r2" });
    await Promise.all([
      deliver(rzp.paymentCaptured(p)),
      deliver(rzp.orderPaid(p, { receipt: mid })),
      deliver(rzp.linkEvent("payment_link.paid", { linkId, referenceId: mid, status: "paid", payment: p })),
    ]);
    const s = await reload(order, payment);
    expect(s.payment.status).toBe("CAPTURED");
    expect(s.payment.captureProcessedAt).toBeTruthy();
    expect(mockAfterPlaceOrderV2).toHaveBeenCalledTimes(1);
    expect(emits("PAYMENT_SUCCESS")).toHaveLength(1);
  });

  it("a second, different payment on an already-paid checkout is flagged as a duplicate payment", async () => {
    const { order, payment, mid } = await fresh();
    await deliver(rzp.paymentCaptured(rzp.payment("pay_first", "captured", { merchantOrderId: mid })));
    emitted.length = 0;
    await deliver(rzp.paymentCaptured(rzp.payment("pay_second", "captured", { merchantOrderId: mid })));

    const s = await reload(order, payment);
    expect(s.payment.gatewayPaymentId).toBe("pay_first");
    expect(s.payment.reconciliation.items.map((i) => i.reason)).toEqual(["DUPLICATE_PAYMENT"]);
    expect(s.payment.reconciliation.items[0].details.gatewayPaymentId).toBe("pay_second");
    expect(mockAfterPlaceOrderV2).toHaveBeenCalledTimes(1);
    expect(emits("PAYMENT_SUCCESS")).toHaveLength(0);
    expect(emits("GENERIC_ALERT")).toHaveLength(1);
  });

  it("matches by stored Payment Link id when our reference is missing, and learns the Razorpay order id", async () => {
    const { order, payment, linkId } = await fresh();
    const p = rzp.payment("pay_nolink", "captured", { orderId: "order_learned" }); // no notes
    const r = await deliver(rzp.linkEvent("payment_link.paid", { linkId, referenceId: null, status: "paid", payment: p, orderId: "order_learned" }));
    expect(r.http).toBe(200);
    const s = await reload(order, payment);
    expect(s.payment.status).toBe("CAPTURED");
    expect(s.payment.gatewayRazorpayOrderId).toBe("order_learned");

    // a later event that carries only the Razorpay order id now matches too
    const second = await fresh();
    await Payment.updateOne({ _id: second.payment._id }, { $set: { gatewayRazorpayOrderId: "order_known" } });
    await deliver(rzp.paymentFailed(rzp.payment("pay_z", "failed", { orderId: "order_known" })));
    expect((await Payment.findById(second.payment._id).lean()).failedAttempts).toHaveLength(1);
  });

  it("a capture that matches nothing but carries our reference is alerted, not dropped", async () => {
    const r = await deliver(rzp.paymentCaptured(rzp.payment("pay_orphan", "captured", { merchantOrderId: "ORD-GHOST-A1" })));
    expect(r.http).toBe(200);
    const ev = await PaymentWebhookEvent.findOne({ eventId: r.eventId }).lean();
    expect(ev.status).toBe("UNMATCHED");
    expect(emits("GENERIC_ALERT")).toHaveLength(1);
  });

  it("an unrelated capture (e.g. a COD cash-deposit order) is ignored quietly", async () => {
    const r = await deliver(rzp.paymentCaptured(rzp.payment("pay_deposit", "captured", {})));
    expect(r.http).toBe(200);
    expect((await PaymentWebhookEvent.findOne({ eventId: r.eventId }).lean()).status).toBe("IGNORED");
    expect(emits("GENERIC_ALERT")).toHaveLength(0);
  });
});

describe("Phase 2 — reliable event processing and idempotency", () => {
  it("rejects an invalid signature (401) before anything is stored", async () => {
    const { mid } = await fresh();
    const r = await deliver(rzp.paymentCaptured(rzp.payment("pay_s", "captured", { merchantOrderId: mid })), { badSignature: true });
    expect(r.http).toBe(401);
    expect(await PaymentWebhookEvent.countDocuments()).toBe(0);
  });

  it("a redelivered event id is acknowledged as a duplicate and not re-applied", async () => {
    const { mid } = await fresh();
    const ev = rzp.paymentCaptured(rzp.payment("pay_d", "captured", { merchantOrderId: mid }));
    const first = await deliver(ev, { eventId: "evt_dup" });
    const again = await deliver(ev, { eventId: "evt_dup" });
    expect(first.result.duplicate).toBe(false);
    expect(again.http).toBe(200);
    expect(again.result.duplicate).toBe(true);
    expect(await PaymentWebhookEvent.countDocuments({ eventId: "evt_dup" })).toBe(1);
    expect(mockAfterPlaceOrderV2).toHaveBeenCalledTimes(1);
  });

  it("a failed run stays retryable: Razorpay's redelivery re-processes it instead of being swallowed", async () => {
    const { order, payment, mid } = await fresh();
    const ev = rzp.paymentCaptured(rzp.payment("pay_retry", "captured", { merchantOrderId: mid }));

    failEmitOnce = "PAYMENT_SUCCESS"; // processing blows up half-way
    const first = await deliver(ev, { eventId: "evt_retry" });
    expect(first.http).toBe(500);
    let row = await PaymentWebhookEvent.findOne({ eventId: "evt_retry" }).lean();
    expect(row.status).toBe("FAILED");
    expect(row.attempts).toBe(1);
    expect((await Payment.findById(payment._id).lean()).captureProcessedAt).toBeNull();

    const second = await deliver(ev, { eventId: "evt_retry" });
    expect(second.http).toBe(200);
    expect(second.result.duplicate).toBe(false);
    row = await PaymentWebhookEvent.findOne({ eventId: "evt_retry" }).lean();
    expect(row.status).toBe("PROCESSED");
    expect(row.attempts).toBe(2);
    const s = await reload(order, payment);
    expect(s.payment.captureProcessedAt).toBeTruthy();
    expect(s.order.paymentStatus).toBe("PAID");
    expect(s.order.financeFlags.onlinePaymentCaptured).toBe(true);

    const third = await deliver(ev, { eventId: "evt_retry" });
    expect(third.result.duplicate).toBe(true);
  });

  it("a different signal repairs a half-applied capture (no stuck payments)", async () => {
    const { order, payment, mid } = await fresh();
    const p = rzp.payment("pay_heal", "captured", { merchantOrderId: mid });
    failEmitOnce = "PAYMENT_SUCCESS";
    expect((await deliver(rzp.paymentCaptured(p))).http).toBe(500);
    expect((await deliver(rzp.orderPaid(p, { receipt: mid }))).http).toBe(200);
    const s = await reload(order, payment);
    expect(s.payment.captureProcessedAt).toBeTruthy();
    expect(s.order.paymentStatus).toBe("PAID");
  });

  it("an event another worker is processing right now asks Razorpay to retry (503→500), not to drop it", async () => {
    const { mid } = await fresh();
    await PaymentWebhookEvent.create({
      eventId: "evt_busy", gatewayName: "RAZORPAY", eventType: "payment.captured", payloadHash: "x",
      status: "PROCESSING", attempts: 1, lockedAt: new Date(),
    });
    const r = await deliver(rzp.paymentCaptured(rzp.payment("pay_busy", "captured", { merchantOrderId: mid })), { eventId: "evt_busy" });
    expect(r.http).toBe(500);
    expect(r.error.statusCode).toBe(503);
  });

  it("an event whose worker died (stale lock) is picked up again", async () => {
    const { order, payment, mid } = await fresh();
    await PaymentWebhookEvent.create({
      eventId: "evt_stale", gatewayName: "RAZORPAY", eventType: "payment.captured", payloadHash: "x",
      status: "PROCESSING", attempts: 1, lockedAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    const r = await deliver(rzp.paymentCaptured(rzp.payment("pay_stale", "captured", { merchantOrderId: mid })), { eventId: "evt_stale" });
    expect(r.http).toBe(200);
    expect((await PaymentWebhookEvent.findOne({ eventId: "evt_stale" }).lean()).attempts).toBe(2);
    expect((await reload(order, payment)).order.paymentStatus).toBe("PAID");
  });

  it("legacy event rows (no status field) are treated as already processed", async () => {
    await PaymentWebhookEvent.collection.insertOne({
      eventId: "evt_legacy", gatewayName: "RAZORPAY", eventType: "captured", payloadHash: "x", processedAt: new Date(),
    });
    const { mid } = await fresh();
    const r = await deliver(rzp.paymentCaptured(rzp.payment("pay_l", "captured", { merchantOrderId: mid })), { eventId: "evt_legacy" });
    expect(r.result.duplicate).toBe(true);
    expect(mockAfterPlaceOrderV2).not.toHaveBeenCalled();
  });

  it("alerts admins once when the same event keeps failing", async () => {
    const { mid } = await fresh();
    const ev = rzp.paymentCaptured(rzp.payment("pay_fail", "captured", { merchantOrderId: mid }));
    for (let i = 0; i < 4; i += 1) {
      failEmitOnce = "PAYMENT_SUCCESS";
      // eslint-disable-next-line no-await-in-loop
      await deliver(ev, { eventId: "evt_keepfailing" });
    }
    const alerts = emits("GENERIC_ALERT").filter((e) => /keeps failing/i.test(e.payload.title));
    expect(alerts).toHaveLength(1);
  });

  it("falls back to a deterministic event id when Razorpay sends no event-id header", async () => {
    const { mid } = await fresh();
    const ev = rzp.paymentCaptured(rzp.payment("pay_noheader", "captured", { merchantOrderId: mid }));
    const raw = Buffer.from(JSON.stringify(ev));
    const crypto = await import("crypto");
    const sig = crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw.toString("utf8")).digest("hex");
    const a = await processWebhook({ rawBody: raw, authorization: sig });
    const b = await processWebhook({ rawBody: raw, authorization: sig });
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
  });
});

describe("Phase 3 — Payment Link and QR events", () => {
  it("payment_link.paid alone completes the payment (the signal this checkout actually uses)", async () => {
    const { order, payment, mid, linkId } = await fresh();
    const p = rzp.payment("pay_pl", "captured", { merchantOrderId: mid });
    const r = await deliver(rzp.linkEvent("payment_link.paid", { linkId, referenceId: mid, status: "paid", payment: p }));
    expect(r.http).toBe(200);
    const s2 = await reload(order, payment);
    expect(s2.payment.status).toBe("CAPTURED");
    expect(s2.payment.gatewayPaymentId).toBe("pay_pl");
    expect(s2.order.paymentStatus).toBe("PAID");
  });

  it("payment_link.paid with a wrong paid amount is rejected and flagged", async () => {
    const { order, payment, mid, linkId } = await fresh();
    await deliver(rzp.linkEvent("payment_link.paid", { linkId, referenceId: mid, status: "paid", amountPaid: 4000 }));
    const s2 = await reload(order, payment);
    expect(s2.payment.status).toBe("PENDING");
    expect(s2.payment.reconciliation.items[0].reason).toBe("AMOUNT_MISMATCH");
  });

  it("qr_code.credited is routed to the COD QR service with the event id, and recorded as processed", async () => {
    const ev = rzp.qr("qr_code.credited", "qr_77", rzp.payment("pay_qr", "captured", {}));
    const r = await deliver(ev, { eventId: "evt_qr1" });
    expect(r.http).toBe(200);
    expect(mockProcessQr).toHaveBeenCalledWith(
      expect.objectContaining({ event: "qr_code.credited", eventId: "evt_qr1" }),
    );
    expect((await PaymentWebhookEvent.findOne({ eventId: "evt_qr1" }).lean()).status).toBe("PROCESSED");
  });

  it("qr_code.closed is routed too", async () => {
    await deliver(rzp.qr("qr_code.closed", "qr_77"), { eventId: "evt_qr2" });
    expect(mockProcessQr).toHaveBeenCalledWith(expect.objectContaining({ event: "qr_code.closed" }));
  });

  it("a QR event for an unknown QR is stored as IGNORED, not an error", async () => {
    mockProcessQr.mockResolvedValueOnce({ handled: false, reason: "unknown_qr" });
    const r = await deliver(rzp.qr("qr_code.credited", "qr_other"), { eventId: "evt_qr3" });
    expect(r.http).toBe(200);
    expect((await PaymentWebhookEvent.findOne({ eventId: "evt_qr3" }).lean()).status).toBe("IGNORED");
  });

  it("a QR processing failure is retryable on redelivery", async () => {
    mockProcessQr.mockRejectedValueOnce(new Error("db blip"));
    const ev = rzp.qr("qr_code.credited", "qr_77", rzp.payment("pay_qr2", "captured", {}));
    expect((await deliver(ev, { eventId: "evt_qr4" })).http).toBe(500);
    expect((await deliver(ev, { eventId: "evt_qr4" })).http).toBe(200);
    expect(mockProcessQr).toHaveBeenCalledTimes(2);
  });

  it("unrelated / unsupported events are acknowledged and ignored", async () => {
    for (const name of ["payment.authorized", "subscription.charged", "payment.dispute.created"]) {
      // eslint-disable-next-line no-await-in-loop
      const r = await deliver(rzp.event(name, { payment: { entity: rzp.payment("pay_i", "authorized", {}) } }));
      expect(r.http).toBe(200);
      // eslint-disable-next-line no-await-in-loop
      expect((await PaymentWebhookEvent.findOne({ eventId: r.eventId }).lean()).status).toBe("IGNORED");
    }
  });
});

describe("Phase 4 — refund tracking", () => {
  async function captured(extra) {
    const f = await fresh(extra);
    await deliver(rzp.paymentCaptured(rzp.payment("pay_1", "captured", { merchantOrderId: f.mid })));
    emitted.length = 0;
    return f;
  }

  it("records a partial refund (id, amount, status, timestamps) and keeps the payment PAID", async () => {
    const { order, payment } = await captured();
    await deliver(rzp.refund("refund.created", { id: "rfnd_a", amount: 2500, status: "pending" }));
    let p = await Payment.findById(payment._id).lean();
    expect(p.refunds).toHaveLength(1);
    expect(p.refunds[0]).toMatchObject({ refundId: "rfnd_a", amount: 2500, status: "pending", gatewayPaymentId: "pay_1" });
    expect(p.refundState).toBe("NONE");

    await deliver(rzp.refund("refund.processed", { id: "rfnd_a", amount: 2500, status: "processed" }));
    p = await Payment.findById(payment._id).lean();
    expect(p.refunds[0].status).toBe("processed");
    expect(p.refunds[0].processedAt).toBeTruthy();
    expect(p.refunds[0].createdAtGateway).toBeTruthy();
    expect(p.refundedAmount).toBe(2500);
    expect(p.refundState).toBe("PARTIAL");
    expect(p.status).toBe("CAPTURED");
    expect((await Order.findById(order._id).lean()).paymentStatus).toBe("PAID");
    expect(emits("REFUND_COMPLETED")).toHaveLength(1);
  });

  it("redelivery and different event ids for the same refund do not duplicate it or re-notify", async () => {
    const { payment } = await captured();
    const ev = rzp.refund("refund.processed", { id: "rfnd_b", amount: 2500, status: "processed" });
    await deliver(ev, { eventId: "evt_rb1" });
    await deliver(ev, { eventId: "evt_rb1" });
    await deliver(ev, { eventId: "evt_rb2" });
    const p = await Payment.findById(payment._id).lean();
    expect(p.refunds).toHaveLength(1);
    expect(p.refundedAmount).toBe(2500);
    expect(emits("REFUND_COMPLETED")).toHaveLength(1);
  });

  it("an older status arriving late never downgrades a processed refund", async () => {
    const { payment } = await captured();
    await deliver(rzp.refund("refund.processed", { id: "rfnd_c", amount: 2500, status: "processed" }));
    await deliver(rzp.refund("refund.created", { id: "rfnd_c", amount: 2500, status: "pending" }));
    await deliver(rzp.refund("refund.failed", { id: "rfnd_c", amount: 2500, status: "failed" }));
    const p = await Payment.findById(payment._id).lean();
    expect(p.refunds[0].status).toBe("processed");
    expect(p.refundedAmount).toBe(2500);
    expect(emits("GENERIC_ALERT")).toHaveLength(0);
  });

  it("several partial refunds accumulate", async () => {
    const { payment } = await captured();
    await deliver(rzp.refund("refund.processed", { id: "rfnd_d1", amount: 2500, status: "processed" }));
    await deliver(rzp.refund("refund.processed", { id: "rfnd_d2", amount: 3000, status: "processed" }));
    const p = await Payment.findById(payment._id).lean();
    expect(p.refunds.map((r) => r.refundId).sort()).toEqual(["rfnd_d1", "rfnd_d2"]);
    expect(p.refundedAmount).toBe(5500);
    expect(p.refundState).toBe("PARTIAL");
  });

  it("a full refund moves the payment and its orders to REFUNDED exactly once", async () => {
    const { order, payment } = await captured();
    const ev = rzp.refund("refund.processed", { id: "rfnd_full", amount: 10000, status: "processed" });
    await deliver(ev, { eventId: "evt_full1" });
    await deliver(ev, { eventId: "evt_full2" });
    const p = await Payment.findById(payment._id).lean();
    expect(p.status).toBe("REFUNDED");
    expect(p.refundState).toBe("FULL");
    expect(p.statusHistory.filter((h) => h.toStatus === "REFUNDED")).toHaveLength(1);
    expect((await Order.findById(order._id).lean()).paymentStatus).toBe("REFUNDED");
    expect(emits("REFUND_COMPLETED")).toHaveLength(1);
  });

  it("two partial refunds that add up to the full amount refund the payment", async () => {
    const { payment } = await captured();
    await deliver(rzp.refund("refund.processed", { id: "rfnd_e1", amount: 6000, status: "processed" }));
    await deliver(rzp.refund("refund.processed", { id: "rfnd_e2", amount: 4000, status: "processed" }));
    const p = await Payment.findById(payment._id).lean();
    expect(p.status).toBe("REFUNDED");
    expect(p.refundedAmount).toBe(10000);
  });

  it("a failed refund alerts admins once and is flagged for reconciliation; the refunded total is unaffected", async () => {
    const { payment } = await captured();
    const ev = rzp.refund("refund.failed", { id: "rfnd_bad", amount: 2500, status: "failed" });
    await deliver(ev, { eventId: "evt_bad1" });
    await deliver(ev, { eventId: "evt_bad2" });
    const p = await Payment.findById(payment._id).lean();
    expect(p.refunds[0].status).toBe("failed");
    expect(p.refunds[0].failedAt).toBeTruthy();
    expect(p.refundedAmount).toBe(0);
    expect(p.status).toBe("CAPTURED");
    expect(p.reconciliation.items.map((i) => i.reason)).toEqual(["REFUND_FAILED"]);
    expect(emits("GENERIC_ALERT")).toHaveLength(1);
  });

  it("a failed refund that is later retried successfully ends up processed", async () => {
    const { payment } = await captured();
    await deliver(rzp.refund("refund.failed", { id: "rfnd_retry", amount: 2500, status: "failed" }));
    await deliver(rzp.refund("refund.processed", { id: "rfnd_retry", amount: 2500, status: "processed" }));
    const p = await Payment.findById(payment._id).lean();
    expect(p.refunds[0].status).toBe("processed");
    expect(p.refundedAmount).toBe(2500);
  });

  it("refunds exceeding the paid amount are flagged", async () => {
    const { payment } = await captured();
    await deliver(rzp.refund("refund.processed", { id: "rfnd_x", amount: 12000, status: "processed" }));
    const p = await Payment.findById(payment._id).lean();
    expect(p.reconciliation.items.map((i) => i.reason)).toContain("REFUND_EXCEEDS_PAYMENT");
  });

  it("a refund for a payment we do not know is recorded as UNMATCHED; a failed one alerts", async () => {
    const ok = await deliver(rzp.refund("refund.processed", { id: "rfnd_u1", paymentId: "pay_unknown", status: "processed" }));
    expect((await PaymentWebhookEvent.findOne({ eventId: ok.eventId }).lean()).status).toBe("UNMATCHED");
    expect(emits("GENERIC_ALERT")).toHaveLength(0);
    await deliver(rzp.refund("refund.failed", { id: "rfnd_u2", paymentId: "pay_unknown", status: "failed" }));
    expect(emits("GENERIC_ALERT")).toHaveLength(1);
  });

  it("refunds of COD QR payments are tracked too", async () => {
    const orderId = new mongoose.Types.ObjectId();
    const qr = await CodQrPayment.create({
      order: orderId, orderId: "ORD-QR-1", amountPaise: 10000, expiresAt: new Date(Date.now() + 60000),
      status: "PAID", razorpayQrId: "qr_9", razorpayPaymentId: "pay_qrr", isActive: false,
    });
    await deliver(rzp.refund("refund.processed", { id: "rfnd_qr", paymentId: "pay_qrr", amount: 4000, status: "processed" }));
    const doc = await CodQrPayment.findById(qr._id).lean();
    expect(doc.refunds).toHaveLength(1);
    expect(doc.refundedAmount).toBe(4000);
    expect(doc.refundState).toBe("PARTIAL");

    await deliver(rzp.refund("refund.failed", { id: "rfnd_qr2", paymentId: "pay_qrr", amount: 1000, status: "failed" }));
    expect(emits("GENERIC_ALERT")).toHaveLength(1);
  });

  it("refund events never re-run capture side effects", async () => {
    await captured();
    mockAfterPlaceOrderV2.mockClear();
    emitted.length = 0;
    await deliver(rzp.refund("refund.created", { id: "rfnd_s", amount: 2500, status: "pending" }));
    await deliver(rzp.refund("refund.processed", { id: "rfnd_s", amount: 2500, status: "processed" }));
    expect(mockAfterPlaceOrderV2).not.toHaveBeenCalled();
    expect(emits("PAYMENT_SUCCESS")).toHaveLength(0);
    expect(emits("NEW_ORDER")).toHaveLength(0);
  });
});
