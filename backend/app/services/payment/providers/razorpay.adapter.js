import crypto from "crypto";
import Razorpay from "razorpay";
import { PAYMENT_STATUS, PAYMENT_GATEWAY, WEBHOOK_KIND } from "../../../constants/payment.js";
import { PaymentProviderPort } from "../ports/paymentProviderPort.js";

let _razorpayClient = null;

function buildRazorpayClient() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();

  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials not configured");
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

export function getRazorpayClient() {
  if (_razorpayClient) return _razorpayClient;
  _razorpayClient = buildRazorpayClient();
  return _razorpayClient;
}

export class RazorpayAdapter extends PaymentProviderPort {
  get providerName() {
    return PAYMENT_GATEWAY.RAZORPAY;
  }

  async initiatePayment({ merchantOrderId, amountPaise, redirectUrl, callbackUrl }) {
    const client = getRazorpayClient();
    
    // Create a payment link using reference_id to store our merchantOrderId
    const response = await client.paymentLink.create({
      amount: amountPaise,
      currency: "INR",
      accept_partial: false,
      reference_id: merchantOrderId,
      description: "Order Payment",
      callback_url: redirectUrl,
      callback_method: "get",
      notes: {
        merchantOrderId: String(merchantOrderId),
      },
    });

    return {
      redirectUrl: response.short_url,
      gatewayResponse: response,
    };
  }

  async getPaymentStatus({ merchantOrderId }) {
    const client = getRazorpayClient();
    
    // Find the payment link by reference_id
    const response = await client.paymentLink.all({ reference_id: merchantOrderId });
    
    const items = response.payment_links || response.items;
    if (!items || items.length === 0) {
       const err = new Error("Payment link not found");
       err.statusCode = 404;
       throw err;
    }

    const paymentLink = items.find(item => item.reference_id === merchantOrderId) || items[0];
    
    return {
      state: paymentLink.status,
      transactionId: paymentLink.id, // using payment link id as transaction id for now
      responseCode: paymentLink.status,
      linkId: paymentLink.id,
      paymentId: paymentLink.payments?.[0]?.payment_id || null,
      amountPaidPaise: Number.isFinite(Number(paymentLink.amount_paid)) ? Number(paymentLink.amount_paid) : null,
      currency: paymentLink.currency || null,
      gatewayResponse: paymentLink,
    };
  }

  async validateWebhook({ rawBody, authorization }) {
    const secret = String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
    if (!secret) {
      const err = new Error("Razorpay webhook secret is not configured");
      err.statusCode = 500;
      throw err;
    }
    const payload = rawWebhookBody(rawBody);
    return signaturesMatch(payload, String(authorization || ""), secret);
  }

  async decodeWebhookPayload({ rawBody }) {
    const payload = rawWebhookBody(rawBody);
    let jsonPayload;
    try {
      jsonPayload = JSON.parse(payload);
    } catch {
      const err = new Error("Invalid format: Webhook body must be JSON");
      err.statusCode = 400;
      throw err;
    }

    const eventName = String(jsonPayload.event || "");
    const entities = jsonPayload.payload || {};
    const paymentLink = entities.payment_link?.entity || null;
    const payment = entities.payment?.entity || null;
    const order = entities.order?.entity || null;
    const refund = entities.refund?.entity || null;
    const qrCode = entities.qr_code?.entity || null;
    const notes = payment?.notes || paymentLink?.notes || {};
    const merchantOrderId = String(
      paymentLink?.reference_id ||
      notes.merchantOrderId ||
      notes.merchant_order_id ||
      order?.receipt ||
      "",
    ).trim();
    const state = webhookState(eventName, paymentLink, payment);
    const transactionId = String(payment?.id || paymentLink?.id || order?.id || refund?.id || "");
    const eventId = crypto
      .createHash("sha256")
      .update(`${eventName}|${merchantOrderId}|${state}|${transactionId}|${jsonPayload.created_at || ""}`)
      .digest("hex");

    const amountRaw = payment?.amount ?? paymentLink?.amount_paid ?? order?.amount_paid ?? null;
    const amountPaise = amountRaw == null || !Number.isFinite(Number(amountRaw)) ? null : Number(amountRaw);

    return {
      eventId,
      merchantOrderId,
      state,
      transactionId,
      responseCode: state || eventName,
      raw: jsonPayload,
      // --- additive fields used by the reliable webhook pipeline ---
      eventName,
      kind: webhookKind(eventName),
      linkId: String(paymentLink?.id || notes.payment_link_id || "").trim() || null,
      razorpayOrderId: String(payment?.order_id || paymentLink?.order_id || order?.id || "").trim() || null,
      paymentId: String(payment?.id || "").trim() || null,
      amountPaise,
      currency: String(payment?.currency || paymentLink?.currency || order?.currency || "").toUpperCase() || null,
      failureReason: payment?.error_description || payment?.error_reason || null,
      hasOurReference: Boolean(paymentLink || notes.merchantOrderId || notes.merchant_order_id),
      refund: refund
        ? {
            id: String(refund.id || ""),
            paymentId: String(refund.payment_id || payment?.id || "") || null,
            amount: Number(refund.amount) || 0,
            currency: String(refund.currency || payment?.currency || "INR").toUpperCase(),
            status: String(refund.status || "").toLowerCase(),
            speed: refund.speed_processed || refund.speed_requested || null,
            notes: refund.notes || null,
            createdAt: refund.created_at ? new Date(refund.created_at * 1000) : null,
          }
        : null,
      qrId: qrCode?.id || null,
    };
  }

  mapStatusToInternal(gatewayState) {
    const normalized = String(gatewayState || "").toUpperCase();
    if (normalized === "PAID" || normalized === "CAPTURED") return PAYMENT_STATUS.CAPTURED;
    if (normalized === "AUTHORIZED") return PAYMENT_STATUS.AUTHORIZED;
    if (normalized === "REFUNDED") return PAYMENT_STATUS.REFUNDED;
    if (normalized === "FAILED") return PAYMENT_STATUS.FAILED;
    if (normalized === "CANCELLED" || normalized === "EXPIRED") return PAYMENT_STATUS.CANCELLED;
    return PAYMENT_STATUS.PENDING;
  }
}

/** Constant-time HMAC-SHA256 hex comparison (never use === on signatures). */
export function signaturesMatch(payload, signature, secret) {
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export function webhookKind(eventName) {
  switch (eventName) {
    case "payment_link.paid":
    case "payment.captured":
    case "order.paid":
      return WEBHOOK_KIND.CAPTURED;
    case "payment.failed":
      return WEBHOOK_KIND.ATTEMPT_FAILED;
    case "payment_link.expired":
    case "payment_link.cancelled":
      return WEBHOOK_KIND.LINK_CLOSED;
    case "refund.created":
    case "refund.processed":
    case "refund.failed":
      return WEBHOOK_KIND.REFUND;
    default:
      return eventName.startsWith("qr_code.") ? WEBHOOK_KIND.QR : WEBHOOK_KIND.IGNORED;
  }
}

function rawWebhookBody(rawBody) {
  if (Buffer.isBuffer(rawBody)) return rawBody.toString("utf8");
  if (typeof rawBody === "string") return rawBody;
  const err = new Error("Razorpay webhook body must be the raw request bytes");
  err.statusCode = 400;
  throw err;
}

function webhookState(eventName, paymentLink, payment) {
  if (eventName.startsWith("payment_link.")) {
    if (eventName === "payment_link.paid" || paymentLink?.status === "paid") return "paid";
    if (eventName === "payment_link.cancelled" || paymentLink?.status === "cancelled") return "cancelled";
    if (eventName === "payment_link.expired" || paymentLink?.status === "expired") return "expired";
    return String(paymentLink?.status || "");
  }
  if (eventName.startsWith("refund.")) {
    return eventName === "refund.processed" ? "refund_processed" : eventName === "refund.failed" ? "refund_failed" : "refund_created";
  }
  if (eventName === "payment.captured" || payment?.status === "captured") return "captured";
  if (eventName === "payment.failed" || payment?.status === "failed") return "failed";
  if (eventName === "payment.authorized" || payment?.status === "authorized") return "authorized";
  if (eventName === "refund.processed" || payment?.status === "refunded") return "refunded";
  return String(paymentLink?.status || payment?.status || "");
}

export default RazorpayAdapter;
