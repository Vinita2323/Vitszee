import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Wallet,
  Loader2,
  RotateCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Banknote,
} from "lucide-react";
import { toast } from "sonner";
import Card from "@/shared/components/ui/Card";
import Button from "@/shared/components/ui/Button";
import { deliveryApi } from "../../services/deliveryApi";

const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const fmtDateTime = (iso) => {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "-";
  }
};

const DEPOSIT_UI = {
  SUBMITTED: { label: "Awaiting verification", cls: "bg-amber-50 text-amber-700" },
  APPROVING: { label: "Being verified", cls: "bg-amber-50 text-amber-700" },
  APPROVED: { label: "Settled", cls: "bg-emerald-50 text-emerald-700" },
  PARTIALLY_APPROVED: { label: "Partly settled", cls: "bg-blue-50 text-blue-700" },
  REJECTED: { label: "Rejected", cls: "bg-red-50 text-red-700" },
};

const SETTLEMENT_UI = {
  ACTIVE: "bg-blue-50 text-blue-700",
  PENDING: "bg-amber-50 text-amber-700",
  PARTIALLY_SETTLED: "bg-blue-50 text-blue-700",
  SETTLED: "bg-emerald-50 text-emerald-700",
  OVERDUE: "bg-red-50 text-red-700",
  REJECTED: "bg-red-50 text-red-700",
  DISPUTED: "bg-purple-50 text-purple-700",
};

/**
 * Delivery partner "Wallet": the cash they have collected from customers and
 * what is still owed to the company. This is a cash ledger, not a spendable
 * balance — collected cash must be deposited. All figures come from the backend.
 */
const CashWallet = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await deliveryApi.getCashSettlementOverview();
      setData(res.data?.result || null);
    } catch (e) {
      toast.error(e?.response?.data?.message || "Could not load your wallet");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cash = data?.cash || {};
  const limit = data?.limit || {};
  const outstanding = Number(cash.outstanding || 0);
  const pct = limit.limit ? Math.min(100, Math.round((outstanding / limit.limit) * 100)) : 0;
  const barCls = limit.overLimit ? "bg-red-500" : limit.nearLimit ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="bg-gray-50 min-h-screen pb-24 font-sans">
      <div className="bg-gradient-to-br from-[#09356E] via-[#0057B7] to-[#004494] text-white py-3 px-4 sticky top-0 z-40 shadow-sm flex items-center">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-white/10 mr-1.5" aria-label="Go Back">
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-sm font-black leading-tight tracking-tight flex-1">Wallet</h1>
        <button onClick={load} className="p-1.5 rounded-full hover:bg-white/10" aria-label="Refresh">
          <RotateCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16 text-gray-500">
          <Loader2 className="animate-spin" />
        </div>
      ) : (
        <div className="p-4 space-y-4 max-w-lg mx-auto">
          {/* Cash you currently owe */}
          <Card className="p-5 rounded-2xl border border-gray-100 bg-white">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Cash to deposit</p>
                <p className="text-3xl font-extrabold text-gray-900 mt-0.5">{rupees(outstanding)}</p>
                <p className="text-xs text-gray-500 mt-1">Cash collected from customers that is still with you</p>
              </div>
              <div className="p-3 rounded-xl bg-orange-50 text-orange-600">
                <Wallet size={22} />
              </div>
            </div>

            {limit.limit > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-[11px] font-semibold text-gray-500 mb-1">
                  <span>Holding limit</span>
                  <span>
                    {rupees(outstanding)} / {rupees(limit.limit)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full ${barCls}`} style={{ width: `${pct}%` }} />
                </div>
                {limit.overLimit && (
                  <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle size={12} /> You are over the cash limit. Please deposit now.
                  </p>
                )}
                {limit.blocked && (
                  <p className="mt-1 text-xs text-red-600">New COD orders are paused until you deposit your overdue cash.</p>
                )}
              </div>
            )}

            {Number(cash.overdue) > 0 && (
              <p className="mt-3 text-xs font-semibold text-red-600 flex items-center gap-1">
                <Clock size={12} /> {rupees(cash.overdue)} is overdue
              </p>
            )}

            <Button className="w-full mt-4" onClick={() => navigate("/delivery/profile/shifts")}>
              <Banknote size={16} className="mr-2" /> {outstanding > 0 ? "Deposit cash" : "Shifts & settlement"}
            </Button>
          </Card>

          {/* Totals */}
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Collected", cash.totalCollected],
              ["Deposited", cash.totalDeposited],
              ["Cash orders", cash.cashOrders, true],
            ].map(([label, value, plain]) => (
              <div key={label} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
                <p className="text-sm font-extrabold text-gray-900 mt-0.5">{plain ? Number(value || 0) : rupees(value)}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-gray-400 px-1">
            Only <b>cash</b> collected from customers counts here. Orders paid by UPI/QR or online go straight to the
            company and never add to this balance. Cash counts as deposited only after an admin verifies your deposit.
          </p>

          {/* Recent deposits */}
          <section>
            <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-2 px-1">Recent deposits</h2>
            <Card className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-50 overflow-hidden">
              {(data?.deposits || []).length === 0 ? (
                <p className="p-4 text-center text-xs text-gray-400">No deposits yet</p>
              ) : (
                data.deposits.slice(0, 8).map((d) => {
                  const ui = DEPOSIT_UI[d.status] || DEPOSIT_UI.SUBMITTED;
                  return (
                    <div key={d.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-900">{rupees(d.amount)}</p>
                        <p className="text-[11px] text-gray-400">
                          {d.method === "PHYSICAL_CASH" ? "Cash at office" : "Bank / UPI"} · {fmtDateTime(d.submittedAt)}
                        </p>
                        {d.status === "REJECTED" && d.rejectionReason && (
                          <p className="text-[11px] text-red-600 mt-0.5">{d.rejectionReason}</p>
                        )}
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${ui.cls}`}>{ui.label}</span>
                    </div>
                  );
                })
              )}
            </Card>
          </section>

          {/* Shift history */}
          <section>
            <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-2 px-1">Cash by shift</h2>
            <Card className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-50 overflow-hidden">
              {(data?.shifts || []).length === 0 ? (
                <p className="p-4 text-center text-xs text-gray-400">
                  No shifts yet. Start a shift before collecting COD cash.
                </p>
              ) : (
                data.shifts.slice(0, 8).map((s) => (
                  <div key={s.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{fmtDateTime(s.startedAt)}</p>
                      <p className="text-[11px] text-gray-400">
                        Cash {rupees(s.totals?.totalCashCollected)} · {s.totals?.cashOrders || 0} orders · Online{" "}
                        {rupees(s.totals?.totalOnlinePayments)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${SETTLEMENT_UI[s.settlementStatus] || "bg-gray-100 text-gray-600"}`}>
                        {String(s.settlementStatus || "").replace("_", " ")}
                      </span>
                      {Number(s.totals?.pendingCash) > 0 && (
                        <p className="text-[11px] text-gray-500 mt-1">Pending {rupees(s.totals.pendingCash)}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </Card>
          </section>

          <button
            type="button"
            onClick={() => navigate("/delivery/profile/shifts")}
            className="w-full flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3 text-sm font-bold text-[#0057B7]"
          >
            <span className="flex items-center gap-2">
              <CheckCircle2 size={16} /> My Shifts &amp; Cash Settlement
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default CashWallet;
