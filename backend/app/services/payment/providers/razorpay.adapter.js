import crypto from "crypto";
import Razorpay from "razorpay";
import { PAYMENT_STATUS, PAYMENT_GATEWAY } from "../../../constants/payment.js";
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

function getRazorpayClient() {
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
    return Razorpay.validateWebhookSignature(payload, String(authorization || ""), secret);
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
    const paymentLink = jsonPayload.payload?.payment_link?.entity || null;
    const payment = jsonPayload.payload?.payment?.entity || null;
    const order = jsonPayload.payload?.order?.entity || null;
    const notes = payment?.notes || paymentLink?.notes || {};
    const merchantOrderId = String(
      paymentLink?.reference_id ||
      notes.merchantOrderId ||
      notes.merchant_order_id ||
      order?.receipt ||
      "",
    ).trim();
    const state = webhookState(eventName, paymentLink, payment);
    const transactionId = String(payment?.id || paymentLink?.id || order?.id || "");
    const eventId = crypto
      .createHash("sha256")
      .update(`${eventName}|${merchantOrderId}|${state}|${transactionId}|${jsonPayload.created_at || ""}`)
      .digest("hex");

    return {
      eventId,
      merchantOrderId,
      state,
      transactionId,
      responseCode: state || eventName,
      raw: jsonPayload,
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
  if (eventName === "payment.captured" || payment?.status === "captured") return "captured";
  if (eventName === "payment.failed" || payment?.status === "failed") return "failed";
  if (eventName === "payment.authorized" || payment?.status === "authorized") return "authorized";
  if (eventName === "refund.processed" || payment?.status === "refunded") return "refunded";
  return String(paymentLink?.status || payment?.status || "");
}

export default RazorpayAdapter;
