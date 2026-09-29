/**
 * Maps Delhivery Local (intracity) fulfilment states to our internal Shipment status.
 *
 * Delhivery Local reports both an order `status` and a `fulfilmentStatus`
 * (contract V6 "Order - Fulfilment State Mapping"):
 *   creating            -> pending
 *   created             -> searching_for_agent
 *   assigned            -> agent_assigned / at_pickup
 *   inProgress          -> out_for_delivery / at_stopN / at_delivery
 *   delivered           -> order_delivered
 *   cancelled           -> cancelled
 *
 * We collapse those onto the shared Shipment status enum so the same reconciliation,
 * order-sync and admin plumbing used by the Express integration applies unchanged.
 * Returns null for states that should not move the shipment forward.
 */
export function mapLocalStatus(fulfilmentStatus, orderStatus = "") {
  const f = String(fulfilmentStatus || "").trim().toLowerCase();
  const s = String(orderStatus || "").trim().toLowerCase();

  // Intermediate-stop states arrive as at_stop1, at_stop2, ...
  if (/^at_stop\d+$/.test(f)) return "OUT_FOR_DELIVERY";

  switch (f) {
    case "pending":
    case "searching_for_agent":
      return "ORDER_CREATED";

    case "agent_assigned":
      return "RIDER_ASSIGNED";

    case "at_pickup":
      return "RIDER_ARRIVED";

    // Rider has collected the parcel and is moving toward the drop / stops.
    case "out_for_delivery":
    case "at_delivery":
      return "OUT_FOR_DELIVERY";

    case "order_delivered":
      return "DELIVERED";

    case "cancelled":
      return "CANCELLED";

    default:
      break;
  }

  // Fall back to the coarse order status when the fulfilment text is unknown.
  switch (s) {
    case "creating":
    case "created":
      return "ORDER_CREATED";
    case "assigned":
      return "RIDER_ASSIGNED";
    case "inprogress":
      return "OUT_FOR_DELIVERY";
    case "delivered":
      return "DELIVERED";
    case "cancelled":
      return "CANCELLED";
    default:
      return null;
  }
}

// Valid vehicle modes per the contract.
export const LOCAL_VEHICLE_MODES = ["2-wheeler", "3-wheeler", "tata-ace", "mini-3w", "8ft-pickup"];

// Cancellation reasons Delhivery Local accepts.
export const LOCAL_CANCELLATION_REASONS = [
  "taking too long to assign a driver",
  "service is no longer required",
  "requested wrong vehicle",
  "requested wrong pickup or destination",
  "pickup tat breached",
  "fraudulent rider behaviour",
];

/** Normalises a free-text reason to one Delhivery accepts (defaults to the safe generic). */
export function normalizeCancellationReason(reason) {
  const r = String(reason || "").trim().toLowerCase();
  const match = LOCAL_CANCELLATION_REASONS.find((allowed) => allowed === r);
  return match || "service is no longer required";
}
