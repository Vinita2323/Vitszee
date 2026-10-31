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
