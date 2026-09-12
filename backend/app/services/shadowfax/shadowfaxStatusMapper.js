import { WORKFLOW_STATUS } from "../../constants/orderWorkflow.js";

/**
 * Status priority levels for Forward orders. Higher number = further along the lifecycle.
 * Protects against out-of-order webhook delivery.
 */
const FORWARD_STATUS_PRIORITY = {
  PENDING: 10,
  SERVICEABILITY_CHECKED: 15,
  ORDER_CREATED: 20,
  DISPATCH_READY: 30,
  RIDER_ASSIGNED: 40,
  RIDER_ARRIVED: 50,
  PICKED_UP: 60,
  IN_TRANSIT: 70,
  OUT_FOR_DELIVERY: 80,
  DELIVERED: 100,
  CANCELLED: 100,
  FAILED: 100,
};

const TERMINAL_FORWARD_STATUSES = new Set(["DELIVERED", "CANCELLED", "FAILED"]);

/**
 * Status priority levels for Reverse pickups.
 */
const REVERSE_STATUS_PRIORITY = {
  none: 0,
  return_requested: 10,
  return_approved: 20,
  return_pickup_assigned: 30,
  return_in_transit: 50,
  return_drop_pending: 60,
  returned: 80,
  qc_passed: 70,
  qc_failed: 100,
  refund_completed: 100,
  return_rejected: 100,
  return_cancelled: 100,
};

const TERMINAL_REVERSE_STATUSES = new Set([
  "returned",
  "refund_completed",
  "qc_failed",
  "return_rejected",
  "return_cancelled",
]);

/**
 * Normalizes raw Forward status strings from Shadowfax into internal Shipment statuses.
 */
export function mapShadowfaxForwardStatus(rawStatus) {
  const s = String(rawStatus || "").trim().toLowerCase();

  switch (s) {
    case "order_created":
    case "created":
    case "new":
    case "open":
    case "confirmed":
      return "ORDER_CREATED";

    case "allotted":
    case "allocated":
    case "assigned":
    case "rider_assigned":
    case "delivery_assigned":
      return "RIDER_ASSIGNED";

    case "arrived":
    case "arrived_at_store":
    case "at_pickup":
    case "reached_pickup":
      return "RIDER_ARRIVED";

    case "picked_up":
    case "picked":
    case "collected":
      return "PICKED_UP";

    case "in_transit":
    case "intransit":
      return "IN_TRANSIT";

    case "out_for_delivery":
    case "ofd":
    case "reached_customer":
    case "doorstep":
      return "OUT_FOR_DELIVERY";

    case "delivered":
    case "dlv":
    case "successful":
    case "completed":
      return "DELIVERED";

    case "cancelled":
    case "can":
    case "canceled":
      return "CANCELLED";

    case "failed":
    case "rto":
    case "undelivered":
    case "rejected":
    case "unserviceable":
      return "FAILED";

    default:
      return "IN_TRANSIT";
  }
}

/**
 * Maps normalized Shipment status to internal Order `workflowStatus`.
 */
export function mapShipmentToWorkflowStatus(shipmentStatus) {
  switch (shipmentStatus) {
    case "ORDER_CREATED":
      return WORKFLOW_STATUS.DELIVERY_SEARCH;
    case "RIDER_ASSIGNED":
    case "RIDER_ARRIVED":
      return WORKFLOW_STATUS.DELIVERY_ASSIGNED;
    case "PICKED_UP":
      return WORKFLOW_STATUS.PICKUP_READY;
    case "IN_TRANSIT":
    case "OUT_FOR_DELIVERY":
      return WORKFLOW_STATUS.OUT_FOR_DELIVERY;
    case "DELIVERED":
      return WORKFLOW_STATUS.DELIVERED;
    case "CANCELLED":
      return WORKFLOW_STATUS.CANCELLED;
    default:
      return null;
  }
}

/**
 * Normalizes raw Reverse Pickup status strings from Shadowfax into internal Return statuses.
 */
export function mapShadowfaxReverseStatus(rawStatus) {
  const s = String(rawStatus || "").trim().toLowerCase();

  switch (s) {
    case "request_created":
    case "created":
    case "open":
    case "approved":
      return "return_approved";

    case "assigned":
    case "allotted":
    case "assigned_for_pickup":
    case "rider_assigned":
      return "return_pickup_assigned";

    case "at_customer":
    case "out_for_pickup":
    case "in_progress":
      return "return_pickup_assigned";

    case "qc_passed":
    case "picked":
    case "picked_up":
    case "in_transit":
      return "return_in_transit";

    case "qc_failed":
    case "rejected":
      return "qc_failed";

    case "delivered_to_hub":
    case "returned":
    case "delivered_to_seller":
    case "completed":
      return "returned";

    case "cancelled":
    case "canceled":
      return "return_cancelled";

    default:
      return "return_pickup_assigned";
  }
}

/**
 * Checks whether a proposed forward status transition is valid and non-downgrading.
 */
export function isValidForwardStatusTransition(currentStatus, newStatus) {
  if (!currentStatus) return true;
  if (currentStatus === newStatus) return true;

  // Protect terminal statuses
  if (TERMINAL_FORWARD_STATUSES.has(currentStatus)) {
    return false;
  }

  const currentPriority = FORWARD_STATUS_PRIORITY[currentStatus] || 0;
  const newPriority = FORWARD_STATUS_PRIORITY[newStatus] || 0;

  // Allow transitions that move forward or terminate
  return newPriority >= currentPriority || TERMINAL_FORWARD_STATUSES.has(newStatus);
}

/**
 * Checks whether a proposed reverse status transition is valid and non-downgrading.
 */
export function isValidReverseStatusTransition(currentReturnStatus, newReturnStatus) {
  if (!currentReturnStatus || currentReturnStatus === "none") return true;
  if (currentReturnStatus === newReturnStatus) return true;

  // Protect terminal return statuses
  if (TERMINAL_REVERSE_STATUSES.has(currentReturnStatus)) {
    return false;
  }

  const currentPriority = REVERSE_STATUS_PRIORITY[currentReturnStatus] || 0;
  const newPriority = REVERSE_STATUS_PRIORITY[newReturnStatus] || 0;

  return newPriority >= currentPriority || TERMINAL_REVERSE_STATUSES.has(newReturnStatus);
}
