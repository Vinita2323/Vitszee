import {
  buildMessage,
  SMS_INDIA_HUB_APPROVED_TEMPLATE,
} from "../app/utils/smsHelpers.js";
import { __testables } from "../app/services/smsIndiaHubService.js";

describe("SMS India Hub DLT template", () => {
  beforeEach(() => {
    process.env.SMS_INDIA_HUB_BRAND_NAME = "Vitszee";
    process.env.SMS_INDIA_HUB_TEMPLATE_TEXT = SMS_INDIA_HUB_APPROVED_TEMPLATE;
    process.env.SMS_INDIA_HUB_SENDER_ID = "BGADEC";
    process.env.SMS_INDIA_HUB_TEMPLATE_ID = "1007282516644508833";
    process.env.SMS_INDIA_HUB_API_KEY = "test-key";
  });

  it("fills brand then OTP in the approved DLT order with exact punctuation", () => {
    const message = buildMessage("482910");
    expect(message).toBe(
      "Welcome to the Vitszee powered by Appzeto.Your OTP for registration is 482910.BGADEC",
    );
    expect(message).not.toContain("##var##");
    expect(message.indexOf("Vitszee")).toBeLessThan(message.indexOf("482910"));
  });

  it("reads TEMPLATE_ID as the DLT template id", () => {
    delete process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID;
    const config = __testables.getSmsIndiaConfig();
    expect(config.dltTemplateId).toBe("1007282516644508833");
    expect(config.senderId).toBe("BGADEC");
    expect(config.brandName).toBe("Vitszee");
  });
});
