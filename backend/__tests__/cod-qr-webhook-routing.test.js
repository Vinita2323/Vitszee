import crypto from "crypto";
import { jest } from "@jest/globals";

/**
 * processWebhook entry point: signature verification and routing of
 * Razorpay QR events to the COD QR service (real RazorpayAdapter).
 */

const SECRET = "razorpay-webhook-test-secret";
const sign = (body) => crypto.createHmac("sha256", SECRET).update(body).digest("hex");

const mockProcessQr = jest.fn(async () => ({ handled: true, completed: true }));
const mockWebhookEventCreate = jest.fn(async () => ({}));
const mockPaymentFindOne = jest.fn(async () => null);

jest.unstable_mockModule("../app/services/codQrPaymentService.js", () => ({
  processQrWebhookEvent: mockProcessQr,
}));
jest.unstable_mockModule("../app/models/order.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/checkoutGroup.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/payment.js", () => ({
  default: { findOne: mockPaymentFindOne },
}));
jest.unstable_mockModule("../app/models/paymentWebhookEvent.js", () => ({
  default: { create: mockWebhookEventCreate, updateOne: jest.fn() },
}));
jest.unstable_mockModule("../app/services/finance/orderFinanceService.js", () => ({
  handleOnlineOrderFinance: jest.fn(),
}));
jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  afterPlaceOrderV2: jest.fn(),
  proceedToDeliverySearch: jest.fn(),
}));
jest.unstable_mockModule("../app/services/stockService.js", () => ({
  releaseReservedStockForOrder: jest.fn(),
}));
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: jest.fn(),
}));

const { processWebhook } = await import("../app/services/paymentService.js");

const qrBody = Buffer.from(
  JSON.stringify({
    event: "qr_code.credited",
    created_at: 1_760_000_000,
    payload: {
      qr_code: { entity: { id: "qr_1" } },
      payment: { entity: { id: "pay_1", status: "captured", amount: 49950, currency: "INR" } },
    },
  }),
);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.PAYMENT_PROVIDER = "razorpay";
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
});

describe("Razorpay QR webhook entry point", () => {
  it("rejects a tampered signature (401) and never reaches the QR service", async () => {
    await expect(
      processWebhook({ rawBody: qrBody, authorization: "not-the-signature" }),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(mockProcessQr).not.toHaveBeenCalled();
  });

  it("rejects a signature computed over a different body", async () => {
    await expect(
      processWebhook({ rawBody: qrBody, authorization: sign("{}") }),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(mockProcessQr).not.toHaveBeenCalled();
  });

  it("routes a correctly signed qr_code.credited event to the QR service", async () => {
    const result = await processWebhook({
      rawBody: qrBody,
      authorization: sign(qrBody.toString("utf8")),
      webhookEventId: "evt_123",
    });

    expect(result).toMatchObject({ accepted: true, qr: true, completed: true });
    expect(mockProcessQr).toHaveBeenCalledWith({
      event: "qr_code.credited",
      payload: expect.objectContaining({ qr_code: { entity: { id: "qr_1" } } }),
      eventId: "evt_123",
    });
    // QR events must not consume the one-shot payment-link dedupe record,
    // otherwise a failed attempt could never be retried by Razorpay.
    expect(mockWebhookEventCreate).not.toHaveBeenCalled();
  });

  it("propagates processing errors so Razorpay retries the delivery", async () => {
    mockProcessQr.mockRejectedValueOnce(new Error("db down"));
    await expect(
      processWebhook({ rawBody: qrBody, authorization: sign(qrBody.toString("utf8")) }),
    ).rejects.toThrow("db down");
  });

  it("leaves existing payment-link events on the original path", async () => {
    const body = Buffer.from(
      JSON.stringify({
        event: "payment_link.paid",
        created_at: 1,
        payload: { payment_link: { entity: { id: "plink_1", reference_id: "CHK-1-A1", status: "paid" } } },
      }),
    );
    const result = await processWebhook({ rawBody: body, authorization: sign(body.toString("utf8")) });
    expect(mockProcessQr).not.toHaveBeenCalled();
    expect(mockWebhookEventCreate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ accepted: true, ignored: true });
  });
});
