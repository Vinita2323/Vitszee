import { describe, it, expect } from "@jest/globals";
import {
  mapLocalStatus,
  normalizeCancellationReason,
  LOCAL_VEHICLE_MODES,
  LOCAL_CANCELLATION_REASONS,
} from "../app/services/delhiveryLocal/delhiveryLocalStatusMapper.js";

describe("Delhivery Local status mapping", () => {
  it("maps the documented fulfilment states onto shipment statuses", () => {
    expect(mapLocalStatus("pending")).toBe("ORDER_CREATED");
    expect(mapLocalStatus("searching_for_agent")).toBe("ORDER_CREATED");
    expect(mapLocalStatus("agent_assigned")).toBe("RIDER_ASSIGNED");
    expect(mapLocalStatus("at_pickup")).toBe("RIDER_ARRIVED");
    expect(mapLocalStatus("out_for_delivery")).toBe("OUT_FOR_DELIVERY");
    expect(mapLocalStatus("at_delivery")).toBe("OUT_FOR_DELIVERY");
    expect(mapLocalStatus("order_delivered")).toBe("DELIVERED");
    expect(mapLocalStatus("cancelled")).toBe("CANCELLED");
  });

  it("treats intermediate stop arrivals as out-for-delivery", () => {
    expect(mapLocalStatus("at_stop1")).toBe("OUT_FOR_DELIVERY");
    expect(mapLocalStatus("at_stop2")).toBe("OUT_FOR_DELIVERY");
  });

  it("falls back to the coarse order status when fulfilment text is unknown", () => {
    expect(mapLocalStatus("", "inProgress")).toBe("OUT_FOR_DELIVERY");
    expect(mapLocalStatus("", "delivered")).toBe("DELIVERED");
    expect(mapLocalStatus("", "cancelled")).toBe("CANCELLED");
    expect(mapLocalStatus("", "created")).toBe("ORDER_CREATED");
  });

  it("returns null for a genuinely unknown state so it is recorded, not applied", () => {
    expect(mapLocalStatus("some_new_wording", "weird")).toBeNull();
  });

  it("normalises cancellation reasons to an accepted value", () => {
    expect(normalizeCancellationReason("taking too long to assign a driver")).toBe(
      "taking too long to assign a driver"
    );
    expect(LOCAL_CANCELLATION_REASONS).toContain(normalizeCancellationReason("anything else"));
    expect(normalizeCancellationReason("random reason")).toBe("service is no longer required");
  });

  it("exposes the documented vehicle modes", () => {
    expect(LOCAL_VEHICLE_MODES).toEqual(["2-wheeler", "3-wheeler", "tata-ace", "mini-3w", "8ft-pickup"]);
  });
});
