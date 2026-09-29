import { WORKFLOW_STATUS } from "../../constants/orderWorkflow.js";

/**
 * Status priority levels for forward shipments. Higher number = further along the
 * lifecycle. Protects against out-of-order scans arriving from webhook + polling.
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
 * Lower-cases a Delhivery status and normalises spacing ("In Transit" -> "in transit").
 */
export function normalizeDelhiveryStatus(rawStatus) {
  return String(rawStatus || "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

/**
 * Maps a Delhivery scan to our internal Shipment status.
 *
 * `status` is the human status from the scan ("Manifested", "In Transit", "Dispatched",
 * "Delivered", "RTO", "Cancelled", ...). `statusType` is the short code Delhivery sends
 * alongside it: DL delivered, UD undelivered/in progress, RT returned, PP pickup pending,
 * PU picked up, CN cancelled.
 *
 * Returns null when a scan should not change the shipment state (unknown or informational),
 * so callers record it without guessing.
 */
export function mapDelhiveryStatus(status, statusType = "") {
  const s = normalizeDelhiveryStatus(status);
  const type = String(statusType || "").trim().toUpperCase();

  switch (s) {
    case "manifested":
    case "open":
    case "not picked":
    case "scheduled":
      return "ORDER_CREATED";

    case "picked up":
    case "picked":
    case "collected":
      return "PICKED_UP";

    case "in transit":
    case "pending":
      return "IN_TRANSIT";

    case "dispatched":
    case "out for delivery":
      return "OUT_FOR_DELIVERY";

    case "delivered":
      return "DELIVERED";

    case "cancelled":
    case "canceled":
      return "CANCELLED";

    // The parcel is going back to the seller: the customer will not receive it.
    case "rto":
    case "dto":
    case "returned":
    case "rto in transit":
    case "lost":
    case "damaged":
      return "FAILED";

    default:
      break;
  }

  // Fall back to the status type when the status text is unknown.
  switch (type) {
    case "DL":
      return "DELIVERED";
    case "CN":
      return "CANCELLED";
    case "RT":
      return "FAILED";
    case "PU":
      return "PICKED_UP";
    case "PP":
      return "ORDER_CREATED";
    default:
      return null;
  }
}

/**
 * Maps our Shipment status to the order's `workflowStatus`.
 * Hub movements stay on PICKUP_READY ("Confirmed" for customers) so the order only
 * shows "Out for delivery" once Delhivery dispatches it for delivery.
 */
export function mapShipmentToWorkflowStatus(shipmentStatus) {
  switch (shipmentStatus) {
    case "ORDER_CREATED":
      return WORKFLOW_STATUS.DELIVERY_SEARCH;
    case "RIDER_ASSIGNED":
    case "RIDER_ARRIVED":
      return WORKFLOW_STATUS.DELIVERY_ASSIGNED;
    case "PICKED_UP":
    case "IN_TRANSIT":
      return WORKFLOW_STATUS.PICKUP_READY;
    case "OUT_FOR_DELIVERY":
      return WORKFLOW_STATUS.OUT_FOR_DELIVERY;
    case "DELIVERED":
      return WORKFLOW_STATUS.DELIVERED;
    case "CANCELLED":
    case "FAILED":
      return WORKFLOW_STATUS.CANCELLED;
    default:
      return null;
  }
}

/**
 * Checks whether a proposed forward status transition is valid and non-downgrading.
 */
export function isValidForwardStatusTransition(currentStatus, newStatus) {
  if (!currentStatus) return true;
  if (currentStatus === newStatus) return true;
  if (TERMINAL_FORWARD_STATUSES.has(currentStatus)) return false;

  const currentPriority = FORWARD_STATUS_PRIORITY[currentStatus] || 0;
  const newPriority = FORWARD_STATUS_PRIORITY[newStatus] || 0;
  return newPriority >= currentPriority || TERMINAL_FORWARD_STATUSES.has(newStatus);
}
