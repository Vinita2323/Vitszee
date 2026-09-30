import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockSettingFindOne = jest.fn();
const mockOrderFindOne = jest.fn();

jest.unstable_mockModule("../app/models/setting.js", () => ({
  default: { findOne: mockSettingFindOne },
}));
jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { findOne: mockOrderFindOne },
}));

const { isLocalCityPincode, getDelhiveryLocalConfig } = await import(
  "../app/services/delhiveryLocal/delhiveryLocalConfig.js"
);
const { resolveLocalEligibility } = await import("../app/services/delhiveryLocal/delhiveryLocalRouting.js");

function orderQuery(doc) {
  // Mimics Order.findOne(...).populate(...).select(...).lean()
  return {
    populate() {
      return this;
    },
    select() {
      return this;
    },
    lean: () => Promise.resolve(doc),
  };
}

beforeEach(() => {
  mockSettingFindOne.mockReset();
  mockOrderFindOne.mockReset();
  mockSettingFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
  process.env.DELHIVERY_LOCAL_ENABLED = "true";
  process.env.DELHIVERY_LOCAL_ENVIRONMENT = "staging";
  process.env.DELHIVERY_LOCAL_STAGING_CLIENT_ID = "platform:app:service:staging";
  process.env.DELHIVERY_LOCAL_STAGING_CLIENT_SECRET = "secret";
  process.env.DELHIVERY_LOCAL_CLIENT_CODE = "cms::client::98f9511b";
  delete process.env.DELHIVERY_LOCAL_CITY_PINCODE_PREFIXES;
  delete process.env.DELHIVERY_LOCAL_CITY_PINCODES;
});

describe("Ahmedabad pincode gate", () => {
  it("accepts 380xxx and rejects other cities by default", async () => {
    const config = await getDelhiveryLocalConfig();
    expect(isLocalCityPincode("380015", config)).toBe(true); // Ahmedabad
    expect(isLocalCityPincode("380001", config)).toBe(true);
    expect(isLocalCityPincode("395007", config)).toBe(false); // Surat
    expect(isLocalCityPincode("382010", config)).toBe(false); // Gandhinagar (382, not in gate)
    expect(isLocalCityPincode("", config)).toBe(false);
    expect(isLocalCityPincode("38001", config)).toBe(false); // not 6 digits
  });

  it("honours explicit extra pincodes from config", async () => {
    process.env.DELHIVERY_LOCAL_CITY_PINCODES = "382210,382481";
    const config = await getDelhiveryLocalConfig();
    expect(isLocalCityPincode("382210", config)).toBe(true);
    expect(isLocalCityPincode("382481", config)).toBe(true);
    expect(isLocalCityPincode("382010", config)).toBe(false);
  });
});

describe("resolveLocalEligibility", () => {
  it("routes to quick when both seller and customer are in Ahmedabad", async () => {
    mockOrderFindOne.mockReturnValue(
      orderQuery({ address: { pincode: "380015" }, seller: { pincode: "380009" } })
    );
    const result = await resolveLocalEligibility("ORD-1");
    expect(result.eligible).toBe(true);
    expect(result.pickupPin).toBe("380009");
    expect(result.dropPin).toBe("380015");
  });

  it("routes to courier when the customer is outside Ahmedabad", async () => {
    mockOrderFindOne.mockReturnValue(
      orderQuery({ address: { pincode: "395007" }, seller: { pincode: "380009" } })
    );
    const result = await resolveLocalEligibility("ORD-2");
    expect(result.eligible).toBe(false);
  });

  it("routes to courier when the seller is outside Ahmedabad", async () => {
    mockOrderFindOne.mockReturnValue(
      orderQuery({ address: { pincode: "380015" }, seller: { pincode: "400001" } })
    );
    const result = await resolveLocalEligibility("ORD-3");
    expect(result.eligible).toBe(false);
  });

  it("falls back to a pincode embedded in the free-text drop address", async () => {
    mockOrderFindOne.mockReturnValue(
      orderQuery({ address: { fullAddress: "12 Some Rd, Ahmedabad 380052" }, seller: { pincode: "380009" } })
    );
    const result = await resolveLocalEligibility("ORD-4");
    expect(result.eligible).toBe(true);
    expect(result.dropPin).toBe("380052");
  });

  it("is not eligible when Local is disabled", async () => {
    process.env.DELHIVERY_LOCAL_ENABLED = "false";
    const result = await resolveLocalEligibility("ORD-5");
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("local disabled");
    expect(mockOrderFindOne).not.toHaveBeenCalled();
  });
});
