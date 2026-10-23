import React, { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { TrendingUp, ArrowUpRight, Download, Info, Building2, ArrowRight } from "lucide-react";
import Modal from "@/shared/components/ui/Modal";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { deliveryApi } from "../services/deliveryApi";

const RUPEE = "\u20B9";
const DOT = "\u2022";
const resolveTipAmount = (txn) =>
  Number(
    txn?.meta?.tipAmount ??
      txn?.order?.paymentBreakdown?.riderTipAmount ??
      txn?.order?.pricing?.tip ??
      0,
  );

const EarningsPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("today");
  const [loading, setLoading] = useState(true);
  const [earningsData, setEarningsData] = useState({
    totalEarnings: 0,
    incentives: 0,
    bonuses: 0,
    tipsReceived: 0,
    chartData: [],
    recentTransactions: [],
    balances: { availableBalance: 0, pendingBalance: 0 },
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBankDetails, setShowBankDetails] = useState(false);
  const [bankDetails, setBankDetails] = useState(null);
  const [viewProofImage, setViewProofImage] = useState(null);

  const fetchEarnings = async (timeframe = activeTab) => {
    try {
      setLoading(true);
      const response = await deliveryApi.getEarnings({ timeframe });
      if (response.data.success && response.data.result) {
        const result = response.data.result;
        setEarningsData({
          totalEarnings: result.totalEarnings || 0,
          incentives: result.incentives || 0,
          bonuses: result.bonuses || 0,
          tipsReceived: result.tipsReceived || 0,
          chartData: result.chartData || [],
          recentTransactions: result.transactions || result.recentTransactions || [],
          balances: result.balances || { availableBalance: 0, pendingBalance: 0 },
        });
      }
    } catch {
      toast.error("Failed to fetch earnings data");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitWithdrawal = async (e) => {
    e.preventDefault();
    const available = Number(earningsData.balances?.availableBalance || 0);

    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > available) {
        toast.error(`Please enter a valid amount within your available balance (₹${available}).`);
        return;
    }

    try {
        setIsSubmitting(true);
        const response = await deliveryApi.requestWithdrawal({ amount: parseFloat(withdrawAmount) });
        if (response.data.success) {
            toast.success('Withdrawal request submitted successfully!');
            setIsModalOpen(false);
            setWithdrawAmount('');
            fetchEarnings();
        }
    } catch (error) {
        toast.error(error.response?.data?.message || "Failed to submit request");
    } finally {
        setIsSubmitting(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const res = await deliveryApi.getProfile();
      if (res.data.success && res.data.result) {
        const { accountHolder, accountNumber, ifsc, name } = res.data.result;
        if (accountNumber) {
          setBankDetails({
            accountHolder: accountHolder || name || "N/A",
            accountNumber,
            ifsc: ifsc || "N/A"
          });
        }
      }
    } catch (error) {
      console.error("Failed to load bank details", error);
    }
  };

  React.useEffect(() => {
    fetchEarnings(activeTab);
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50/50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  const maxVal = Math.max(...(earningsData.chartData || []).map(d => (d.earnings || 0) + (d.incentives || 0)), 0);

  return (
    <div className="bg-white min-h-screen pb-28 relative overflow-hidden font-sans">
      
      {/* Brand Blue Header Banner */}
      <div className="bg-gradient-to-br from-[#09356E] via-[#0057B7] to-[#004494] text-white pt-4 pb-12 px-6 relative">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-lg font-black leading-tight tracking-tight">My Earnings</h1>
            <p className="text-[11px] text-white/70 font-medium mt-0.5">Track your commission & tips</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/delivery/cod-cash")}
              className="px-3 py-2 bg-orange-500 text-white font-bold text-xs rounded-full shadow-sm hover:bg-orange-600 transition-colors"
            >
              COD Cash
            </button>
            {/* Wallet / withdraw temporarily disabled
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2.5 bg-white text-[#0057B7] font-bold text-xs rounded-full shadow-sm hover:bg-gray-100 transition-colors"
            >
              Withdraw Funds
            </button>
            */}
            <button
              onClick={() => toast.success("Downloading earnings report...")}
              className="p-2.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full transition-colors cursor-pointer"
              aria-label="Download Report"
            >
              <Download size={18} className="text-white" />
            </button>
          </div>
        </div>

      {/* Payment Proof Modal */}
      {viewProofImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4" onClick={() => setViewProofImage(null)}>
          <div className="relative w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => setViewProofImage(null)}
              className="absolute -top-12 right-0 p-2 text-white hover:text-gray-300"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
            <img src={viewProofImage} alt="Payment Proof" className="w-full h-auto rounded-xl shadow-2xl bg-white" />
          </div>
        </div>
      )}

    </div>

      {/* Main Content Area overlapping with rounded corners */}
      <div className="bg-white rounded-t-[32px] -mt-5 pt-4 px-5 space-y-4 relative z-10">
        
        {/* Tabs */}
        <div className="flex bg-gray-100/80 p-1 rounded-xl">
          {["today", "weekly", "monthly"].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all capitalize ${
                activeTab === tab
                  ? "bg-white text-[#0057B7] shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Total Earnings Card */}
        <motion.div variants={itemVariants} className="w-full">
          <div className="bg-gradient-to-br from-[#09356E] via-[#0057B7] to-[#004494] rounded-2xl p-3.5 text-white shadow-md shadow-[#0057B7]/20 relative overflow-hidden">
            {/* Background patterns */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-6 -mt-6 blur-xl" />
            <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full -ml-6 -mb-6 blur-lg" />

            <p className="text-white/60 font-bold text-[9px] uppercase tracking-wider mb-0.5 relative z-10">
              Total Earnings
            </p>
            <div className="flex items-baseline mb-2 relative z-10">
              <span className="text-xl font-bold mr-0.5">{RUPEE}</span>
              <span className="text-3xl font-black tracking-tight">
                {Number(earningsData.totalEarnings || 0).toLocaleString()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-white/10 relative z-10">
              <div>
                <p className="text-white/55 text-[9px] font-bold uppercase tracking-wide">Incentives</p>
                <p className="font-extrabold text-sm mt-0.5">
                  +{RUPEE}
                  {Number(earningsData.incentives || 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-white/55 text-[9px] font-bold uppercase tracking-wide">Tips</p>
                <p className="font-extrabold text-sm mt-0.5">
                  +{RUPEE}
                  {Number(earningsData.tipsReceived || 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Chart */}
        <motion.div variants={itemVariants}>
          <Card className="p-3.5 rounded-xl shadow-sm border border-gray-100 bg-white">
            <div className="flex justify-between items-center mb-2.5">
              <h3 className="font-bold text-gray-800 text-xs flex items-center">
                <TrendingUp size={16} className="mr-1.5 text-[#0057B7]" />
                Earnings Trend
              </h3>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-gray-400 hover:text-gray-600">
                Last 7 Days
              </Button>
            </div>
            <div className="h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={earningsData.chartData} barSize={16} margin={{ bottom: -5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <YAxis domain={[0, maxVal > 0 ? 'auto' : 1000]} hide={true} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: "#9ca3af" }}
                    dy={5}
                  />
                  <Tooltip
                    cursor={{ fill: "#fdfdfd" }}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "none",
                      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
                      fontSize: "10px",
                    }}
                  />
                  <Bar dataKey="earnings" fill="#0057B7" radius={[3, 3, 0, 0]} stackId="a" />
                  <Bar dataKey="incentives" fill="#93c5fd" radius={[3, 3, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>

        {/* Recent Transactions */}
        <motion.div variants={itemVariants}>
          <Card className="overflow-hidden border border-gray-100 rounded-xl shadow-sm bg-white">
            <div className="p-3 px-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/40">
              <h3 className="font-bold text-gray-800 text-xs">Recent Earnings</h3>
              <Button variant="link" className="text-[#0057B7] text-[11px] font-bold h-auto p-0 hover:underline">
                View All
              </Button>
            </div>
            <div className="divide-y divide-gray-100">
              {Array.isArray(earningsData.recentTransactions) && earningsData.recentTransactions.length > 0 ? (
                earningsData.recentTransactions.map((txn, idx) => (
                  <div
                    key={txn._id || txn.id || `txn-${idx}`}
                    className="p-3 px-4 flex justify-between items-center hover:bg-gray-50/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center">
                      <div
                        className={`p-1.5 rounded-full mr-2.5 ${
                          txn.status === "Settled" || txn.status === "Completed"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-yellow-50 text-yellow-600"
                        }`}
                      >
                        <ArrowUpRight size={14} />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-xs text-gray-900">
                          {txn.reference && String(txn.reference).startsWith("RET-DEL-") ? "Return Earning" : txn.type}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {(() => {
                            const dateStr = txn.date || txn.createdAt;
                            if (!dateStr) return "N/A";
                            const d = new Date(dateStr);
                            return isNaN(d.getTime()) ? txn.date : d.toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true
                            });
                          })()}{" "}
                          {DOT}{" "}
                          {txn.id ||
                            (txn._id ? txn._id.toString().slice(-6).toUpperCase() : "N/A")}
                        </p>
                        {resolveTipAmount(txn) > 0 && (
                          <p className="text-[9px] font-bold text-pink-600 mt-0.5">
                            Includes tip: {RUPEE}{resolveTipAmount(txn).toLocaleString()}
                          </p>
                        )}
                        {txn.type === 'Withdrawal' && txn.status === 'Settled' && txn.meta?.paymentProofUrl && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setViewProofImage(txn.meta.paymentProofUrl); }}
                            className="mt-1 text-[10px] font-bold text-brand-600 flex items-center hover:underline"
                          >
                            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                            View Proof
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-xs text-gray-900">
                        {String(txn.type || "").includes("Withdrawal") ? "-" : "+"}
                        {RUPEE}
                        {Number(txn.amount || 0).toLocaleString()}
                      </p>
                      <p
                        className={`text-[9px] font-bold ${
                          txn.status === "Settled" || txn.status === "Completed"
                            ? "text-emerald-600"
                            : "text-yellow-600"
                        }`}
                      >
                        {txn.status}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-gray-400 text-xs italic">
                  No recent earnings or withdrawals.
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Request Modal */}
      <Modal
          isOpen={isModalOpen}
          onClose={() => !isSubmitting && setIsModalOpen(false)}
          title="Request Withdrawal"
      >
          <form onSubmit={handleSubmitWithdrawal} className="space-y-6 py-4">
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex items-center justify-between">
                  <div>
                      <p className="text-xs font-black text-slate-600 uppercase tracking-widest mb-1">Available to Withdraw</p>
                      <h4 className="text-2xl font-black text-brand-600">{RUPEE}{Number(earningsData.balances?.availableBalance || 0).toLocaleString()}</h4>
                  </div>
                  <div className="h-12 w-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                      <Info className="h-6 w-6 text-slate-300" />
                  </div>
              </div>

              <div className="space-y-4">
                  <div>
                      <label className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2 block ml-1">Enter Amount</label>
                      <div className="relative group">
                          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-300 group-focus-within:text-brand-500 transition-colors">{RUPEE}</span>
                          <input
                              type="number"
                              value={withdrawAmount}
                              onChange={(e) => setWithdrawAmount(e.target.value)}
                              placeholder="0.00"
                              className="w-full pl-12 pr-6 py-4 bg-white ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 rounded-2xl text-xl font-black outline-none transition-all placeholder:text-slate-200"
                          />
                      </div>
                  </div>

                  <div className="p-4 bg-brand-50/50 rounded-2xl border border-brand-100/50 space-y-3">
                      <p className="text-[10px] font-black text-brand-600 uppercase tracking-widest mb-1">Transfer Destination</p>
                      <div 
                          className="flex items-center gap-4 cursor-pointer"
                          onClick={() => setShowBankDetails(!showBankDetails)}
                      >
                          <div className="h-10 w-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                              <Building2 className="h-5 w-5 text-brand-400" />
                          </div>
                          <div className="flex-1">
                              <p className="text-xs font-black text-slate-900 uppercase">Bank Transfer</p>
                              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter">Registered Bank Account</p>
                          </div>
                          <ArrowRight className={`h-4 w-4 text-slate-300 transition-transform ${showBankDetails ? 'rotate-90' : ''}`} />
                      </div>
                      
                      {showBankDetails && (
                          <div className="mt-3 p-3 bg-white rounded-xl border border-brand-100 space-y-2">
                              {bankDetails ? (
                                  <>
                                      <div className="flex justify-between">
                                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Account Holder</span>
                                          <span className="text-[10px] text-slate-900 font-black">{bankDetails.accountHolder}</span>
                                      </div>
                                      <div className="flex justify-between">
                                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Account Number</span>
                                          <span className="text-[10px] text-slate-900 font-black">{bankDetails.accountNumber}</span>
                                      </div>
                                      <div className="flex justify-between">
                                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">IFSC</span>
                                          <span className="text-[10px] text-slate-900 font-black">{bankDetails.ifsc}</span>
                                      </div>
                                  </>
                              ) : (
                                  <p className="text-[10px] text-amber-600 font-bold text-center">No bank details added yet. Please add them in your profile.</p>
                              )}
                          </div>
                      )}
                  </div>
              </div>

              <div className="flex flex-col gap-3 pt-4">
                  <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-50 transition-all active:scale-95"
                  >
                      {isSubmitting ? <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : 'SUBMIT REQUEST'}
                  </button>
                  <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="w-full py-2 text-xs font-black text-slate-600 uppercase tracking-widest hover:text-slate-600 transition-colors"
                  >
                      Nevermind, keep funds
                  </button>
              </div>
          </form>
      </Modal>

    </div>
  );
};

export default EarningsPage;

