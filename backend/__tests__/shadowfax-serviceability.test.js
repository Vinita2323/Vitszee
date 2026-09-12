import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockAxios = jest.fn();
const mockSettingFindOne = jest.fn();

jest.unstable_mockModule("axios", () => ({
  default: mockAxios,
}));

jest.unstable_mockModule("../app/models/setting.js", () => ({
  default: {
    findOne: mockSettingFindOne,
  },
}));

const { checkForwardServiceability } = await import(
  "../app/services/shadowfax/shadowfaxForwardService.js"
);
const { checkReverseServiceability } = await import(
  "../app/services/shadowfax/shadowfaxReverseService.js"
);

describe("Shadowfax Serviceability Suite", () => {
  beforeEach(() => {
    mockAxios.mockReset();
    mockSettingFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        shadowfax: {
          forwardEnabled: true,
          reverseEnabled: true,
          environment: "production",
          forwardToken: "test_forward_token",
          reverseToken: "test_reverse_token",
        },
      }),
    });

    process.env.SHADOWFAX_ENVIRONMENT = "production";
    process.env.SHADOWFAX_FORWARD_TOKEN = "test_forward_token";
    process.env.SHADOWFAX_REVERSE_TOKEN = "test_reverse_token";
    process.env.SHADOWFAX_FORWARD_ENABLED = "true";
    process.env.SHADOWFAX_REVERSE_ENABLED = "true";
  });

  it("should return serviceable=true when Forward API responds with success", async () => {
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: {
        serviceable: true,
        message: "Pincode is serviceable",
      },
      headers: {},
    });

    const result = await checkForwardServiceability({
      pickupPincode: "560001",
      deliveryPincode: "560002",
      pickupLatitude: 12.9716,
      pickupLongitude: 77.5946,
      dropLatitude: 12.9352,
      dropLongitude: 77.6245,
      orderValue: 450,
    });

    expect(result.serviceable).toBe(true);
    expect(mockAxios).toHaveBeenCalledTimes(1);
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: expect.stringContaining("/api/v2/clients/serviceability/"),
        data: expect.objectContaining({
          pickup_pincode: "560001",
          delivery_pincode: "560002",
          pickup_latitude: 12.9716,
          pickup_longitude: 77.5946,
        }),
      })
    );
  });

  it("should return serviceable=false with user-safe message when Forward API responds unserviceable", async () => {
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: {
        serviceable: false,
        message: "Delivery route is not serviceable by Shadowfax",
      },
      headers: {},
    });

    const result = await checkForwardServiceability({
      pickupPincode: "560001",
      deliveryPincode: "999999",
    });

    expect(result.serviceable).toBe(false);
    expect(result.reason).toContain("not serviceable");
  });

  it("should return serviceable=true when Reverse API responds with success", async () => {
    mockAxios.mockResolvedValueOnce({
      status: 200,
      data: {
        serviceable: true,
        status: "success",
      },
      headers: {},
    });

    const result = await checkReverseServiceability({
      pickupPincode: "560001",
      destinationPincode: "560002",
    });

    expect(result.serviceable).toBe(true);
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: expect.stringContaining("/api/v2/clients/serviceability"),
        data: {
          pickup_pincode: "560001",
          delivery_pincode: "560002",
        },
      })
    );
  });

  it("should handle network/timeout error gracefully without crashing", async () => {
    mockAxios.mockRejectedValueOnce(new Error("Network timeout"));

    const result = await checkForwardServiceability({
      pickupPincode: "560001",
      deliveryPincode: "560002",
    });

    expect(result.serviceable).toBe(false);
    expect(result.reason).toBeDefined();
  });
});
