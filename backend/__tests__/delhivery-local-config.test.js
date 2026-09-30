import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

const mockFindOne = jest.fn();
jest.unstable_mockModule("../app/models/setting.js", () => ({
  default: { findOne: mockFindOne },
}));

const { getDelhiveryLocalConfig, getAdminDelhiveryLocalConfig } = await import(
  "../app/services/delhiveryLocal/delhiveryLocalConfig.js"
);

const ENV_KEYS = [
  "DELHIVERY_LOCAL_ENABLED",
  "DELHIVERY_LOCAL_ENVIRONMENT",
  "DELHIVERY_LOCAL_BASE_URL",
  "DELHIVERY_LOCAL_CLIENT_ID",
  "DELHIVERY_LOCAL_CLIENT_SECRET",
  "DELHIVERY_LOCAL_PROD_CLIENT_ID",
  "DELHIVERY_LOCAL_PROD_CLIENT_SECRET",
  "DELHIVERY_LOCAL_STAGING_CLIENT_ID",
  "DELHIVERY_LOCAL_STAGING_CLIENT_SECRET",
  "DELHIVERY_LOCAL_CLIENT_CODE",
  "DELHIVERY_LOCAL_WEBHOOK_API_KEY",
  "DELHIVERY_LOCAL_CITY_PINCODE_PREFIXES",
  "DELHIVERY_LOCAL_CITY_PINCODES",
];

describe("Delhivery Local config resolution", () => {
  const saved = {};
  beforeEach(() => {
    mockFindOne.mockReset();
    // DB returns no settings -> env only.
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("derives the production base URL and reads credentials from env", async () => {
    process.env.DELHIVERY_LOCAL_ENABLED = "true";
    process.env.DELHIVERY_LOCAL_ENVIRONMENT = "production";
    process.env.DELHIVERY_LOCAL_CLIENT_ID = "platform:app:service:abc";
    process.env.DELHIVERY_LOCAL_CLIENT_SECRET = "secret";
    process.env.DELHIVERY_LOCAL_CLIENT_CODE = "cms::client::xyz";

    const config = await getDelhiveryLocalConfig();
    expect(config.environment).toBe("production");
    expect(config.baseUrl).toBe("https://ztietgya0i.logistax.io");
    expect(config.enabled).toBe(true);
    expect(config.hasCredentials).toBe(true);
    expect(config.audience).toBe("platform:app:coreos");
  });

  it("uses the sandbox base URL when environment is sandbox", async () => {
    process.env.DELHIVERY_LOCAL_ENVIRONMENT = "sandbox";
    const config = await getDelhiveryLocalConfig();
    expect(config.baseUrl).toBe("https://delvjkninl.sandbox.getos1.com");
    expect(config.isProduction).toBe(false);
  });

  it("is disabled and credential-less by default", async () => {
    const config = await getDelhiveryLocalConfig();
    expect(config.enabled).toBe(false);
    expect(config.hasCredentials).toBe(false);
  });

  it("never leaks the client secret through the admin view", async () => {
    process.env.DELHIVERY_LOCAL_CLIENT_SECRET = "UydcuBlYSeC5j5Y54xP6Lhkae3exVzRd";
    process.env.DELHIVERY_LOCAL_WEBHOOK_API_KEY = "abc123";
    const admin = await getAdminDelhiveryLocalConfig();
    expect(admin.clientSecretMasked).not.toContain("UydcuBlYSeC5j5Y54xP6Lhkae3exVzRd");
    expect(admin.clientSecretMasked).toMatch(/\*/);
    expect(admin.hasWebhookApiKey).toBe(true);
    expect(admin).not.toHaveProperty("clientSecret");
    expect(admin).not.toHaveProperty("webhookApiKey");
  });
});
