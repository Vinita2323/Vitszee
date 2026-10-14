import { generateOTP as cryptoGenerateOtp, getOtpLength } from "./smsHelpers.js";

const MOCK_OTP = "1234";

export const useRealSMS = () =>
  process.env.USE_REAL_SMS === "true" || process.env.USE_REAL_SMS === "1";

export const generateOTP = () => {
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

export { MOCK_OTP };
