import crypto from "crypto";
import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { startMemoryMongo, prepareCollections, clearAll, stopMemoryMongo } from "./helpers/memoryMongo.js";
import { rzp, sign, WEBHOOK_SECRET } from "./helpers/razorpayEvents.js";

process.env.NODE_ENV = "test";
process.env.PAYMENT_PROVIDER = "razorpay";
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.FRONTEND_URL = "https://shop.example.test";
process.env.GLOBAL_RATE_LIMIT_MAX = "2";
process.env.WEBHOOK_RATE_LIMIT_MAX = "5";

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
jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  afterPlaceOrderV2: mockAfterPlaceOrderV2,
  proceedToDeliverySearch: jest.fn(async () => {}),
}));
jest.unstable_mockModule("../app/services/codQrPaymentService.js", () => ({
  processQrWebhookEvent: jest.fn(async () => ({ handled: true })),
}));

await startMemoryMongo("webhook_http");
const { default: Order } = await import("../app/models/order.js");
const { default: Payment } = await import("../app/models/payment.js");
const { RazorpayAdapter, signaturesMatch } = await import("../app/services/payment/providers/razorpay.adapter.js");
const { __setActivePaymentProviderForTests } = await import("../app/services/payment/providerRegistry.js");
const { createPaymentOrderForOrderRef, verifyPaymentStatus } = await import("../app/services/paymentService.js");
const { apiRateLimiter, WEBHOOK_PATHS } = await import("../app/middleware/securityMiddlewares.js");
const { default: paymentRoute } = await import("../app/routes/paymentRoutes.js");
await prepareCollections();

// Same middleware order as index.js: raw body for webhooks BEFORE express.json().
function buildApp({ withLimiter = false } = {}) {
  const app = express();
  if (withLimiter) app.use(apiRateLimiter);
  app.use(WEBHOOK_PATHS, express.raw({ type: "application/json", limit: "1mb" }));
  app.use(express.json());
  app.use("/api/payments", paymentRoute);
  return app;
}
const app = buildApp();
const URL = "/api/payments/webhook/razorpay";

// A provider whose checkout calls are faked (no network) but whose webhook
// validation/decoding is the real Razorpay adapter.
let linkState = { state: "created" };
const real = new RazorpayAdapter();
const provider = Object.assign(Object.create(real), {
  initiatePayment: async ({ merchantOrderId }) => ({
    redirectUrl: `https://rzp.io/i/${merchantOrderId}`,
    gatewayResponse: { id: `plink_${merchantOrderId}`, short_url: `https://rzp.io/i/${merchantOrderId}` },
  }),
  getPaymentStatus: async () => linkState,
});
__setActivePaymentProviderForTests(provider, "razorpay");

const customer = new mongoose.Types.ObjectId();
let n = 0;
async function newOrder() {
  n += 1;
  return Order.create({
    customer,
    seller: new mongoose.Types.ObjectId(),
    orderId: `ORD-HTTP-${n}`,
    paymentMode: "ONLINE",
    workflowVersion: 2,
    workflowStatus: "CREATED",
    status: "pending",
    paymentStatus: "CREATED",
    pricing: { total: 100 },
    paymentBreakdown: { grandTotal: 100 },
  });
}

/** POST a signed webhook exactly as Razorpay would (raw JSON bytes + HMAC header). */
function post(body, { eventId, signature, contentType = "application/json", rawText } = {}) {
  const text = rawText ?? JSON.stringify(body);
  const req = request(app).post(URL).set("Content-Type", contentType);
  req.set("x-razorpay-signature", signature ?? sign(text));
  if (eventId) req.set("x-razorpay-event-id", eventId);
  return req.send(text);
}

beforeEach(async () => {
  await clearAll();
  emitted.length = 0;
  failEmitOnce = null;
  linkState = { state: "created" };
  jest.clearAllMocks();
});
afterAll(async () => {
  await stopMemoryMongo();
});

describe("Phase 5 — signature verification", () => {
  const secret = "s3cret";
  const body = '{"event":"payment.captured"}';
  const good = crypto.createHmac("sha256", secret).update(body).digest("hex");

  it("accepts the correct HMAC-SHA256 signature", () => {
    expect(signaturesMatch(body, good, secret)).toBe(true);
  });

  it("rejects wrong, truncated, padded, non-hex and empty signatures", () => {
    expect(signaturesMatch(body, "0".repeat(64), secret)).toBe(false);
    expect(signaturesMatch(body, good.slice(0, 63), secret)).toBe(false);
    expect(signaturesMatch(body, `${good}00`, secret)).toBe(false);
    expect(signaturesMatch(body, ` ${good}`, secret)).toBe(false);
    expect(signaturesMatch(body, "z".repeat(64), secret)).toBe(false);
    expect(signaturesMatch(body, "", secret)).toBe(false);
  });

  it("rejects a valid signature over a different body or secret", () => {
    expect(signaturesMatch(`${body} `, good, secret)).toBe(false);
    expect(signaturesMatch(body, good, "other-secret")).toBe(false);
  });

  it("compares in constant time (crypto.timingSafeEqual)", () => {
    const spy = jest.spyOn(crypto, "timingSafeEqual");
    signaturesMatch(body, good, secret);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("fails closed, without leaking the secret, when no webhook secret is configured", async () => {
    const saved = process.env.RAZORPAY_WEBHOOK_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    try {
      await expect(real.validateWebhook({ rawBody: Buffer.from(body), authorization: good })).rejects.toThrow(/not configured/);
      const res = await post({ event: "payment.captured" });
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body) + res.text).not.toContain(WEBHOOK_SECRET);
    } finally {
      process.env.RAZORPAY_WEBHOOK_SECRET = saved;
    }
  });
});

describe("Phase 5 — webhook rate limiting", () => {
  it("webhooks use their own, higher ceiling; the browser-API bucket is unaffected by them", async () => {
    const limited = buildApp({ withLimiter: true });
    const ping = (path) => request(limited).post(path).set("x-forwarded-for", "10.9.9.9").send({});
    // global limit is 2/min for normal API paths…
    expect((await ping("/api/payments/create-order")).status).not.toBe(429);
    expect((await ping("/api/payments/create-order")).status).not.toBe(429);
    expect((await ping("/api/payments/create-order")).status).toBe(429);
    // …but the same client can still deliver webhooks (limit 5/min for this test)
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect((await ping(URL)).status).not.toBe(429); // 401: unsigned, but not rate limited
    }
    expect((await ping(URL)).status).toBe(429);
  });
});

describe("Phase 6 — HTTP end-to-end (real route, real raw-body handling)", () => {
  it("is public (no JWT) and rejects missing / invalid / tampered signatures with 401", async () => {
    const order = await newOrder();
    const ev = rzp.paymentCaptured(rzp.payment("pay_h1", "captured", { merchantOrderId: `${order.orderId}-A1` }));

    const noSig = await request(app).post(URL).set("Content-Type", "application/json").send(JSON.stringify(ev));
    expect(noSig.status).toBe(401);
    expect((await post(ev, { signature: "deadbeef" })).status).toBe(401);
    expect((await post(ev, { signature: "0".repeat(64) })).status).toBe(401);

    // signed over one serialisation, delivered with different whitespace
    const signedText = JSON.stringify(ev);
    expect((await post(null, { rawText: `${signedText} `, signature: sign(signedText) })).status).toBe(401);
  });

  it("a non-JSON content type cannot be verified and is rejected (400), never processed", async () => {
    const res = await post({ event: "payment.captured" }, { contentType: "text/plain" });
    expect(res.status).toBe(400);
  });

  it("checkout → failed attempt → retry on the SAME link → paid completes the order", async () => {
    const order = await newOrder();

    const first = await createPaymentOrderForOrderRef({ orderRef: order.orderId, userId: String(customer) });
    const mid = first.payment.gatewayOrderId;
    expect(first.payment.gatewayLinkId).toBe(`plink_${mid}`); // stored for later matching
    expect(first.redirectUrl).toBe(`https://rzp.io/i/${mid}`);

    // customer's first payment attempt fails
    const failed = await post(rzp.paymentFailed(rzp.payment("pay_bad", "failed", { merchantOrderId: mid })), { eventId: "evt_h_f" });
    expect(failed.status).toBe(200);
    let o = await Order.findById(order._id).lean();
    expect(o.status).toBe("pending");
    expect(o.workflowStatus).toBe("CREATED");

    // they retry: the same open link is returned, no new payment created
    const retry = await createPaymentOrderForOrderRef({ orderRef: order.orderId, userId: String(customer) });
    expect(retry.duplicate).toBe(true);
    expect(retry.redirectUrl).toBe(first.redirectUrl);
    expect(await Payment.countDocuments({ order: order._id })).toBe(1);

    // second attempt succeeds: payment_link.paid
    const paid = await post(
      rzp.linkEvent("payment_link.paid", {
        linkId: first.payment.gatewayLinkId, referenceId: mid, status: "paid",
        payment: rzp.payment("pay_good", "captured", { merchantOrderId: mid }),
      }),
      { eventId: "evt_h_p" },
    );
    expect(paid.status).toBe(200);
    o = await Order.findById(order._id).lean();
    expect(o.paymentStatus).toBe("PAID");
    expect(o.workflowStatus).toBe("SELLER_PENDING");
    expect(mockAfterPlaceOrderV2).toHaveBeenCalledTimes(1);

    // checkout can no longer start another payment for a paid order
    await expect(createPaymentOrderForOrderRef({ orderRef: order.orderId, userId: String(customer) }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it("an expired link cancels the order and a new checkout attempt is refused for the cancelled order", async () => {
    const order = await newOrder();
    const first = await createPaymentOrderForOrderRef({ orderRef: order.orderId, userId: String(customer) });
    const mid = first.payment.gatewayOrderId;

    const res = await post(
      rzp.linkEvent("payment_link.expired", { linkId: first.payment.gatewayLinkId, referenceId: mid, status: "expired", amountPaid: 0 }),
    );
    expect(res.status).toBe(200);
    const o = await Order.findById(order._id).lean();
    expect(o.status).toBe("cancelled");
    expect((await Payment.findById(first.payment._id).lean()).status).toBe("CANCELLED");
    await expect(createPaymentOrderForOrderRef({ orderRef: order.orderId, userId: String(customer) }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it("late payment on the expired link is flagged for reconciliation over HTTP", async () => {
    const order = await newOrder();
    const first = await createPaymentOrderForOrderRef({ orderRef: order.orderId, userId: String(customer) });
    const mid = first.payment.gatewayOrderId;
    await post(rzp.linkEvent("payment_link.expired", { linkId: first.payment.gatewayLinkId, referenceId: mid, status: "expired", amountPaid: 0 }));
    emitted.length = 0;

    const late = await post(rzp.paymentCaptured(rzp.payment("pay_late", "captured", { merchantOrderId: mid })));
    expect(late.status).toBe(200);
    const p = await Payment.findById(first.payment._id).lean();
    expect(p.status).toBe("CAPTURED");
    expect(p.reconciliation.required).toBe(true);
    expect(emitted.filter((e) => e.type === "GENERIC_ALERT")).toHaveLength(1);
  });

  it("duplicate delivery returns 200 and does not re-apply; a failed first delivery is retried to success", async () => {
    const order = await newOrder();
    const first = await createPaymentOrderForOrderRef({ orderRef: order.orderId, userId: String(customer) });
    const mid = first.payment.gatewayOrderId;
    const ev = rzp.paymentCaptured(rzp.payment("pay_dup", "captured", { merchantOrderId: mid }));

    failEmitOnce = "PAYMENT_SUCCESS";
    expect((await post(ev, { eventId: "evt_h_dup" })).status).toBe(500); // Razorpay will retry
    expect((await post(ev, { eventId: "evt_h_dup" })).status).toBe(200); // retry succeeds
    expect((await post(ev, { eventId: "evt_h_dup" })).status).toBe(200); // late duplicate
    const o = await Order.findById(order._id).lean();
    expect(o.paymentStatus).toBe("PAID");
    expect(mockAfterPlaceOrderV2).toHaveBeenCalledTimes(1);
    expect(emitted.filter((e) => e.type === "PAYMENT_SUCCESS")).toHaveLength(1);
  });

  it("client-side verification (fallback when a webhook is delayed) and the webhook never double-process", async () => {
    const order = await newOrder();
    const first = await createPaymentOrderForOrderRef({ orderRef: order.orderId, userId: String(customer) });
    const mid = first.payment.gatewayOrderId;

    linkState = {
      state: "paid", transactionId: first.payment.gatewayLinkId, linkId: first.payment.gatewayLinkId,
      paymentId: "pay_v", amountPaidPaise: 10000, currency: "INR",
    };
    const verified = await verifyPaymentStatus({ merchantOrderId: mid, userId: String(customer) });
    expect(verified.payment.status).toBe("CAPTURED");
    expect(verified.payment.gatewayPaymentId).toBe("pay_v");
    expect((await Order.findById(order._id).lean()).paymentStatus).toBe("PAID");

    // the (now late) webhook for the same payment changes nothing
    const res = await post(rzp.paymentCaptured(rzp.payment("pay_v", "captured", { merchantOrderId: mid })));
    expect(res.status).toBe(200);
    expect(mockAfterPlaceOrderV2).toHaveBeenCalledTimes(1);
    expect(emitted.filter((e) => e.type === "PAYMENT_SUCCESS")).toHaveLength(1);
    expect((await Payment.findById(first.payment._id).lean()).reconciliation.required).toBe(false);
  });

  it("client verification of an under-paid link is refused and flagged", async () => {
    const order = await newOrder();
    const first = await createPaymentOrderForOrderRef({ orderRef: order.orderId, userId: String(customer) });
    linkState = { state: "paid", linkId: first.payment.gatewayLinkId, paymentId: "pay_short", amountPaidPaise: 5000, currency: "INR" };
    const verified = await verifyPaymentStatus({ merchantOrderId: first.payment.gatewayOrderId, userId: String(customer) });
    expect(verified.payment.status).toBe("PENDING");
    expect(verified.payment.reconciliation.items[0].reason).toBe("AMOUNT_MISMATCH");
  });

  it("verifying someone else's payment is still forbidden", async () => {
    const order = await newOrder();
    const first = await createPaymentOrderForOrderRef({ orderRef: order.orderId, userId: String(customer) });
    await expect(
      verifyPaymentStatus({ merchantOrderId: first.payment.gatewayOrderId, userId: String(new mongoose.Types.ObjectId()) }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("all six dashboard events plus payment_link.* and qr_code.* are acknowledged with 200", async () => {
    const order = await newOrder();
    const first = await createPaymentOrderForOrderRef({ orderRef: order.orderId, userId: String(customer) });
    const mid = first.payment.gatewayOrderId;
    const p = rzp.payment("pay_all", "captured", { merchantOrderId: mid, orderId: "order_all" });
    const events = [
      rzp.paymentFailed(rzp.payment("pay_x", "failed", { merchantOrderId: mid })),
      rzp.paymentCaptured(p),
      rzp.orderPaid(p, { receipt: mid }),
      rzp.refund("refund.created", { id: "rfnd_h", paymentId: "pay_all", amount: 1000, status: "pending", payment: p }),
      rzp.refund("refund.processed", { id: "rfnd_h", paymentId: "pay_all", amount: 1000, status: "processed", payment: p }),
      rzp.refund("refund.failed", { id: "rfnd_h2", paymentId: "pay_all", amount: 1000, status: "failed", payment: p }),
      rzp.linkEvent("payment_link.paid", { linkId: first.payment.gatewayLinkId, referenceId: mid, status: "paid", payment: p }),
      rzp.linkEvent("payment_link.expired", { linkId: first.payment.gatewayLinkId, referenceId: mid, status: "expired" }),
      rzp.linkEvent("payment_link.cancelled", { linkId: first.payment.gatewayLinkId, referenceId: mid, status: "cancelled" }),
      rzp.qr("qr_code.credited", "qr_1", rzp.payment("pay_q", "captured", {})),
      rzp.qr("qr_code.closed", "qr_1"),
    ];
    for (const ev of events) {
      // eslint-disable-next-line no-await-in-loop
      const res = await post(ev);
      expect(res.status).toBe(200);
    }
    const final = await Payment.findById(first.payment._id).lean();
    expect(final.status).toBe("CAPTURED");
    expect(final.refundedAmount).toBe(1000);
    expect(mockAfterPlaceOrderV2).toHaveBeenCalledTimes(1);
  });
});
