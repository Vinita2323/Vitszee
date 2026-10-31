import { jest } from "@jest/globals";
import { createFakeModel } from "./helpers/fakeCollection.js";

/**
 * COD → Razorpay Dynamic QR payment flow. Models and the Razorpay gateway
 * are faked; the service logic under test is the real code.
 */

const Order = createFakeModel();
const CodQr = createFakeModel({
  defaults: () => ({
    razorpayPaymentId: null,
    razorpayQrId: null,
    qrImageUrl: null,
    finalizedAt: null,
    reviewRequired: false,
    duplicatePayments: [],
    webhookEventIds: [],
    auditLog: [],
    isActive: true,
    failureReason: null,
    currency: "INR",
  }),
  uniqueActive: { flag: "isActive", key: "order" },
});

let qrCounter = 0;
const mockCreateDynamicQr = jest.fn(async () => {
  qrCounter += 1;
  return { id: `qr_${qrCounter}`, image_url: `https://rzp.test/qr_${qrCounter}.png`, status: "active" };
});
const mockFetchQr = jest.fn();
const mockFetchQrPayments = jest.fn();
const mockCloseQr = jest.fn(async () => ({}));

const mockHandleOnlineOrderFinance = jest.fn(async (orderId) => {
  const row = Order.rows.find((r) => String(r._id) === String(orderId));
  row.paymentMode = "ONLINE";
  row.paymentStatus = "PAID";
  row.financeFlags = { ...(row.financeFlags || {}), onlinePaymentCaptured: true };
});

const mockComplete = jest.fn(async ({ orderId, extraSet = {}, prepare, now }) => {
  if (prepare) await prepare();
  const row = Order.rows.find(
    (r) => r.orderId === orderId && r.workflowStatus === "OUT_FOR_DELIVERY",
  );
  if (!row) {
    const err = new Error("Could not finalize delivery");
    err.statusCode = 409;
    err.code = "ORDER_NOT_READY";
    throw err;
  }
  Order.findOneAndUpdate(
    { _id: row._id },
    { $set: { status: "delivered", orderStatus: "delivered", workflowStatus: "DELIVERED", ...extraSet } },
  );
  return { order: row, orderId, deliveredAt: now.toISOString(), warning: null };
});

jest.unstable_mockModule("../app/models/order.js", () => ({ default: Order }));
jest.unstable_mockModule("../app/models/codQrPayment.js", () => ({ default: CodQr }));
jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  requireCanonicalOrderId: async (id) => id,
}));
jest.unstable_mockModule("../app/services/finance/orderFinanceService.js", () => ({
  handleOnlineOrderFinance: mockHandleOnlineOrderFinance,
}));
jest.unstable_mockModule("../app/services/deliveryCompletionService.js", () => ({
  completeOutForDeliveryOrder: mockComplete,
}));
jest.unstable_mockModule("../app/services/payment/razorpayQrGateway.js", () => ({
  createDynamicQr: mockCreateDynamicQr,
  fetchQr: mockFetchQr,
  fetchQrPayments: mockFetchQrPayments,
  closeQr: mockCloseQr,
}));
jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: jest.fn(),
  emitToCustomer: jest.fn(),
  emitToDelivery: jest.fn(),
  emitToOrder: jest.fn(),
}));
jest.unstable_mockModule("../app/services/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const svc = await import("../app/services/codQrPaymentService.js");

const RIDER = "rider1";
const ORDER_ID = "ORD1";
const AMOUNT = 499.5; // → 49950 paise (checks rupee→paise rounding)
const PAISE = 49950;

function seedOrder(overrides = {}) {
  return Order.seed({
    orderId: ORDER_ID,
    workflowStatus: "OUT_FOR_DELIVERY",
    status: "out_for_delivery",
    deliveryBoy: RIDER,
    customer: "cust1",
    paymentMode: "COD",
    paymentStatus: "PENDING_CASH_COLLECTION",
    payment: { method: "cash" },
    paymentBreakdown: { grandTotal: AMOUNT, codCollectedAmount: 0 },
    financeFlags: {},
    paymentMethod: null,
    codHandoff: {
      awaitingPayment: true,
      paymentChoice: null,
      proofImages: ["https://img/proof.jpg"],
      otpVerifiedAt: new Date(),
    },
    ...overrides,
  });
}

const payment = (overrides = {}) => ({
  id: "pay_1",
  entity: "payment",
  status: "captured",
  amount: PAISE,
  currency: "INR",
  method: "upi",
  vpa: "customer@upi",
  created_at: 1_760_000_000,
  ...overrides,
});

const credited = (qrId, p = payment()) => ({
  event: "qr_code.credited",
  payload: { qr_code: { entity: { id: qrId } }, payment: { entity: p } },
});

const rider = { role: "delivery", id: RIDER };

async function startQr(regenerate = false) {
  const res = await svc.createOrReuseQr({ orderId: ORDER_ID, deliveryId: RIDER, regenerate });
  return res;
}

beforeEach(() => {
  Order.reset();
  CodQr.reset();
  qrCounter = 0;
  jest.clearAllMocks();
  process.env.COD_QR_PAYMENT_ENABLED = "true";
  mockFetchQr.mockResolvedValue({ status: "active" });
  mockFetchQrPayments.mockResolvedValue({ items: [] });
});

describe("orderRequiresCodPayment", () => {
  it("requires payment for COD orders with money outstanding", () => {
    expect(svc.orderRequiresCodPayment(seedOrder())).toBe(true);
  });

  it("does not change prepaid / already-paid / flag-off flows", () => {
    expect(svc.orderRequiresCodPayment(seedOrder({ paymentMode: "ONLINE", payment: { method: "online" } }))).toBe(false);
    expect(svc.orderRequiresCodPayment(seedOrder({ paymentStatus: "PAID" }))).toBe(false);
    expect(svc.orderRequiresCodPayment(seedOrder({ financeFlags: { codMarkedCollected: true } }))).toBe(false);
    process.env.COD_QR_PAYMENT_ENABLED = "false";
    expect(svc.orderRequiresCodPayment(seedOrder())).toBe(false);
  });
});

describe("QR generation", () => {
  it("creates a QR for exactly the outstanding amount and stores it", async () => {
    seedOrder();
    const res = await startQr();

    expect(mockCreateDynamicQr).toHaveBeenCalledTimes(1);
    const args = mockCreateDynamicQr.mock.calls[0][0];
    expect(args.amountPaise).toBe(PAISE);
    expect(args.closeByUnix).toBeGreaterThan(Math.floor(Date.now() / 1000) + 120);

    expect(res.payment.amountPaise).toBe(PAISE);
    expect(res.payment.qrImageUrl).toBe("https://rzp.test/qr_1.png");
    expect(res.payment.displayStatus).toBe("PAYMENT_PENDING");
    const row = CodQr.rows[0];
    expect(row.razorpayQrId).toBe("qr_1");
    expect(row.status).toBe("PENDING");
    expect(row.expiresAt).toBeInstanceOf(Date);
  });

  it("reuses the live QR instead of creating a duplicate", async () => {
    seedOrder();
    await startQr();
    const second = await startQr();
    expect(second.reused).toBe(true);
    expect(mockCreateDynamicQr).toHaveBeenCalledTimes(1);
    expect(CodQr.rows).toHaveLength(1);
  });

  it("refuses before OTP verification and for other riders", async () => {
    seedOrder({ codHandoff: { awaitingPayment: false } });
    await expect(startQr()).rejects.toMatchObject({ code: "PAYMENT_NOT_REQUIRED" });
    Order.reset();
    seedOrder();
    await expect(
      svc.createOrReuseQr({ orderId: ORDER_ID, deliveryId: "someone-else" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED_DELIVERY" });
  });
});

describe("successful payment (webhook)", () => {
  it("completes the order only after a verified, exact, captured payment", async () => {
    const order = seedOrder();
    await startQr();

    const result = await svc.processQrWebhookEvent({ ...credited("qr_1"), eventId: "evt_1" });

    expect(result).toMatchObject({ handled: true, completed: true });
    expect(order.workflowStatus).toBe("DELIVERED");
    expect(order.status).toBe("delivered");
    expect(order.paymentStatus).toBe("PAID");
    expect(order.paymentMethod).toBe("RAZORPAY_QR");
    expect(order.codHandoff.awaitingPayment).toBe(false);
    expect(mockHandleOnlineOrderFinance).toHaveBeenCalledWith(
      order._id,
      expect.objectContaining({ transactionId: "pay_1" }),
    );
    const row = CodQr.rows[0];
    expect(row.status).toBe("PAID");
    expect(row.razorpayPaymentId).toBe("pay_1");
    expect(row.finalizedAt).toBeInstanceOf(Date);
    expect(row.isActive).toBe(false);
    expect(row.auditLog.map((e) => e.event)).toEqual(
      expect.arrayContaining(["QR_CREATED", "WEBHOOK_RECEIVED", "PAYMENT_VERIFIED", "ORDER_COMPLETED"]),
    );
  });

  it("is idempotent for duplicate webhook delivery", async () => {
    seedOrder();
    await startQr();
    await svc.processQrWebhookEvent({ ...credited("qr_1"), eventId: "evt_1" });
    const again = await svc.processQrWebhookEvent({ ...credited("qr_1"), eventId: "evt_1" });

    expect(again).toMatchObject({ handled: true, completed: true });
    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(mockHandleOnlineOrderFinance).toHaveBeenCalledTimes(1);
    expect(CodQr.rows[0].reviewRequired).toBe(false);
  });

  it("completes exactly once when a webhook and a status poll race", async () => {
    const order = seedOrder();
    await startQr();
    mockFetchQrPayments.mockResolvedValue({ items: [payment()] });

    const results = await Promise.all([
      svc.processQrWebhookEvent({ ...credited("qr_1"), eventId: "evt_race" }),
      svc.verifyCodPayment({ orderId: ORDER_ID, actor: rider }),
      svc.processQrWebhookEvent({ ...credited("qr_1"), eventId: "evt_race" }),
    ]);

    expect(results).toHaveLength(3);
    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(mockHandleOnlineOrderFinance).toHaveBeenCalledTimes(1);
    expect(order.workflowStatus).toBe("DELIVERED");
    expect(CodQr.rows[0].finalizedAt).toBeInstanceOf(Date);
    expect(CodQr.rows[0].reviewRequired).toBe(false);
  });

  it("retries completion when the first attempt failed after the payment was claimed", async () => {
    const order = seedOrder();
    await startQr();
    mockComplete.mockRejectedValueOnce(new Error("db blip"));

    await expect(svc.processQrWebhookEvent({ ...credited("qr_1"), eventId: "e1" })).rejects.toThrow("db blip");
    expect(order.workflowStatus).toBe("OUT_FOR_DELIVERY");
    expect(CodQr.rows[0].status).toBe("PAID");
    expect(CodQr.rows[0].finalizedAt).toBeNull();

    // Razorpay redelivers the webhook → completion succeeds exactly once.
    const retry = await svc.processQrWebhookEvent({ ...credited("qr_1"), eventId: "e1" });
    expect(retry.completed).toBe(true);
    expect(order.workflowStatus).toBe("DELIVERED");
  });
});

describe("payment validation", () => {
  it("rejects an amount mismatch and keeps the order undelivered", async () => {
    const order = seedOrder();
    await startQr();
    const result = await svc.processQrWebhookEvent(credited("qr_1", payment({ amount: PAISE - 100 })));

    expect(result).toMatchObject({ handled: true, completed: false, mismatch: true });
    expect(order.workflowStatus).toBe("OUT_FOR_DELIVERY");
    expect(CodQr.rows[0].reviewRequired).toBe(true);
    expect(CodQr.rows[0].status).toBe("PENDING");
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("does not complete on a payment that is not captured", async () => {
    const order = seedOrder();
    await startQr();
    const result = await svc.processQrWebhookEvent(credited("qr_1", payment({ status: "authorized" })));

    expect(result.completed).toBe(false);
    expect(order.workflowStatus).toBe("OUT_FOR_DELIVERY");
    expect(CodQr.rows[0].auditLog.some((e) => e.event === "PAYMENT_NOT_CAPTURED")).toBe(true);
  });

  it("ignores events for unknown QR codes and unsupported events", async () => {
    seedOrder();
    await startQr();
    expect(await svc.processQrWebhookEvent(credited("qr_unknown"))).toMatchObject({ handled: false });
    expect(
      await svc.processQrWebhookEvent({ event: "qr_code.created", payload: {} }),
    ).toMatchObject({ handled: false });
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("flags a second, different payment on the same QR instead of completing twice", async () => {
    seedOrder();
    await startQr();
    await svc.processQrWebhookEvent(credited("qr_1", payment({ id: "pay_1" })));
    const dup = await svc.processQrWebhookEvent(credited("qr_1", payment({ id: "pay_2" })));

    expect(dup).toMatchObject({ handled: true, completed: false, duplicate: true });
    expect(mockComplete).toHaveBeenCalledTimes(1);
    const row = CodQr.rows[0];
    expect(row.reviewRequired).toBe(true);
    expect(row.duplicatePayments.map((d) => d.paymentId)).toEqual(["pay_2"]);
    expect(row.razorpayPaymentId).toBe("pay_1");
  });
});

describe("pending / failed / expired", () => {
  it("shows Payment Pending and leaves the order open while unpaid", async () => {
    const order = seedOrder();
    await startQr();
    const state = await svc.verifyCodPayment({ orderId: ORDER_ID, actor: rider });

    expect(state.payment.displayStatus).toBe("PAYMENT_PENDING");
    expect(state.completed).toBe(false);
    expect(order.workflowStatus).toBe("OUT_FOR_DELIVERY");
  });

  it("shows Payment Failed, does not complete, and allows a retry with a fresh QR", async () => {
    const order = seedOrder();
    await startQr();
    mockFetchQrPayments.mockResolvedValue({
      items: [payment({ id: "pay_bad", status: "failed", error_description: "UPI declined" })],
    });

    const state = await svc.verifyCodPayment({ orderId: ORDER_ID, actor: rider });
    expect(state.payment.displayStatus).toBe("PAYMENT_FAILED");
    expect(state.payment.failureReason).toBe("UPI declined");
    expect(state.canGenerateQr).toBe(true);
    expect(order.workflowStatus).toBe("OUT_FOR_DELIVERY");

    mockFetchQrPayments.mockResolvedValue({ items: [] });
    const retry = await startQr(true);
    expect(retry.reused).toBe(false);
    expect(retry.payment.razorpayQrId).toBe("qr_2");
    expect(CodQr.rows.filter((r) => r.isActive)).toHaveLength(1);
    expect(mockCloseQr).toHaveBeenCalledWith("qr_1");
  });

  it("handles an expired QR and generates a new one", async () => {
    seedOrder();
    await startQr();
    CodQr.rows[0].expiresAt = new Date(Date.now() - 60_000);
    mockFetchQr.mockResolvedValue({ status: "closed", close_reason: "expired" });

    const state = await svc.verifyCodPayment({ orderId: ORDER_ID, actor: rider });
    expect(state.payment.displayStatus).toBe("QR_EXPIRED");
    expect(CodQr.rows[0].isActive).toBe(false);

    mockFetchQr.mockResolvedValue({ status: "active" });
    const fresh = await startQr();
    expect(fresh.payment.razorpayQrId).toBe("qr_2");
    expect(fresh.payment.displayStatus).toBe("PAYMENT_PENDING");
  });

  it("accepts a payment that lands just after expiry while the order is still open", async () => {
    const order = seedOrder();
    await startQr();
    CodQr.rows[0].expiresAt = new Date(Date.now() - 60_000);
    CodQr.rows[0].status = "EXPIRED";

    const result = await svc.processQrWebhookEvent(credited("qr_1"));
    expect(result.completed).toBe(true);
    expect(order.workflowStatus).toBe("DELIVERED");
    expect(CodQr.rows[0].auditLog.some((e) => e.event === "LATE_PAYMENT_ACCEPTED")).toBe(true);
  });
});

describe("delayed webhook → backend verification via Razorpay API", () => {
  it("completes the order when the status check finds the captured payment", async () => {
    const order = seedOrder();
    await startQr();
    mockFetchQrPayments.mockResolvedValue({ items: [payment()] });

    const state = await svc.verifyCodPayment({ orderId: ORDER_ID, actor: rider });
    expect(state.completed).toBe(true);
    expect(order.paymentMethod).toBe("RAZORPAY_QR");
    expect(CodQr.rows[0].auditLog.some((e) => e.event === "PAYMENT_VERIFIED")).toBe(true);

    // The late webhook then arrives → no double completion.
    await svc.processQrWebhookEvent(credited("qr_1"));
    expect(mockComplete).toHaveBeenCalledTimes(1);
  });

  it("surfaces a gateway outage without touching the order", async () => {
    const order = seedOrder();
    await startQr();
    mockFetchQr.mockRejectedValue(new Error("network"));
    await expect(svc.verifyCodPayment({ orderId: ORDER_ID, actor: rider })).rejects.toMatchObject({
      code: "GATEWAY_UNAVAILABLE",
    });
    expect(order.workflowStatus).toBe("OUT_FOR_DELIVERY");
  });
});

describe("cash as an alternative", () => {
  it("records cash collection, closes the QR and completes the order", async () => {
    const order = seedOrder();
    await startQr();

    const result = await svc.confirmCashCollection({
      orderId: ORDER_ID,
      deliveryId: RIDER,
      amountReceived: 500,
    });

    expect(order.workflowStatus).toBe("DELIVERED");
    expect(order.paymentMethod).toBe("CASH");
    expect(order.codHandoff.cashReceived).toBe(500);
    expect(result.change).toBe(0.5);
    expect(mockHandleOnlineOrderFinance).not.toHaveBeenCalled(); // cash path uses COD settlement
    expect(CodQr.rows[0].status).toBe("CLOSED");
    expect(CodQr.rows[0].isActive).toBe(false);
    expect(mockCloseQr).toHaveBeenCalledWith("qr_1");
  });

  it("rejects insufficient cash", async () => {
    seedOrder();
    await expect(
      svc.confirmCashCollection({ orderId: ORDER_ID, deliveryId: RIDER, amountReceived: 100 }),
    ).rejects.toMatchObject({ code: "CASH_AMOUNT_INVALID" });
  });

  it("refuses cash when the customer already paid the QR", async () => {
    const order = seedOrder();
    await startQr();
    mockFetchQrPayments.mockResolvedValue({ items: [payment()] });

    await expect(
      svc.confirmCashCollection({ orderId: ORDER_ID, deliveryId: RIDER }),
    ).rejects.toMatchObject({ code: "ALREADY_PAID_ONLINE" });
    expect(order.paymentMethod).toBe("RAZORPAY_QR");
    expect(mockComplete).toHaveBeenCalledTimes(1);
  });

  it("flags a QR payment that arrives after cash was taken (no double completion)", async () => {
    const order = seedOrder();
    await startQr();
    await svc.confirmCashCollection({ orderId: ORDER_ID, deliveryId: RIDER });

    const late = await svc.processQrWebhookEvent(credited("qr_1"));
    expect(late).toMatchObject({ handled: true, completed: false, duplicate: true });
    expect(order.paymentMethod).toBe("CASH");
    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(CodQr.rows[0].reviewRequired).toBe(true);
  });

  it("can take cash even when Razorpay is unreachable", async () => {
    const order = seedOrder();
    await startQr();
    mockFetchQr.mockRejectedValue(new Error("network"));
    await svc.confirmCashCollection({ orderId: ORDER_ID, deliveryId: RIDER });
    expect(order.paymentMethod).toBe("CASH");
  });
});

describe("OTP → payment hand-off", () => {
  it("keeps the order out for delivery and opens the payment step", async () => {
    const order = seedOrder({ codHandoff: { awaitingPayment: false } });
    const updated = await svc.beginCodPaymentHandoff({
      order,
      deliveryId: RIDER,
      images: ["https://img/a.jpg"],
      validationLocation: { lat: 22.7, lng: 75.8 },
    });
    expect(updated.workflowStatus).toBe("OUT_FOR_DELIVERY");
    expect(updated.codHandoff.awaitingPayment).toBe(true);
    expect(updated.codHandoff.outstandingAmount).toBe(AMOUNT);
    expect(updated.codHandoff.proofImages).toEqual(["https://img/a.jpg"]);
  });
});
