import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  RotateCw,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  IndianRupee,
  Upload,
  Calendar,
  Building2,
  FileText,
  Info,
  Loader2,
  ChevronRight,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import Card from "@/shared/components/ui/Card";
import Button from "@/shared/components/ui/Button";
import { deliveryApi } from "../../services/deliveryApi";

const formatTime = (isoString) => {
  if (!isoString) return "-";
  try {
    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
};

const formatDate = (isoString) => {
  if (!isoString) return "-";
  try {
    return new Date(isoString).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "-";
  }
};

const ShiftsAndSettlement = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [overview, setOverview] = useState(null);
  const [showEndShiftModal, setShowEndShiftModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);

  // Deposit Form State
  const [depositMethod, setDepositMethod] = useState("BANK_UPI");
  const [depositAmount, setDepositAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const fileInputRef = useRef(null);

  const fetchOverview = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const res = await deliveryApi.getCashSettlementOverview();
      if (res.data?.success && res.data?.result) {
        setOverview(res.data.result);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load shift overview");
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const handleStartShift = async () => {
    try {
      setActionLoading(true);
      const res = await deliveryApi.startShift();
      toast.success(res.data?.message || "Shift started successfully! You can now collect COD cash.");
      await fetchOverview(true);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to start shift");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEndShift = async () => {
    try {
      setActionLoading(true);
      const res = await deliveryApi.endShift();
      toast.success(res.data?.message || "Shift ended successfully.");
      setShowEndShiftModal(false);
      await fetchOverview(true);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to end shift. Make sure you have no active orders.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10MB");
      return;
    }
    setProofFile(file);
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setProofPreview(url);
    } else {
      setProofPreview(null);
    }
  };

  const handleSubmitDeposit = async (e) => {
    e.preventDefault();
    const numAmount = Number(depositAmount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      toast.error("Please enter a valid deposit amount");
      return;
    }

    if (depositMethod === "BANK_UPI") {
      if (!utr.trim()) {
        toast.error("Please enter the UTR or UPI Reference Number");
        return;
      }
      if (!proofFile) {
        toast.error("Please upload payment receipt screenshot");
        return;
      }
    } else {
      if (!receiptNumber.trim()) {
        toast.error("Please enter the branch receipt number");
        return;
      }
      if (!receivedBy.trim()) {
        toast.error("Please enter the receiving officer name/ID");
        return;
      }
    }

    try {
      setActionLoading(true);
      const formData = new FormData();
      formData.append("method", depositMethod);
      formData.append("amount", String(numAmount));
      if (depositMethod === "BANK_UPI") {
        formData.append("utr", utr.trim().toUpperCase());
        if (proofFile) formData.append("proof", proofFile);
      } else {
        formData.append("receiptNumber", receiptNumber.trim().toUpperCase());
        formData.append("receivedBy", receivedBy.trim());
        if (proofFile) formData.append("proof", proofFile);
      }

      const res = await deliveryApi.submitCashDeposit(formData);
      toast.success(res.data?.message || "Deposit submitted for admin verification!");
      setShowDepositModal(false);
      setDepositAmount("");
      setUtr("");
      setReceiptNumber("");
      setReceivedBy("");
      setProofFile(null);
      setProofPreview(null);
      await fetchOverview(true);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to submit deposit");
    } finally {
      setActionLoading(false);
    }
  };

  const activeShift = overview?.activeShift || null;
  const currentSummary = overview?.currentSummary || null;
  const limits = overview?.limits || {
    limit: 5000,
    pendingCash: 0,
    overduePending: 0,
    nearLimit: false,
    overLimit: false,
    blocked: false,
  };
  const deposits = overview?.deposits || [];
  const pastShifts = overview?.shifts || [];

  const pendingCash = Number(limits.pendingCash || 0);
  const holdingLimit = Number(limits.limit || 5000);
  const limitPct = Math.min(100, Math.round((pendingCash / holdingLimit) * 100));

  return (
    <div className="bg-gray-50/50 min-h-screen pb-24">
      {/* Top Header */}
      <div className="bg-gradient-to-br from-[#09356E] via-[#0057B7] to-[#004494] pt-4 pb-8 px-4 text-white relative shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => navigate("/delivery/profile")}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-base font-bold">My Shifts & Cash Settlement</h1>
          <button
            onClick={() => fetchOverview(false)}
            disabled={loading}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition"
          >
            <RotateCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
        <p className="text-xs text-white/80 text-center max-w-xs mx-auto">
          Manage your duty shifts, track COD cash in hand, and submit bank/cash deposit proofs.
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-5 space-y-4">
        {/* 1. Active Shift Card */}
        <Card className="p-4 shadow-sm border border-gray-100 rounded-2xl bg-white">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  activeShift ? "bg-emerald-500 animate-pulse" : "bg-gray-300"
                }`}
              />
              <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                {activeShift ? "Active Shift" : "Shift Status"}
              </span>
            </div>
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                activeShift
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {activeShift ? "ON DUTY" : "OFF DUTY"}
            </span>
          </div>

          {activeShift ? (
            <div className="py-3 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">Shift ID:</span>
                <span className="font-mono font-bold text-gray-900">{activeShift.shiftId}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">Started At:</span>
                <span className="font-medium text-gray-800">
                  {formatTime(activeShift.startedAt)} · {formatDate(activeShift.startedAt)}
                </span>
              </div>
              {currentSummary?.totals && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50 text-center">
                  <div className="bg-blue-50/60 p-2 rounded-xl border border-blue-100">
                    <span className="text-[10px] text-blue-600 font-bold block uppercase">
                      Cash Collected
                    </span>
                    <span className="text-base font-black text-blue-950">
                      ₹{currentSummary.totals.totalCashCollected || 0}
                    </span>
                  </div>
                  <div className="bg-emerald-50/60 p-2 rounded-xl border border-emerald-100">
                    <span className="text-[10px] text-emerald-600 font-bold block uppercase">
                      Completed Orders
                    </span>
                    <span className="text-base font-black text-emerald-950">
                      {currentSummary.totals.completedOrders || 0}
                    </span>
                  </div>
                </div>
              )}

              <Button
                variant="outline"
                className="w-full mt-2 border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold py-2.5 rounded-xl"
                onClick={() => setShowEndShiftModal(true)}
                disabled={actionLoading}
              >
                End Shift (Clock Out)
              </Button>
            </div>
          ) : (
            <div className="py-4 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-[#0057B7] flex items-center justify-center mx-auto">
                <Clock size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">You are currently off duty</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                  Start your shift to begin accepting and delivering Cash on Delivery (COD) orders.
                </p>
              </div>
              <Button
                className="w-full bg-[#0057B7] hover:bg-[#004494] text-white font-bold text-xs py-3 rounded-xl shadow-md transition"
                onClick={handleStartShift}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <Loader2 size={16} className="animate-spin" /> Starting Shift...
                  </span>
                ) : (
                  "⚡ Start Shift Now"
                )}
              </Button>
            </div>
          )}
        </Card>

        {/* 2. Cash Holding & Limit Card */}
        <Card className="p-4 shadow-sm border border-gray-100 rounded-2xl bg-white space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Cash in Hand
            </span>
            <span className="text-xs font-semibold text-gray-500">
              Limit: ₹{holdingLimit}
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-black text-gray-900 tracking-tight">
              ₹{pendingCash}
            </div>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-sm"
              onClick={() => {
                setDepositAmount(pendingCash > 0 ? String(pendingCash) : "");
                setShowDepositModal(true);
              }}
            >
              Deposit Cash
            </Button>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  limitPct >= 100
                    ? "bg-red-500"
                    : limitPct >= 80
                    ? "bg-amber-500"
                    : "bg-[#0057B7]"
                }`}
                style={{ width: `${limitPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 font-medium">
              <span>{limitPct}% of limit reached</span>
              <span>₹{Math.max(0, holdingLimit - pendingCash)} remaining capacity</span>
            </div>
          </div>

          {/* Warning Notices */}
          {limits.blocked && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs text-red-800 font-medium leading-relaxed">
                <strong className="block">Cash Holding Limit Exceeded!</strong>
                You have overdue cash. New COD orders are blocked until you deposit your collected cash.
              </p>
            </div>
          )}

          {!limits.blocked && limits.nearLimit && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 font-medium leading-relaxed">
                <strong>Approaching limit:</strong> You are holding over 80% of your maximum cash limit. Deposit soon to keep receiving orders.
              </p>
            </div>
          )}

          {limits.override && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
              <ShieldCheck size={18} className="text-blue-600 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-800">
                <strong>Admin Override Active:</strong> COD orders allowed until{" "}
                {formatTime(limits.override.expiresAt)}.
                {limits.override.reason && (
                  <p className="text-[11px] text-blue-600 mt-0.5 italic">
                    Reason: {limits.override.reason}
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* 3. Recent Deposits */}
        <div className="space-y-2">
          <div className="flex justify-between items-center px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600">
              Recent Deposits
            </h3>
            <span className="text-[11px] text-gray-400 font-medium">
              {deposits.length} submission{deposits.length !== 1 ? "s" : ""}
            </span>
          </div>

          {deposits.length === 0 ? (
            <Card className="p-6 text-center rounded-2xl bg-white border border-gray-100">
              <FileText size={28} className="text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-500 font-medium">No deposit submissions yet</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {deposits.slice(0, 5).map((dep) => {
                const isApproved = dep.status === "APPROVED";
                const isRejected = dep.status === "REJECTED";
                const isPending = dep.status === "SUBMITTED" || dep.status === "APPROVING";

                return (
                  <Card
                    key={dep.depositId}
                    className="p-3.5 rounded-xl border border-gray-100 shadow-sm bg-white space-y-1.5"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-gray-800">
                          {dep.depositId}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {dep.method === "BANK_UPI" ? "Bank/UPI" : "Cash at Hub"}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isApproved
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : isRejected
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {isApproved
                          ? "APPROVED"
                          : isRejected
                          ? "REJECTED"
                          : "PENDING APPROVAL"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500">
                        {dep.method === "BANK_UPI"
                          ? `UTR: ${dep.utr || "-"}`
                          : `Receipt: ${dep.receiptNumber || "-"}`}
                      </span>
                      <span className="text-sm font-black text-gray-900">
                        ₹{dep.amount}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-gray-400 pt-1 border-t border-gray-50">
                      <span>Submitted: {formatDate(dep.submittedAt)}</span>
                      {dep.proofUrl && (
                        <a
                          href={dep.proofUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#0057B7] hover:underline font-bold"
                        >
                          View Proof
                        </a>
                      )}
                    </div>

                    {isRejected && dep.rejectionReason && (
                      <p className="text-[11px] text-red-600 bg-red-50 p-2 rounded-lg mt-1">
                        Reason: {dep.rejectionReason}
                      </p>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ────────────────── End Shift Confirmation Modal ────────────────── */}
      <AnimatePresence>
        {showEndShiftModal && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl"
            >
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
                <Clock size={24} />
              </div>
              <div className="text-center">
                <h3 className="text-base font-bold text-gray-900">End your current shift?</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Ending your shift will stop tracking orders under this shift ID. If you collected COD cash, you will be expected to deposit it.
                </p>
                {pendingCash > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 mt-3 text-xs text-amber-800 font-bold">
                    Pending cash to deposit: ₹{pendingCash}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowEndShiftModal(false)}
                  disabled={actionLoading}
                  className="rounded-xl text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleEndShift}
                  disabled={actionLoading}
                  className="bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold"
                >
                  {actionLoading ? "Ending..." : "Confirm & End"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ────────────────── Submit Deposit Modal ────────────────── */}
      <AnimatePresence>
        {showDepositModal && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white rounded-t-3xl sm:rounded-3xl p-5 max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900">Submit Cash Deposit</h3>
                <button
                  onClick={() => setShowDepositModal(false)}
                  className="text-gray-400 hover:text-gray-600 font-bold p-1 text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Method Toggle */}
              <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-xl">
                <button
                  type="button"
                  className={`py-2 text-xs font-bold rounded-lg transition ${
                    depositMethod === "BANK_UPI"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  onClick={() => setDepositMethod("BANK_UPI")}
                >
                  Bank / UPI Transfer
                </button>
                <button
                  type="button"
                  className={`py-2 text-xs font-bold rounded-lg transition ${
                    depositMethod === "PHYSICAL_CASH"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  onClick={() => setDepositMethod("PHYSICAL_CASH")}
                >
                  Cash at Hub / Office
                </button>
              </div>

              <form onSubmit={handleSubmitDeposit} className="space-y-3">
                {/* Deposit Amount */}
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Deposit Amount (₹) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="Enter amount deposited"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0057B7]"
                  />
                  {pendingCash > 0 && (
                    <button
                      type="button"
                      onClick={() => setDepositAmount(String(pendingCash))}
                      className="text-[11px] text-[#0057B7] hover:underline mt-1 font-semibold"
                    >
                      Fill total pending: ₹{pendingCash}
                    </button>
                  )}
                </div>

                {depositMethod === "BANK_UPI" ? (
                  <>
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">
                        UTR / Transaction Reference (6-30 chars) *
                      </label>
                      <input
                        type="text"
                        required
                        value={utr}
                        onChange={(e) => setUtr(e.target.value.toUpperCase())}
                        placeholder="e.g. 429302194830"
                        className="w-full px-3 py-2 text-sm font-mono uppercase border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0057B7]"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">
                        Upload Transfer Screenshot *
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl hover:border-[#0057B7] flex flex-col items-center justify-center text-gray-500 gap-1 transition"
                      >
                        <Upload size={18} className="text-gray-400" />
                        <span className="text-xs font-medium">
                          {proofFile ? proofFile.name : "Tap to upload screenshot (JPG, PNG, PDF)"}
                        </span>
                      </button>
                      {proofPreview && (
                        <div className="mt-2 relative w-20 h-20 rounded-lg overflow-hidden border">
                          <img
                            src={proofPreview}
                            alt="Receipt Preview"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">
                        Branch Cash Receipt Number *
                      </label>
                      <input
                        type="text"
                        required
                        value={receiptNumber}
                        onChange={(e) => setReceiptNumber(e.target.value.toUpperCase())}
                        placeholder="e.g. REC-2026-998"
                        className="w-full px-3 py-2 text-sm uppercase font-mono border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0057B7]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">
                        Received By (Manager / Officer Name or ID) *
                      </label>
                      <input
                        type="text"
                        required
                        value={receivedBy}
                        onChange={(e) => setReceivedBy(e.target.value)}
                        placeholder="e.g. Rahul Sharma (Hub Lead)"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0057B7]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">
                        Optional Physical Receipt Photo
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-2.5 border border-dashed border-gray-200 rounded-xl text-xs text-gray-500 hover:border-gray-400"
                      >
                        {proofFile ? proofFile.name : "Attach photo of physical receipt"}
                      </button>
                    </div>
                  </>
                )}

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={actionLoading}
                    className="w-full bg-[#0057B7] hover:bg-[#004494] text-white font-bold text-xs py-3 rounded-xl shadow-md"
                  >
                    {actionLoading ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <Loader2 size={16} className="animate-spin" /> Submitting Deposit...
                      </span>
                    ) : (
                      "Submit Deposit for Verification"
                    )}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ShiftsAndSettlement;
