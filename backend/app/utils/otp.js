import { generateOTP as cryptoGenerateOtp, getOtpLength } from "./smsHelpers.js";

const MOCK_OTP = "1234";

/** Fixed local/demo credentials for customer + delivery panels. */
export const DEFAULT_TEST_PHONE_DIGITS = "9301841832";
export const DEFAULT_TEST_OTP = "123456";

export const useRealSMS = () =>
  process.env.USE_REAL_SMS === "true" || process.env.USE_REAL_SMS === "1";

export function phoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

export function isDefaultTestPhone(phone) {
  const configured = phoneDigits(
    process.env.DEFAULT_TEST_OTP_PHONE || DEFAULT_TEST_PHONE_DIGITS,
  );
  return Boolean(configured) && phoneDigits(phone) === configured;
}

export function getDefaultTestOtp() {
  const configured = String(process.env.DEFAULT_TEST_OTP || DEFAULT_TEST_OTP).trim();
  return /^\d{4,8}$/.test(configured) ? configured : DEFAULT_TEST_OTP;
}

/**
 * Prefer the fixed demo OTP for the default test phone.
 * Otherwise use mock 1234 when real SMS is off, or a random OTP when on.
 */
export const generateOTP = (phone = null) => {
  if (phone != null && isDefaultTestPhone(phone)) {
    return getDefaultTestOtp();
  }

  const production = process.env.NODE_ENV === "production";
  if (production && !useRealSMS()) {
    const err = new Error("Mock OTP mode is disabled in production");
    err.statusCode = 500;
    throw err;
  }
  if (!useRealSMS()) {
    return MOCK_OTP;
  }
  return cryptoGenerateOtp(getOtpLength());
};

/** Real SMS is skipped for the fixed demo phone so OTP stays predictable. */
export function shouldDispatchSms(phone) {
  return useRealSMS() && !isDefaultTestPhone(phone);
}

export { MOCK_OTP };
