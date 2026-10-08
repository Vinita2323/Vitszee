import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

const mockSettingFindOne = jest.fn();
const mockOrderFindOne = jest.fn();
jest.unstable_mockModule("../app/models/setting.js", () => ({ default: { findOne: mockSettingFindOne } }));
jest.unstable_mockModule("../app/models/order.js", () => ({ default: { findOne: mockOrderFindOne } }));

const { matchesLocalCity, getDelhiveryLocalConfig } = await import(
  "../app/services/delhiveryLocal/delhiveryLocalConfig.js"
);
const { resolveLocalEligibility } = await import("../app/services/delhiveryLocal/delhiveryLocalRouting.js");

function orderQuery(doc) {
  return {
    populate() { return this; },
    select() { return this; },
    lean: () => Promise.resolve(doc),
  };
}

const ENV = [
  "DELHIVERY_LOCAL_ENABLED", "DELHIVERY_LOCAL_ENVIRONMENT",
  "DELHIVERY_LOCAL_STAGING_CLIENT_ID", "DELHIVERY_LOCAL_STAGING_CLIENT_SECRET",
  "DELHIVERY_LOCAL_CLIENT_CODE", "DELHIVERY_LOCAL_CITY_NAMES", "DELHIVERY_LOCAL_CITY_PINCODES", "DELHIVERY_LOCAL_CITY_PINCODE_PREFIXES",
];
const saved = {};

beforeEach(() => {
  mockSettingFindOne.mockReset();
  mockOrderFindOne.mockReset();
  mockSettingFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
  for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.DELHIVERY_LOCAL_ENABLED = "true";
  process.env.DELHIVERY_LOCAL_ENVIRONMENT = "staging";
  process.env.DELHIVERY_LOCAL_STAGING_CLIENT_ID = "x";
  process.env.DELHIVERY_LOCAL_STAGING_CLIENT_SECRET = "y";
  process.env.DELHIVERY_LOCAL_CLIENT_CODE = "cms::client::test";
});
afterEach(() => {
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

describe("matchesLocalCity (Ahmedabad name gate)", () => {
  it("matches Ahmedabad anywhere in the text, incl. common spellings", async () => {
    const config = await getDelhiveryLocalConfig();
    expect(matchesLocalCity("New Ranip Ahmedabad 382470", config)).toBe(true);
    expect(matchesLocalCity("Satellite, AHMEDABAD, Gujarat", config)).toBe(true);
    expect(matchesLocalCity("Shop 1, Amdavad", config)).toBe(true);
    expect(matchesLocalCity("Ranip, Gujarat, 382470", config)).toBe(false); // no city name present
    expect(matchesLocalCity("Ring Road, Surat", config)).toBe(false);
    expect(matchesLocalCity("", config)).toBe(false);
  });

  it("honours a custom city list via env", async () => {
    process.env.DELHIVERY_LOCAL_CITY_NAMES = "surat,vadodara";
    const config = await getDelhiveryLocalConfig();
    expect(matchesLocalCity("Ring Road, Surat", config)).toBe(true);
    expect(matchesLocalCity("Satellite, Ahmedabad", config)).toBe(false);
  });
});

describe("resolveLocalEligibility (city-name gate)", () => {
  it("routes to QUICK when both seller and customer are in Ahmedabad", async () => {
    mockOrderFindOne.mockReturnValue(orderQuery({
      address: { city: "Satellite", address: "Satellite Rd, Ahmedabad 380015" },
      seller: { city: "Ahmedabad", address: "New Ranip Ahmedabad 382470" },
    }));
    expect((await resolveLocalEligibility("ORD-1")).eligible).toBe(true);
  });

  it("matches the city even when it only appears in the free-text address (city field is a locality)", async () => {
    mockOrderFindOne.mockReturnValue(orderQuery({
      address: { city: "Ranip", address: "12 Club Rd, New Ranip, Ahmedabad" },
      seller: { city: "Naroda", address: "Shop 1, Naroda, Ahmedabad" },
    }));
    expect((await resolveLocalEligibility("ORD-2")).eligible).toBe(true);
  });

  it("routes to COURIER when the customer is in another city", async () => {
    mockOrderFindOne.mockReturnValue(orderQuery({
      address: { city: "Surat", address: "Ring Rd, Surat 395007" },
      seller: { city: "Ahmedabad" },
    }));
    expect((await resolveLocalEligibility("ORD-3")).eligible).toBe(false);
  });

  it("routes to COURIER when the seller is in another city", async () => {
    mockOrderFindOne.mockReturnValue(orderQuery({
      address: { city: "Ahmedabad" },
      seller: { city: "Mumbai", address: "Andheri, Mumbai" },
    }));
    expect((await resolveLocalEligibility("ORD-4")).eligible).toBe(false);
  });

  // The real mismatch bug: Google formats New Ranip as "Ranip, Gujarat 382470" with no
  // "Ahmedabad" in it, so this intracity order was dispatched by courier while the app
  // showed it as quick. 382470 is now a listed Ahmedabad pincode.
  it("routes a 382470 (New Ranip) customer to QUICK even with no city name in the text", async () => {
    mockOrderFindOne.mockReturnValue(orderQuery({
      address: { city: "Ranip, Gujarat, 382470", address: "Villa-37, New Ranip, Ranip, Gujarat 382470, India" },
      seller: { city: "ahmedabad", pincode: "382470" },
    }));
    expect((await resolveLocalEligibility("ORD-5")).eligible).toBe(true);
  });

  it("uses map coordinates inside the city box when the text and pincode both miss", async () => {
    mockOrderFindOne.mockReturnValue(orderQuery({
      address: { city: "Ranip, Gujarat, 382999", location: { lat: 23.097976, lng: 72.556982 } },
      seller: { city: "Shop 1", location: { type: "Point", coordinates: [72.566104, 23.084475] } },
    }));
    const result = await resolveLocalEligibility("ORD-5b");
    expect(result.eligible).toBe(true);
    expect(result.reason).toContain("geo");
  });

  it("does NOT use coordinates from outside the city box", async () => {
    mockOrderFindOne.mockReturnValue(orderQuery({
      address: { city: "Indore", location: { lat: 22.7196, lng: 75.8577 } }, // Indore
      seller: { city: "Ahmedabad" },
    }));
    expect((await resolveLocalEligibility("ORD-5c")).eligible).toBe(false);
  });

  it("falls back to an identical pincode on both ends when nothing else matches", async () => {
    mockOrderFindOne.mockReturnValue(orderQuery({
      address: { city: "Some Locality", address: "Plot 9, 382999" },
      seller: { city: "Ahmedabad", pincode: "382999" },
    }));
    const result = await resolveLocalEligibility("ORD-5d");
    expect(result.eligible).toBe(true);
    expect(result.reason).toContain("same-pincode");
  });

  it("catches a 380xxx customer via the pincode backup even without the city name", async () => {
    mockOrderFindOne.mockReturnValue(orderQuery({
      address: { city: "Vastrapur", address: "Near Lake Garden, 380015" }, // no "Ahmedabad", pin 380015
      seller: { city: "Ahmedabad", address: "New Ranip Ahmedabad" },
    }));
    expect((await resolveLocalEligibility("ORD-7")).eligible).toBe(true);
  });

  it("catches an exact 382xxx customer pincode when it is added to the config list", async () => {
    process.env.DELHIVERY_LOCAL_CITY_PINCODES = "382470";
    mockOrderFindOne.mockReturnValue(orderQuery({
      address: { city: "Ranip, Gujarat, 382470" }, // no "Ahmedabad" text, pin 382470 (listed)
      seller: { city: "Ahmedabad", address: "New Ranip Ahmedabad" },
    }));
    expect((await resolveLocalEligibility("ORD-8")).eligible).toBe(true);
  });

  it("is not eligible when Local is disabled (no order lookup)", async () => {
    process.env.DELHIVERY_LOCAL_ENABLED = "false";
    const r = await resolveLocalEligibility("ORD-6");
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("local disabled");
    expect(mockOrderFindOne).not.toHaveBeenCalled();
  });
});
