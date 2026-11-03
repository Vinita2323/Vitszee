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
  Smartphone,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { deliveryApi } from "../services/deliveryApi";

const POLL_MS = 3000;
const VERIFY_EVERY_N_POLLS = 3; // hit Razorpay via backend every ~9s as a webhook safety net

const STATUS_UI = {
  PAYMENT_PENDING: {
    label: "Waiting for payment",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
    Icon: Clock,
  },
  PAYMENT_FAILED: {
    label: "Payment failed",
    cls: "bg-red-50 text-red-700 border-red-200",
    Icon: AlertTriangle,
  },
  QR_EXPIRED: {
    label: "QR expired",
    cls: "bg-gray-100 text-gray-600 border-gray-200",
    Icon: Clock,
  },
  PAID: {
    label: "Payment received",
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

const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Payment step for COD orders, shown after the customer's delivery OTP is
 * verified: the rider picks how the customer pays.
 *
 *  - UPI  → a popup shows the Razorpay QR for the exact amount due. The QR is
 *           created as a fixed-amount code, so after scanning, the customer's
 *           UPI app already shows the amount and cannot change it.
 *  - Cash → the rider confirms the cash received.
 *
 * Delivery completes only when the backend verifies the payment (or records
 * the cash). Success is never decided by this component.
 */
const CodPaymentPanel = ({ orderId, onCompleted }) => {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState("choose"); // choose | cash
  const [upiOpen, setUpiOpen] = useState(false);
  const [cash, setCash] = useState("");
  const [now, setNow] = useState(Date.now());
  const [loadError, setLoadError] = useState(null);
  const pollCount = useRef(0);
  const resumed = useRef(false);
  const completedRef = useRef(false);

  const applyState = useCallback(
    (next) => {
      setState(next);
      // The backend could not reach Razorpay's status API: say so, keep the QR usable.
      setLoadError(next?.gatewayCheck?.ok === false ? next.gatewayCheck.message : null);
      if (next?.completed && !completedRef.current) {
        completedRef.current = true;
        setUpiOpen(false);
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
        // A failed verify must not wipe known state.
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
        await refresh();
        if (!res.data?.result?.reused && !res.data?.result?.completed) toast.success("Payment QR ready");
      } catch (e) {
        toast.error(errMessage(e, "Could not create the payment QR"));
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [orderId, refresh],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Resume: if a QR is already live (rider reloaded the page), reopen its popup.
  useEffect(() => {
    if (!state || resumed.current || state.completed) return;
    resumed.current = true;
    if (state.payment?.displayStatus === "PAYMENT_PENDING") setUpiOpen(true);
  }, [state]);

  const attemptStatus = state?.payment?.displayStatus;
  const polling = !state?.completed && state?.awaitingPayment && attemptStatus === "PAYMENT_PENDING" && upiOpen;
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

  const payWithUpi = () => {
    setUpiOpen(true);
    const live =
      state?.payment?.displayStatus === "PAYMENT_PENDING" &&
      state?.payment?.expiresAt &&
      new Date(state.payment.expiresAt).getTime() > Date.now();
    if (!live) createQr(false);
  };

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

  if (state.completed) {
    return (
      <Card className="p-5 rounded-3xl border border-emerald-100 flex items-center gap-2 text-emerald-700 font-semibold">
        <CheckCircle2 size={18} /> Payment received — delivery complete.
      </Card>
    );
  }

  return (
    <>
      <Card className="p-5 rounded-3xl shadow-sm border border-slate-100 space-y-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            OTP verified · Collect payment
          </p>
          <h3 className="text-3xl font-extrabold text-orange-600">{rupees(amount)}</h3>
          <p className="text-xs text-gray-500 mt-0.5">Choose how the customer is paying</p>
        </div>

        {view === "choose" && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!state.canGenerateQr || busy}
              onClick={payWithUpi}
              className="rounded-2xl border-2 border-[#0057B7] bg-[#0057B7]/5 p-4 flex flex-col items-center gap-2 text-[#0057B7] font-bold disabled:opacity-40 active:scale-95 transition"
            >
              <Smartphone size={28} />
              UPI / QR
              <span className="text-[10px] font-medium text-gray-500">Customer scans &amp; pays</span>
            </button>
            <button
              type="button"
              disabled={!state.canCollectCash || busy}
              onClick={() => setView("cash")}
              className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-4 flex flex-col items-center gap-2 text-emerald-700 font-bold disabled:opacity-40 active:scale-95 transition"
            >
              <Banknote size={28} />
              Cash
              <span className="text-[10px] font-medium text-gray-500">Collect from customer</span>
            </button>
          </div>
        )}

        {view === "cash" && (
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
                className="block w-full rounded-lg border border-gray-300 pl-8 pr-4 py-3 text-lg font-bold bg-gray-50 focus:bg-white outline-none focus:border-emerald-500"
              />
            </div>
            {Number(cash) > amount && (
              <p className="text-sm text-emerald-700 font-medium">
                Return change: {rupees(Math.round((Number(cash) - amount) * 100) / 100)}
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setView("choose")}>
                Back
              </Button>
              <Button className="flex-[2]" disabled={busy} onClick={confirmCash}>
                {busy ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Banknote size={14} className="mr-1.5" />}
                Confirm cash collected
              </Button>
            </div>
            <p className="text-[11px] text-gray-400">
              Any open QR is closed. If the customer already paid by QR, the app will tell you and complete the order.
            </p>
          </div>
        )}

        {loadError && !upiOpen && <p className="text-[11px] text-amber-600 text-center">{loadError}</p>}
      </Card>

      {/* UPI popup: Razorpay QR for the exact amount */}
      {upiOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Pay with UPI"
        >
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Scan to pay</p>
                <h3 className="text-4xl font-extrabold text-[#0057B7] flex items-center leading-tight">
                  <IndianRupee size={30} />
                  {Number(amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </h3>
                <p className="text-xs text-gray-500">Order #{String(orderId).slice(-8)} · amount is fixed</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setUpiOpen(false)}
                className="p-2 -mr-2 rounded-full hover:bg-gray-100"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {ui && (
              <span className={`mt-3 inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${ui.cls}`}>
                <ui.Icon size={12} /> {ui.label}
              </span>
            )}

            <div className="mt-4 flex flex-col items-center">
              {payment && effective !== "QR_EXPIRED" && (payment.qrImageUrl || payment.paymentLinkUrl) ? (
                <>
                  <div className={`p-3 bg-white rounded-2xl border ${isLive ? "border-slate-200" : "border-red-200 opacity-60"}`}>
                    {payment.paymentLinkUrl ? (
                      <QRCodeSVG
                        value={payment.paymentLinkUrl}
                        size={256}
                        level="M"
                        marginSize={1}
                        title={`Pay ${rupees(amount)}`}
                      />
                    ) : (
                      <img
                        src={payment.qrImageUrl}
                        alt={`Pay ${rupees(amount)} via UPI`}
                        className="w-64 h-64 object-contain"
                      />
                    )}
                  </div>
                  {isLive && (
                    <p className="mt-2 text-xs text-gray-500 text-center">
                      <Clock size={12} className="inline mr-1" />
                      Valid for {formatClock(remaining)} · {payment.paymentLinkUrl
                        ? `Customer scans with the phone camera or any UPI app — the payment page opens with ${rupees(amount)} already filled in`
                        : `Customer scans with any UPI app — ${rupees(amount)} is already filled in`}
                    </p>
                  )}
                </>
              ) : (
                <div className="py-14 text-center text-sm text-gray-500">
                  {busy ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" /> Creating QR for {rupees(amount)}…
                    </span>
                  ) : effective === "QR_EXPIRED" ? (
                    "This QR has expired."
                  ) : (
                    "No active QR."
                  )}
                </div>
              )}
            </div>

            {effective === "PAYMENT_FAILED" && (
              <p className="mt-3 text-xs text-red-600 text-center">
                {payment?.failureReason || "The payment attempt failed."} The customer can try again, or generate a new QR.
              </p>
            )}
            {payment?.reviewRequired && (
              <p className="mt-3 text-xs text-amber-700 text-center">
                A payment needs review by support. Do not hand over cash for the same amount.
              </p>
            )}
            {loadError && <p className="mt-3 text-[11px] text-amber-600 text-center">{loadError}</p>}

            <div className="mt-4 grid grid-cols-2 gap-2">
              {isLive ? (
                <Button variant="outline" disabled={busy} onClick={() => refresh({ verify: true })}>
                  <RefreshCw size={14} className="mr-1.5" /> Check payment
                </Button>
              ) : (
                <Button disabled={busy || !state.canGenerateQr} onClick={() => createQr(true)}>
                  {busy ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <QrCode size={14} className="mr-1.5" />}
                  {payment ? "New QR" : "Generate QR"}
                </Button>
              )}
              <Button
                variant="outline"
                disabled={busy || !state.canCollectCash}
                onClick={() => {
                  setUpiOpen(false);
                  setView("cash");
                }}
              >
                <Banknote size={14} className="mr-1.5" /> Pay with cash
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CodPaymentPanel;
