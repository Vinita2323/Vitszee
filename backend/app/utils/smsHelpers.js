import crypto from "crypto";

const DEFAULT_OTP_LENGTH = 6;

/** Approved DLT content for sender BGADEC / template 1007282516644508833 */
export const SMS_INDIA_HUB_APPROVED_TEMPLATE =
  "Welcome to the ##var## powered by Appzeto.Your OTP for registration is ##var##.BGADEC";

export function normalizeMobile(mobile) {
  return String(mobile || "").replace(/\D/g, "").slice(-10);
}

export function toIndianNumber(mobile) {
  const normalized = normalizeMobile(mobile);
  return normalized ? `91${normalized}` : "";
}

export function getOtpLength() {
  const parsed = parseInt(process.env.OTP_LENGTH || `${DEFAULT_OTP_LENGTH}`, 10);
  return Number.isFinite(parsed) && parsed >= 4 ? parsed : DEFAULT_OTP_LENGTH;
}

export function generateOTP(length = getOtpLength()) {
  const safeLength = Math.max(4, Number(length || DEFAULT_OTP_LENGTH));
  const min = 10 ** (safeLength - 1);
  const max = 10 ** safeLength;
  return crypto.randomInt(min, max).toString();
}

export function getSmsBrandName() {
  return String(
    process.env.SMS_INDIA_HUB_BRAND_NAME ||
      process.env.APP_NAME ||
      "Vitszee",
  ).trim() || "Vitszee";
}

/**
 * Build the SMS body so it matches the approved DLT template exactly.
 * Variable order for this template: (1) brand name, (2) OTP.
 */
export function buildMessage(otp) {
  const brandName = getSmsBrandName();
  const otpCode = String(otp);
  const minutes = parseInt(process.env.OTP_EXPIRY_MINUTES || "5", 10);
  const configuredTemplate = String(process.env.SMS_INDIA_HUB_TEMPLATE_TEXT || "").trim();
  // dotenv treats unquoted # as a comment, which can truncate ##var## templates.
  const template =
    configuredTemplate.includes("##var##") || configuredTemplate.includes("{#var#}")
      ? configuredTemplate
      : SMS_INDIA_HUB_APPROVED_TEMPLATE;

  let msg = template
    .replace(/\{\{OTP\}\}/g, otpCode)
    .replace(/\{\{MINUTES\}\}/g, String(minutes))
    .replace(/\{\{APP_NAME\}\}/g, brandName)
    .replace(/\$\{otp\}/g, otpCode)
    .replace(/\$\{minutes\}/g, String(minutes))
    .replace(/\$\{appName\}/g, brandName);

  // DLT placeholders must be filled in approval order: brand, then OTP.
  const genericPlaceholders = [
    "##var##",
    "{#var#}",
    "{#VAR#}",
    "{#var1#}",
    "{#var2#}",
  ];
  const replacementOrder = [brandName, otpCode];

  genericPlaceholders.forEach((placeholder) => {
    let occurrence = 0;
    while (msg.includes(placeholder)) {
      const replacement =
        replacementOrder[Math.min(occurrence, replacementOrder.length - 1)];
      msg = msg.replace(placeholder, replacement);
      occurrence += 1;
    }
  });

  return msg;
}
