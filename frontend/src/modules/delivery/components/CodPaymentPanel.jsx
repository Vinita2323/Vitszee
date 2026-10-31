import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  QrCode,
  IndianRupee,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Banknote,
} from "lucide-react";
import { toast } from "sonner";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { deliveryApi } from "../services/deliveryApi";

const POLL_MS = 3000;
const VERIFY_EVERY_N_POLLS = 3; // hit Razorpay via backend every ~9s as a webhook safety net

const STATUS_UI = {
  PAYMENT_PENDING: {
    label: "Payment Pending",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
    Icon: Clock,
  },
  PAYMENT_FAILED: {
    label: "Payment Failed",
    cls: "bg-red-50 text-red-700 border-red-200",
    Icon: AlertTriangle,
  },
  QR_EXPIRED: {
    label: "QR Expired",
    cls: "bg-gray-100 text-gray-600 border-gray-200",
    Icon: Clock,
  },
  PAID: {
    label: "Payment Received",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Icon: CheckCircle2,
  },
};

const errMessage = (e, fallback) =>
  e?.response?.data?.result?.error?.message ||
  e?.response?.data?.message ||
  e?.message ||
  fallback;

const formatClock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Rider-side payment step for COD orders, shown after the customer's
 * delivery OTP is verified. Shows a Razorpay Dynamic QR for the exact amount
 * due; delivery completes only when the backend verifies the payment (or the
 * rider records cash). Success is never decided by this component.
 */
const CodPaymentPanel = ({ orderId, onCompleted }) => {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("qr"); // qr | cash
  const [cash, setCash] = useState("");
  const [now, setNow] = useState(Date.now());
  const [loadError, setLoadError] = useState(null);
  const pollCount = useRef(0);
  const autoCreated = useRef(false);
  const completedRef = useRef(false);

  const applyState = useCallback(
    (next) => {
      setState(next);
      setLoadError(null);
      if (next?.completed && !completedRef.current) {
        completedRef.current = true;
        onCompleted?.(next);
      }
    },
    [onCompleted],
  );

  const refresh = useCallback(
    async ({ verify = false } = {}) => {
      try {
        const res = verify
          ? await deliveryApi.verifyCodPayment(orderId)
          : await deliveryApi.getCodPayment(orderId);
        applyState(res.data?.result);
      } catch (e) {
        // A failed verify (e.g. Razorpay unreachable) must not wipe known state.
        setLoadError(errMessage(e, "Could not refresh payment status"));
      }
    },
    [orderId, applyState],
  );

  const createQr = useCallback(
    async (regenerate = false) => {
      setBusy(true);
      try {
        const res = await deliveryApi.createCodQr(orderId, { regenerate });
        if (res.data?.result?.completed) {
          await refresh();
        } else {
          await refresh();
          if (!res.data?.result?.reused) toast.success("Payment QR ready");
        }
      } catch (e) {
        toast.error(errMessage(e, "Could not create the payment QR"));
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [orderId, refresh],
  );

  // Initial load, then auto-create the first QR once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!state || autoCreated.current) return;
    if (state.completed) return;
    if (state.awaitingPayment && !state.payment && state.canGenerateQr) {
      autoCreated.current = true;
      createQr(false);
    }
  }, [state, createQr]);

  // Poll while a QR is live; verify against Razorpay every few polls.
  const attemptStatus = state?.payment?.displayStatus;
  const polling = !state?.completed && state?.awaitingPayment && attemptStatus === "PAYMENT_PENDING" && mode === "qr";
  useEffect(() => {
    if (!polling) return undefined;
    const t = setInterval(() => {
      pollCount.current += 1;
      refresh({ verify: pollCount.current % VERIFY_EVERY_N_POLLS === 0 });
    }, POLL_MS);
    return () => clearInterval(t);
  }, [polling, refresh]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const confirmCash = async () => {
    setBusy(true);
    try {
      const body = cash === "" ? {} : { amountReceived: Number(cash) };
      await deliveryApi.confirmCodCash(orderId, body);
      await refresh();
    } catch (e) {
      toast.error(errMessage(e, "Could not record cash collection"));
      await refresh({ verify: true });
    } finally {
      setBusy(false);
    }
  };

  if (!state) {
    return (
      <Card className="p-6 rounded-3xl flex items-center justify-center text-gray-500 gap-2">
        <Loader2 className="animate-spin" size={18} /> Loading payment…
      </Card>
    );
  }

  const payment = state.payment;
  const amount = state.outstandingAmount || payment?.amount || 0;
  const expiresAtMs = payment?.expiresAt ? new Date(payment.expiresAt).getTime() : 0;
  const remaining = expiresAtMs - now;
  const isLive = attemptStatus === "PAYMENT_PENDING" && remaining > 0;
  const effective = attemptStatus === "PAYMENT_PENDING" && remaining <= 0 ? "QR_EXPIRED" : attemptStatus;
  const ui = STATUS_UI[effective] || null;

  return (
    <Card className="p-5 rounded-3xl shadow-sm border border-slate-100 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            OTP verified · Collect payment
          </p>
          <h3 className="text-3xl font-extrabold text-orange-600 flex items-center">
            <IndianRupee size={24} />
            {amount}
          </h3>
        </div>
        {ui && (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${ui.cls}`}
          >
            <ui.Icon size={12} /> {ui.label}
          </span>
        )}
      </div>

      {state.completed ? (
        <div className="flex items-center gap-2 text-emerald-700 font-semibold">
          <CheckCircle2 size={18} /> Payment received — delivery complete.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-xl text-sm font-bold">
            <button
              type="button"
              disabled={!state.canGenerateQr}
              onClick={() => setMode("qr")}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 ${
                mode === "qr" ? "bg-white shadow text-[#0057B7]" : "text-gray-500"
              } disabled:opacity-40`}
            >
              <QrCode size={15} /> Scan QR
            </button>
            <button
              type="button"
              disabled={!state.canCollectCash}
              onClick={() => setMode("cash")}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 ${
                mode === "cash" ? "bg-white shadow text-[#0057B7]" : "text-gray-500"
              } disabled:opacity-40`}
            >
              <Banknote size={15} /> Cash
            </button>
          </div>

          {mode === "qr" && (
            <div className="space-y-3">
              {payment && effective !== "QR_EXPIRED" && payment.qrImageUrl ? (
                <div className="flex flex-col items-center">
                  <div className={`p-3 bg-white rounded-2xl border ${isLive ? "border-slate-200" : "border-red-200 opacity-60"}`}>
                    <img
                      src={payment.qrImageUrl}
                      alt={`Pay ₹${amount} via UPI`}
                      className="w-56 h-56 object-contain"
                    />
                  </div>
                  {isLive && (
                    <p className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                      <Clock size={12} /> Expires in {formatClock(remaining)} · Ask the customer to scan with any UPI app
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center text-sm text-gray-500 py-6">
                  {busy ? "Generating QR…" : effective === "QR_EXPIRED" ? "The QR has expired." : "No active QR."}
                </div>
              )}

              {effective === "PAYMENT_FAILED" && (
                <p className="text-xs text-red-600 text-center">
                  {payment?.failureReason || "The payment attempt failed."} The customer can try again, or generate a new QR.
                </p>
              )}
              {payment?.reviewRequired && (
                <p className="text-xs text-amber-700 text-center">
                  A payment needs review by support. Do not hand over cash for the same amount.
                </p>
              )}

              <div className="flex gap-2">
                {isLive && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={busy}
                    onClick={() => refresh({ verify: true })}
                  >
                    <RefreshCw size={14} className="mr-1.5" /> Check payment
                  </Button>
                )}
                {(!payment || effective !== "PAYMENT_PENDING" || !isLive) && state.canGenerateQr && (
                  <Button className="flex-1" disabled={busy} onClick={() => createQr(true)}>
                    {busy ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <QrCode size={14} className="mr-1.5" />}
                    {payment ? "Generate new QR" : "Generate QR"}
                  </Button>
                )}
              </div>
            </div>
          )}

          {mode === "cash" && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Cash received</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-gray-500 font-bold">₹</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={amount}
                  value={cash}
                  placeholder={String(amount)}
                  onChange={(e) => setCash(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 pl-8 pr-4 py-3 text-lg font-bold bg-gray-50 focus:bg-white outline-none focus:border-orange-500"
                />
              </div>
              {Number(cash) > amount && (
                <p className="text-sm text-emerald-700 font-medium">
                  Return change: ₹{Math.round((Number(cash) - amount) * 100) / 100}
                </p>
              )}
              <Button className="w-full" disabled={busy} onClick={confirmCash}>
                {busy ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Banknote size={14} className="mr-1.5" />}
                Confirm cash collected
              </Button>
              <p className="text-[11px] text-gray-400">
                Any open QR is closed. If the customer already paid by QR, the app will tell you and complete the order.
              </p>
            </div>
          )}
        </>
      )}

      {loadError && (
        <p className="text-[11px] text-amber-600 text-center">{loadError}</p>
      )}
    </Card>
  );
};

export default CodPaymentPanel;
