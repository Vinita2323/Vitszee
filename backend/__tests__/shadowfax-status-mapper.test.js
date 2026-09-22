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
  it("maps documented marketplace status ids to shipment statuses", () => {
    expect(mapShadowfaxForwardStatus("new")).toBe("ORDER_CREATED");
    expect(mapShadowfaxForwardStatus("assigned_for_seller_pickup")).toBe("RIDER_ASSIGNED");
    expect(mapShadowfaxForwardStatus("ofp")).toBe("RIDER_ASSIGNED");
    expect(mapShadowfaxForwardStatus("picked")).toBe("PICKED_UP");
    expect(mapShadowfaxForwardStatus("recd_at_rev_hub")).toBe("IN_TRANSIT");
    expect(mapShadowfaxForwardStatus("bag_in_transit")).toBe("IN_TRANSIT");
    expect(mapShadowfaxForwardStatus("assigned_for_delivery")).toBe("IN_TRANSIT");
    expect(mapShadowfaxForwardStatus("ofd")).toBe("OUT_FOR_DELIVERY");
    expect(mapShadowfaxForwardStatus("delivered")).toBe("DELIVERED");
    expect(mapShadowfaxForwardStatus("cancelled_by_customer")).toBe("CANCELLED");
    expect(mapShadowfaxForwardStatus("cancelled_by_seller")).toBe("CANCELLED");
    expect(mapShadowfaxForwardStatus("rts")).toBe("FAILED");
    expect(mapShadowfaxForwardStatus("rts_d")).toBe("FAILED");
    expect(mapShadowfaxForwardStatus("rts_nd")).toBe("FAILED");
    expect(mapShadowfaxForwardStatus("lost")).toBe("FAILED");
  });

  it("normalises display text used as a fallback", () => {
    expect(mapShadowfaxForwardStatus("Out For Delivery")).toBe("OUT_FOR_DELIVERY");
    expect(mapShadowfaxForwardStatus("Assigned For Pickup")).toBe("RIDER_ASSIGNED");
    expect(mapShadowfaxForwardStatus("Cancelled by Seller")).toBe("CANCELLED");
    expect(mapShadowfaxForwardStatus("Returned To Client")).toBe("FAILED");
  });

  it("leaves exception and unknown statuses unmapped instead of guessing", () => {
    for (const status of ["nc", "na", "cid", "on_hold", "pickup_on_hold", "reopen_ndr", "seller_not_contactable", "", "something_new"]) {
      expect(mapShadowfaxForwardStatus(status)).toBeNull();
    }
  });

  it("should map shipment status to internal workflow status", () => {
    expect(mapShipmentToWorkflowStatus("ORDER_CREATED")).toBe(WORKFLOW_STATUS.DELIVERY_SEARCH);
    expect(mapShipmentToWorkflowStatus("RIDER_ASSIGNED")).toBe(WORKFLOW_STATUS.DELIVERY_ASSIGNED);
    expect(mapShipmentToWorkflowStatus("PICKED_UP")).toBe(WORKFLOW_STATUS.PICKUP_READY);
    expect(mapShipmentToWorkflowStatus("IN_TRANSIT")).toBe(WORKFLOW_STATUS.PICKUP_READY);
    expect(mapShipmentToWorkflowStatus("OUT_FOR_DELIVERY")).toBe(WORKFLOW_STATUS.OUT_FOR_DELIVERY);
    expect(mapShipmentToWorkflowStatus("DELIVERED")).toBe(WORKFLOW_STATUS.DELIVERED);
    expect(mapShipmentToWorkflowStatus("CANCELLED")).toBe(WORKFLOW_STATUS.CANCELLED);
    expect(mapShipmentToWorkflowStatus("FAILED")).toBe(WORKFLOW_STATUS.CANCELLED);
    expect(mapShipmentToWorkflowStatus("DISPATCH_READY")).toBeNull();
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
    expect(isValidForwardStatusTransition("PICKED_UP", "IN_TRANSIT")).toBe(true);
    expect(isValidForwardStatusTransition("IN_TRANSIT", "OUT_FOR_DELIVERY")).toBe(true);
    expect(isValidForwardStatusTransition("OUT_FOR_DELIVERY", "DELIVERED")).toBe(true);
    expect(isValidForwardStatusTransition("OUT_FOR_DELIVERY", "FAILED")).toBe(true);
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
