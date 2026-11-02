import crypto from "crypto";

export const WEBHOOK_SECRET = "test-webhook-secret";

export const sign = (body, secret = WEBHOOK_SECRET) =>
  crypto.createHmac("sha256", secret).update(body).digest("hex");

let seq = 0;

/** Razorpay-shaped payloads (field names follow Razorpay's webhook docs). */
export const rzp = {
  payment(id, status, { merchantOrderId = null, amount = 10000, currency = "INR", orderId = null, extra = {} } = {}) {
    return {
      id,
      entity: "payment",
      status,
      amount,
      currency,
      order_id: orderId,
      method: "upi",
      notes: merchantOrderId ? { merchantOrderId } : {},
      ...extra,
    };
  },
  event(event, payload) {
    seq += 1;
    return { entity: "event", event, created_at: 1_760_000_000 + seq, payload };
  },
  paymentCaptured(payment) {
    return this.event("payment.captured", { payment: { entity: payment } });
  },
  paymentFailed(payment) {
    return this.event("payment.failed", {
      payment: { entity: { ...payment, error_description: "Payment declined by bank" } },
    });
  },
  orderPaid(payment, { receipt = null, amountPaid = payment.amount } = {}) {
    return this.event("order.paid", {
      payment: { entity: payment },
      order: { entity: { id: payment.order_id || "order_rzp", receipt, amount_paid: amountPaid, status: "paid" } },
    });
  },
  linkEvent(event, { linkId = "plink_1", referenceId = null, status, amountPaid = 10000, currency = "INR", payment = null, orderId = null }) {
    const payload = {
      payment_link: {
        entity: { id: linkId, reference_id: referenceId, status, amount_paid: amountPaid, currency, order_id: orderId },
      },
    };
    if (payment) payload.payment = { entity: payment };
    return this.event(event, payload);
  },
  refund(event, { id = "rfnd_1", paymentId = "pay_1", amount = 2500, status = "processed", payment = null }) {
    return this.event(event, {
      refund: { entity: { id, payment_id: paymentId, amount, currency: "INR", status, speed_processed: "normal", created_at: 1_760_000_100 } },
      payment: { entity: payment || { id: paymentId, entity: "payment", status: "captured", amount: 10000, currency: "INR", notes: {} } },
    });
  },
  qr(event, qrId = "qr_1", payment = null) {
    return this.event(event, {
      qr_code: { entity: { id: qrId } },
      ...(payment ? { payment: { entity: payment } } : {}),
    });
  },
};

/**
 * Delivers an event exactly like the HTTP controller would and returns the
 * status code Razorpay would see.
 */
export function makeDeliver(processWebhook) {
  let ids = 0;
  return async function deliver(eventBody, { eventId = `evt_${++ids}_${Date.now()}`, badSignature = false } = {}) {
    const raw = Buffer.from(JSON.stringify(eventBody));
    try {
      const result = await processWebhook({
        rawBody: raw,
        authorization: badSignature ? "deadbeef" : sign(raw.toString("utf8")),
        webhookEventId: eventId,
      });
      return { http: result.accepted ? 200 : 400, result, eventId };
    } catch (error) {
      const code = Number(error?.statusCode || 500);
      return { http: code === 401 || code === 400 ? code : 500, error, eventId };
    }
  };
}
