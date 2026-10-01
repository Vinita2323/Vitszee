import { useEffect, useRef, useState } from "react";
import axiosInstance from "@core/api/axios";
import { joinOrderRoom, onOrderQuickUpdate } from "@/core/services/orderSocket";
import { createSocketTokenReader } from "@core/utils/authStorage";
import { STORAGE_KEYS } from "@core/utils/storage";

const TERMINAL = new Set(["DELIVERED", "CANCELLED", "FAILED"]);

/**
 * Self-contained quick-delivery (Delhivery Local) status + rider card.
 * Renders nothing unless the order is a live quick delivery.
 * Fetches /delhivery/track/:orderId on mount, polls as a fallback, and
 * subscribes to the `order:quick:update` socket event for instant updates.
 *
 * @param {{ orderId: string, role?: "customer"|"seller" }} props
 */
export default function QuickDeliveryCard({ orderId, role = "customer" }) {
  const [track, setTrack] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!orderId) return undefined;
    let alive = true;
    const tokenKey = role === "seller" ? STORAGE_KEYS.AUTH_SELLER : STORAGE_KEYS.AUTH_CUSTOMER;
    const getToken = createSocketTokenReader(tokenKey);

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const load = async () => {
      try {
        const res = await axiosInstance.get(`/delhivery/track/${encodeURIComponent(orderId)}`);
        const data = res?.data?.data ?? res?.data;
        if (!alive || !data || data.deliveryType !== "quick") return;
        setTrack(data);
        if (TERMINAL.has(String(data.shipmentStatus || "").toUpperCase())) stopPolling();
      } catch {
        /* 404 for non-quick / no shipment: keep the card hidden */
      }
    };

    load();
    pollRef.current = setInterval(load, 25000);

    let off = () => {};
    try {
      joinOrderRoom(orderId, getToken);
      off = onOrderQuickUpdate(getToken, (payload) => {
        if (!payload || payload.orderId !== orderId) return;
        setTrack((prev) => ({ ...(prev || {}), ...payload, deliveryType: "quick" }));
        if (TERMINAL.has(String(payload.shipmentStatus || "").toUpperCase())) stopPolling();
      });
    } catch {
      /* socket is optional; polling keeps it fresh */
    }

    return () => {
      alive = false;
      stopPolling();
      off();
    };
  }, [orderId, role]);

  if (!track || track.deliveryType !== "quick") return null;

  const rider = track.rider || null;
  const label = track.statusLabel || "Processing";
  const trackingUrl = track.trackingUrl || null;
  const hasRider = rider && (rider.name || rider.phone || rider.vehicleNumber);

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 my-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>🛵</span>
          <span className="font-bold text-emerald-900">Quick delivery</span>
        </div>
        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-600 text-white whitespace-nowrap">
          {label}
        </span>
      </div>

      {hasRider ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 truncate">{rider.name || "Delivery rider"}</div>
            <div className="text-xs text-slate-600 truncate">
              {rider.vehicleNumber ? `Vehicle ${rider.vehicleNumber}` : ""}
              {rider.vehicleType ? ` · ${rider.vehicleType}` : ""}
            </div>
          </div>
          {rider.phone ? (
            <a
              href={`tel:${rider.phone}`}
              className="shrink-0 px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold"
            >
              Call rider
            </a>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 text-sm text-slate-600">Assigning a rider…</div>
      )}

      {trackingUrl ? (
        <a
          href={trackingUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 block text-center px-3 py-2 rounded-xl border border-emerald-600 text-emerald-700 text-sm font-semibold"
        >
          Track live
        </a>
      ) : null}
    </div>
  );
}
