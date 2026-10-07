import crypto from "crypto";
import { PAYMENT_STATUS } from "../app/constants/payment.js";
import { RazorpayAdapter } from "../app/services/payment/providers/razorpay.adapter.js";

const SECRET = "razorpay-webhook-test-secret";

function sign(body) {
  return crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

describe("Razorpay webhook", () => {
  const adapter = new RazorpayAdapter();

  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  });

  it("accepts a signature of the raw body and rejects a parsed object", async () => {
    const body = JSON.stringify({ event: "payment_link.paid", created_at: 1 });
    await expect(adapter.validateWebhook({
      rawBody: Buffer.from(body),
      authorization: sign(body),
    })).resolves.toBe(true);

    await expect(adapter.validateWebhook({
      rawBody: Buffer.from(body),
      authorization: "not-the-signature",
    })).resolves.toBe(false);

    await expect(adapter.validateWebhook({
      rawBody: { event: "payment_link.paid" },
      authorization: sign(body),
    })).rejects.toThrow("raw request bytes");
  });

  it("reads the order reference from a payment link event", async () => {
    const body = Buffer.from(JSON.stringify({
      event: "payment_link.paid",
      created_at: 1710000000,
      payload: {
        payment: { entity: { id: "pay_123", status: "captured" } },
        payment_link: {
          entity: {
            id: "plink_123",
            reference_id: "order-ref-1",
            status: "paid",
          },
        },
      },
    }));

    const first = await adapter.decodeWebhookPayload({ rawBody: body });
    const second = await adapter.decodeWebhookPayload({ rawBody: body });

    expect(first.merchantOrderId).toBe("order-ref-1");
    expect(first.state).toBe("paid");
    expect(first.transactionId).toBe("pay_123");
    expect(first.eventId).toBe(second.eventId);
    expect(adapter.mapStatusToInternal(first.state)).toBe(PAYMENT_STATUS.CAPTURED);
  });

  it("reads a captured payment from the notes written at checkout", async () => {
    const body = Buffer.from(JSON.stringify({
      event: "payment.captured",
      created_at: 1710000001,
      payload: {
        payment: {
          entity: {
            id: "pay_456",
            status: "captured",
            notes: { merchantOrderId: "order-ref-2" },
          },
        },
      },
    }));

    const decoded = await adapter.decodeWebhookPayload({ rawBody: body });
    expect(decoded.merchantOrderId).toBe("order-ref-2");
    expect(decoded.state).toBe("captured");
    expect(adapter.mapStatusToInternal(decoded.state)).toBe(PAYMENT_STATUS.CAPTURED);
  });

  it("refuses to verify when the webhook secret is missing", async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    await expect(adapter.validateWebhook({
      rawBody: Buffer.from("{}"),
      authorization: "sig",
    })).rejects.toThrow("webhook secret is not configured");
  });
});
