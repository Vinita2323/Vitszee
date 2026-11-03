import { getRazorpayClient } from "./providers/razorpay.adapter.js";

/**
 * Thin wrapper over Razorpay's QR Code API. Reuses the existing credentials
 * (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) and client singleton from the
 * Razorpay adapter. Kept separate so the service layer can be tested with a
 * fake gateway and no network.
 */

export async function createDynamicQr({
  amountPaise,
  closeByUnix,
  name,
  description,
  notes = {},
}) {
  const client = getRazorpayClient();
  return client.qrCode.create({
    type: "upi_qr",
    name,
    usage: "single_use",
    fixed_amount: true,
    payment_amount: amountPaise,
    description,
    close_by: closeByUnix,
    notes,
  });
}

export async function fetchQr(qrId) {
  return getRazorpayClient().qrCode.fetch(qrId);
}

export async function fetchQrPayments(qrId) {
  return getRazorpayClient().qrCode.fetchAllPayments(qrId, { count: 100 });
}

export async function closeQr(qrId) {
  return getRazorpayClient().qrCode.close(qrId);
}

/**
 * True when Razorpay says the QR Codes API itself does not exist for this
 * account/key ("The requested URL was not found on the server."). That is an
 * account-level product restriction, not a transient failure.
 */
export function isQrApiUnavailable(error) {
  const text = String(error?.error?.description || error?.message || "");
  return error?.statusCode === 404 || /requested url was not found/i.test(text);
}

/**
 * Fixed-amount Razorpay Payment Link used as the "scan to pay" fallback when the
 * QR Codes API is unavailable. The hosted page opens with the amount already
 * filled in and not editable. Razorpay requires expire_by >= 15 minutes ahead.
 */
export async function createCollectLink({ amountPaise, referenceId, expireByUnix, description, notes = {} }) {
  return getRazorpayClient().paymentLink.create({
    amount: amountPaise,
    currency: "INR",
    accept_partial: false,
    reference_id: referenceId,
    description,
    expire_by: expireByUnix,
    reminder_enable: false,
    notes,
  });
}

export async function fetchCollectLink(linkId) {
  return getRazorpayClient().paymentLink.fetch(linkId);
}

export async function cancelCollectLink(linkId) {
  return getRazorpayClient().paymentLink.cancel(linkId);
}
