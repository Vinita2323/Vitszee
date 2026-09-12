import { describe, it, expect } from "@jest/globals";
import {
  mapShadowfaxForwardStatus,
  mapShipmentToWorkflowStatus,
  mapShadowfaxReverseStatus,
  isValidForwardStatusTransition,
  isValidReverseStatusTransition,
} from "../app/services/shadowfax/shadowfaxStatusMapper.js";
import { WORKFLOW_STATUS } from "../app/constants/orderWorkflow.js";

describe("Shadowfax Status Mapper & State Machine Guards", () => {
  it("should map forward raw statuses to normalized shipment statuses", () => {
    expect(mapShadowfaxForwardStatus("order_created")).toBe("ORDER_CREATED");
    expect(mapShadowfaxForwardStatus("allotted")).toBe("RIDER_ASSIGNED");
    expect(mapShadowfaxForwardStatus("arrived_at_store")).toBe("RIDER_ARRIVED");
    expect(mapShadowfaxForwardStatus("picked_up")).toBe("PICKED_UP");
    expect(mapShadowfaxForwardStatus("out_for_delivery")).toBe("OUT_FOR_DELIVERY");
    expect(mapShadowfaxForwardStatus("delivered")).toBe("DELIVERED");
    expect(mapShadowfaxForwardStatus("cancelled")).toBe("CANCELLED");
    expect(mapShadowfaxForwardStatus("failed")).toBe("FAILED");
  });

  it("should map shipment status to internal workflow status", () => {
    expect(mapShipmentToWorkflowStatus("ORDER_CREATED")).toBe(WORKFLOW_STATUS.DELIVERY_SEARCH);
    expect(mapShipmentToWorkflowStatus("RIDER_ASSIGNED")).toBe(WORKFLOW_STATUS.DELIVERY_ASSIGNED);
    expect(mapShipmentToWorkflowStatus("PICKED_UP")).toBe(WORKFLOW_STATUS.PICKUP_READY);
    expect(mapShipmentToWorkflowStatus("OUT_FOR_DELIVERY")).toBe(WORKFLOW_STATUS.OUT_FOR_DELIVERY);
    expect(mapShipmentToWorkflowStatus("DELIVERED")).toBe(WORKFLOW_STATUS.DELIVERED);
    expect(mapShipmentToWorkflowStatus("CANCELLED")).toBe(WORKFLOW_STATUS.CANCELLED);
  });

  it("should prevent state downgrade from terminal status DELIVERED", () => {
    // Current is DELIVERED, proposed is RIDER_ASSIGNED (out of order webhook)
    const canTransition = isValidForwardStatusTransition("DELIVERED", "RIDER_ASSIGNED");
    expect(canTransition).toBe(false);
  });

  it("should prevent state downgrade from terminal status CANCELLED", () => {
    const canTransition = isValidForwardStatusTransition("CANCELLED", "OUT_FOR_DELIVERY");
    expect(canTransition).toBe(false);
  });

  it("should allow progressive transitions", () => {
    expect(isValidForwardStatusTransition("ORDER_CREATED", "RIDER_ASSIGNED")).toBe(true);
    expect(isValidForwardStatusTransition("RIDER_ASSIGNED", "PICKED_UP")).toBe(true);
    expect(isValidForwardStatusTransition("PICKED_UP", "OUT_FOR_DELIVERY")).toBe(true);
    expect(isValidForwardStatusTransition("OUT_FOR_DELIVERY", "DELIVERED")).toBe(true);
  });

  it("should map reverse raw statuses correctly", () => {
    expect(mapShadowfaxReverseStatus("request_created")).toBe("return_approved");
    expect(mapShadowfaxReverseStatus("assigned")).toBe("return_pickup_assigned");
    expect(mapShadowfaxReverseStatus("qc_passed")).toBe("return_in_transit");
    expect(mapShadowfaxReverseStatus("qc_failed")).toBe("qc_failed");
    expect(mapShadowfaxReverseStatus("delivered_to_hub")).toBe("returned");
  });

  it("should protect terminal return statuses from downgrade", () => {
    expect(isValidReverseStatusTransition("returned", "return_pickup_assigned")).toBe(false);
    expect(isValidReverseStatusTransition("qc_failed", "return_approved")).toBe(false);
  });
});
