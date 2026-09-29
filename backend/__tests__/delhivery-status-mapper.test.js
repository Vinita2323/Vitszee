import { describe, it, expect } from "@jest/globals";
import {
  mapDelhiveryStatus,
  mapShipmentToWorkflowStatus,
  isValidForwardStatusTransition,
} from "../app/services/delhivery/delhiveryStatusMapper.js";
import { WORKFLOW_STATUS } from "../app/constants/orderWorkflow.js";

describe("Delhivery Status Mapper & State Machine Guards", () => {
  it("maps documented package statuses to shipment statuses", () => {
    expect(mapDelhiveryStatus("Manifested", "UD")).toBe("ORDER_CREATED");
    expect(mapDelhiveryStatus("Not Picked", "UD")).toBe("ORDER_CREATED");
    expect(mapDelhiveryStatus("Scheduled", "UD")).toBe("ORDER_CREATED");
    expect(mapDelhiveryStatus("In Transit", "UD")).toBe("IN_TRANSIT");
    expect(mapDelhiveryStatus("Pending", "UD")).toBe("IN_TRANSIT");
    expect(mapDelhiveryStatus("Dispatched", "UD")).toBe("OUT_FOR_DELIVERY");
    expect(mapDelhiveryStatus("Delivered", "DL")).toBe("DELIVERED");
    expect(mapDelhiveryStatus("RTO", "RT")).toBe("FAILED");
    expect(mapDelhiveryStatus("DTO", "RT")).toBe("FAILED");
    expect(mapDelhiveryStatus("Cancelled", "CN")).toBe("CANCELLED");
    expect(mapDelhiveryStatus("Picked Up", "PU")).toBe("PICKED_UP");
  });

  it("falls back to the status type when the status text is unknown", () => {
    expect(mapDelhiveryStatus("Some new wording", "DL")).toBe("DELIVERED");
    expect(mapDelhiveryStatus("Some new wording", "RT")).toBe("FAILED");
    expect(mapDelhiveryStatus("Some new wording", "CN")).toBe("CANCELLED");
  });

  it("leaves unknown scans unmapped instead of guessing", () => {
    expect(mapDelhiveryStatus("", "")).toBeNull();
    expect(mapDelhiveryStatus("Some new wording", "XX")).toBeNull();
  });

  it("maps shipment status to internal workflow status", () => {
    expect(mapShipmentToWorkflowStatus("ORDER_CREATED")).toBe(WORKFLOW_STATUS.DELIVERY_SEARCH);
    expect(mapShipmentToWorkflowStatus("PICKED_UP")).toBe(WORKFLOW_STATUS.PICKUP_READY);
    expect(mapShipmentToWorkflowStatus("IN_TRANSIT")).toBe(WORKFLOW_STATUS.PICKUP_READY);
    expect(mapShipmentToWorkflowStatus("OUT_FOR_DELIVERY")).toBe(WORKFLOW_STATUS.OUT_FOR_DELIVERY);
    expect(mapShipmentToWorkflowStatus("DELIVERED")).toBe(WORKFLOW_STATUS.DELIVERED);
    expect(mapShipmentToWorkflowStatus("CANCELLED")).toBe(WORKFLOW_STATUS.CANCELLED);
    expect(mapShipmentToWorkflowStatus("FAILED")).toBe(WORKFLOW_STATUS.CANCELLED);
  });

  it("keeps the customer on 'Confirmed' until Delhivery dispatches for delivery", () => {
    // In transit between facilities must not read as "Out for delivery".
    expect(mapShipmentToWorkflowStatus(mapDelhiveryStatus("In Transit", "UD"))).toBe(WORKFLOW_STATUS.PICKUP_READY);
    expect(mapShipmentToWorkflowStatus(mapDelhiveryStatus("Dispatched", "UD"))).toBe(WORKFLOW_STATUS.OUT_FOR_DELIVERY);
  });

  it("protects terminal states from out-of-order scans", () => {
    expect(isValidForwardStatusTransition("DELIVERED", "IN_TRANSIT")).toBe(false);
    expect(isValidForwardStatusTransition("CANCELLED", "OUT_FOR_DELIVERY")).toBe(false);
    expect(isValidForwardStatusTransition("OUT_FOR_DELIVERY", "IN_TRANSIT")).toBe(false);
  });

  it("allows progressive transitions", () => {
    expect(isValidForwardStatusTransition("ORDER_CREATED", "PICKED_UP")).toBe(true);
    expect(isValidForwardStatusTransition("PICKED_UP", "IN_TRANSIT")).toBe(true);
    expect(isValidForwardStatusTransition("IN_TRANSIT", "OUT_FOR_DELIVERY")).toBe(true);
    expect(isValidForwardStatusTransition("OUT_FOR_DELIVERY", "DELIVERED")).toBe(true);
    expect(isValidForwardStatusTransition("IN_TRANSIT", "FAILED")).toBe(true);
  });
});
