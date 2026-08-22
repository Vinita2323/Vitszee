import React from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import {
  TrendingUp,
  BarChart3,
  DollarSign,
  Download,
  Banknote,
  ArrowDownToLine,
  Building2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

import { MagicCard } from "@/components/ui/magic-card";
import { BlurFade } from "@/components/ui/blur-fade";
import ShimmerButton from "@/components/ui/shimmer-button";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { exportToCSV } from "@/lib/exportUtils";
import { useSellerEarnings } from "../context/SellerEarningsContext";
import { onNotificationNew } from '@core/services/orderSocket';
import { useAuth } from '@core/context/AuthContext';

const Earnings = () => {
  const navigate = useNavigate();
  const { earningsData: data, earningsLoading: loading, refreshEarnings } = useSellerEarnings();
  const [withdrawAmount, setWithdrawAmount] = React.useState("");
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = React.useState(false);
  const [isWithdrawing, setIsWithdrawing] = React.useState(false);
  const [selectedTxn, setSelectedTxn] = React.useState(null);

  const { getToken } = useAuth();

  React.useEffect(() => {
    if (data?.balances != null && withdrawAmount === "") {
      const settled = Number(data.balances?.availableBalance ?? 0);
      setWithdrawAmount(settled > 0 ? String(settled) : "");
    }
  }, [data?.balances]);

  React.useEffect(() => {
    const cleanupSocket = onNotificationNew(getToken, (payload) => {
        if (
            payload?.eventType?.includes('WALLET_CREDIT') || 
            payload?.eventType?.includes('WALLET_DEBIT') || 
            payload?.eventType === 'ORDER_DELIVERED'
        ) {
            refreshEarnings();
        }
    });
    return cleanupSocket;
  }, [getToken, refreshEarnings]);

  const handleWithdraw = () => {
    const totalBalance = Number(data?.balances?.availableBalance ?? 0);
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0 || amount > totalBalance) {
      alert(
        "Please enter a valid amount between ₹0.01 and ₹" +
        totalBalance.toLocaleString(),
      );
      return;
    }

    setIsWithdrawing(true);
    setTimeout(() => {
      setIsWithdrawing(false);
      setIsWithdrawModalOpen(false);
      alert(
        `Withdrawal request of ₹${amount.toLocaleString()} submitted successfully!`,
      );
    }, 1500);
  };

  const exportReport = () => {
    alert("Exporting monthly earnings report as PDF (Simulation)");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen font-semibold text-slate-500">LOADING EARNINGS...</div>;
  }
  return (
    <div className="space-y-8 pb-16">
      <BlurFade delay={0.1}>
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800 hidden md:block">
            Earnings Overview
          </h2>
          <div className="flex space-x-3">
            <Button
              onClick={() => {
                const ledger = Array.isArray(data?.ledger) ? data.ledger : [];
                if (ledger.length === 0) {
                  toast.info("No transactions to export.");
                  return;
                }
                const exportData = ledger.map((txn) => ({
                  id: txn.id ?? txn.ref ?? "",
                  type: txn.type ?? "",
                  amount: `₹${Number(txn.amount ?? 0).toLocaleString()}`,
                  status: txn.status ?? "",
                  date: txn.time ? `${txn.date} • ${txn.time}` : (txn.date || ""),
                  customer: txn.customer ?? "",
                  ref: txn.ref ?? "",
                }));
                exportToCSV(exportData, "Seller_Earnings_Report", {
                  id: "Transaction ID",
                  type: "Type",
                  amount: "Amount",
                  status: "Status",
                  date: "Date",
                  customer: "Customer",
                  ref: "Reference",
                });
                toast.success("Earnings report downloaded successfully!");
              }}
              variant="outline"
              className="border-gray-200 text-slate-600 text-xs font-semibold">
              <Download className="mr-2 h-4 w-4" />
              Download Report
            </Button>
            <ShimmerButton
              onClick={() => navigate("/seller/withdrawals")}
              background="#1A8CFF"
              className="px-6 py-2 rounded-xl text-xs font-bold text-white shadow-lg">
              <span className="text-white">Withdraw Funds</span>
            </ShimmerButton>
          </div>
        </div>
      </BlurFade>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-[850px]">
        <BlurFade delay={0.2}>
          <Card className="bg-gradient-to-br from-[#1A8CFF] to-[#0066d6] text-white border-none shadow-lg h-full p-4 relative overflow-hidden rounded-xl">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-blue-100 text-[10px] font-semibold uppercase tracking-wider">Total Revenue</p>
                <h3 className="text-2xl font-bold mt-1">₹{Number(data?.balances?.totalRevenue ?? 0).toLocaleString()}</h3>
              </div>
              <div className="p-2 bg-white/10 rounded-full h-9 w-9 flex items-center justify-center shrink-0">
                <DollarSign className="h-4.5 w-4.5 text-white" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-blue-100 bg-white/10 w-fit px-2.5 py-0.5 rounded-full text-[10px] font-semibold">
              <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
              <span>Real-time earnings data</span>
            </div>
          </Card>
        </BlurFade>

        <BlurFade delay={0.3}>
          <Card className="h-full border-none shadow-sm ring-1 ring-slate-100 bg-white p-4 flex flex-col justify-between group hover:shadow-md transition-all duration-300 rounded-xl">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                  Total Withdrawn
                </p>
                <h2 className="text-2xl font-bold text-slate-800 leading-tight">
                  ₹{Number(data?.balances?.totalWithdrawn ?? 0).toLocaleString()}
                </h2>
              </div>
              <div className="p-2 bg-blue-50 rounded-full h-9 w-9 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300">
                <Banknote className="h-4.5 w-4.5 text-[#1A8CFF]" />
              </div>
            </div>
            <div className="mt-4 border-t border-slate-50 pt-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-semibold text-xs">
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-none">
                    Available to Withdraw
                  </p>
                  <p className="text-xs font-bold text-slate-800 mt-1 leading-none">
                    ₹{Number(data?.balances?.availableBalance ?? 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </BlurFade>
      </div>

      <BlurFade delay={0.4}>
        <Card className="p-6 border-none shadow-sm ring-1 ring-slate-100 bg-white rounded-xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[#1A8CFF]" />
              Monthly Revenue Performance
            </h3>
          </div>
          <div className="h-[300px] w-full min-h-[200px] flex items-center justify-center">
            {(Array.isArray(data?.monthlyChart) ? data.monthlyChart : []).length === 0 ? (
              <p className="text-slate-500 text-sm font-medium">No monthly revenue data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthlyChart}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 600 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 600 }}
                    tickFormatter={(value) => `₹${value}`}
                  />
                  <Tooltip
                    cursor={{ fill: "#f8fafc" }}
                    contentStyle={{
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                      fontSize: "12px",
                      fontWeight: "600",
                    }}
                    formatter={(value) => [`₹${value.toLocaleString()}`, "Revenue"]}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="url(#colorRevenue)"
                    radius={[6, 6, 0, 0]}
                    barSize={40}
                  />
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1A8CFF" stopOpacity={1} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </BlurFade>

      <BlurFade delay={0.5}>
        <Card className="p-6 border-none shadow-sm ring-1 ring-slate-100 bg-white rounded-xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Banknote className="h-5 w-5 text-[#1A8CFF]" />
              Transaction History
            </h3>
          </div>
          <div className="overflow-x-auto">
            {(!data?.ledger || data.ledger.length === 0) ? (
              <p className="text-slate-500 text-sm font-medium text-center py-4">No transactions found.</p>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date & Time</th>
                    <th className="py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order / Ref</th>
                    <th className="py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                    <th className="py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.ledger.map((txn, index) => (
                    <tr 
                      key={txn.id || index} 
                      className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedTxn(txn)}
                    >
                      <td className="py-4 text-sm text-slate-700 font-medium whitespace-nowrap">
                        {txn.time ? `${txn.date} • ${txn.time}` : (txn.date || "-")}
                      </td>
                      <td className="py-4 text-sm text-slate-700">
                        {txn.ref || txn.id || "-"}
                      </td>
                      <td className="py-4 text-sm">
                        <span className="capitalize text-slate-600">{txn.type?.toLowerCase().replace(/_/g, " ") || "-"}</span>
                      </td>
                      <td className="py-4 text-sm font-bold text-slate-900">
                        ₹{Number(txn.amount || 0).toLocaleString()}
                      </td>
                      <td className="py-4 text-sm">
                        <Badge
                          variant="outline"
                          className={cn(
                            "uppercase text-[10px] tracking-wider",
                            txn.status === "completed" || txn.status === "SUCCESS" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            txn.status === "pending" || txn.status === "PENDING" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            "bg-slate-50 text-slate-700 border-slate-200"
                          )}
                        >
                          {txn.status || "Completed"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </BlurFade>

      {/* Withdrawal Modal */}
      <AnimatePresence>
        {isWithdrawModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md relative z-10 bg-white rounded-lg shadow-2xl overflow-hidden p-8 text-center">
              <div className="h-16 w-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                <Banknote className="h-8 w-8 text-[#1A8CFF]" />
              </div>

              <h2 className="text-xl font-bold text-slate-800 mb-2">
                Withdraw Funds
              </h2>
              <p className="text-sm text-slate-500 font-medium mb-8">
                Available Balance:{" "}
                <span className="text-[#1A8CFF] font-bold">
                  ₹{Number(data?.balances?.availableBalance ?? 0).toLocaleString()}
                </span>
              </p>

              <div className="space-y-4 text-left">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">
                      ₹
                    </span>
                    <input
                      type="number"
                      className="w-full pl-8 pr-4 py-3 rounded-lg border-slate-200 bg-slate-50 font-bold text-slate-900 focus:ring-2 focus:ring-[#1A8CFF]/10 focus:border-[#1A8CFF] transition-all outline-none"
                      placeholder="0.00"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    Select Bank Account
                  </label>
                  <div className="p-4 border border-slate-200 rounded-lg flex items-center gap-4 cursor-pointer hover:border-[#1A8CFF] hover:bg-blue-50/10 transition-all group">
                    <div className="h-10 w-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 group-hover:bg-blue-100 group-hover:text-[#1A8CFF] transition-colors">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">
                        {data?.bankDetails?.bankName || 'No Bank Added'}
                      </p>
                      <div className="flex flex-col gap-0.5 mt-1">
                        {data?.bankDetails?.accountNumber ? (
                          <>
                            <p className="text-xs text-slate-500 font-medium">
                              A/C: {data.bankDetails.accountNumber}
                            </p>
                            <p className="text-xs text-slate-500 font-medium">
                              IFSC: {data.bankDetails.ifscCode || 'N/A'}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-slate-500 font-medium">
                            Add bank details in profile
                          </p>
                        )}
                        {data?.bankDetails?.accountHolderName && (
                          <p className="text-[10px] text-slate-400 font-medium uppercase">
                            NAME: {data.bankDetails.accountHolderName}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="h-5 w-5 rounded-full border-2 border-slate-200 group-hover:border-[#1A8CFF] group-hover:bg-[#1A8CFF] transition-all"></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-8">
                <button
                  onClick={() => setIsWithdrawModalOpen(false)}
                  className="py-3 rounded-lg font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
                  CANCEL
                </button>
                <button
                  onClick={() => {
                    setIsWithdrawModalOpen(false);
                    alert("Withdrawal request submitted!");
                  }}
                  className="py-3 rounded-lg bg-[#1A8CFF] hover:bg-[#1177db] text-white font-bold shadow-lg shadow-[#1A8CFF]/10 hover:shadow-[#1A8CFF]/20 transition-all">
                  CONFIRM
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transaction Details Modal */}
      <AnimatePresence>
        {selectedTxn && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectedTxn(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md relative z-10 bg-white rounded-xl shadow-2xl overflow-hidden p-6 text-left">
              
              <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                <h2 className="text-xl font-bold text-slate-800">
                  Transaction Details
                </h2>
                <button onClick={() => setSelectedTxn(null)} className="text-slate-400 hover:text-slate-600 transition-colors p-1 bg-slate-100 hover:bg-slate-200 rounded-full">
                   <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
              
              <div className="space-y-4">
                 <div className="flex flex-col gap-2 bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <div className="flex justify-between items-center">
                       <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Amount</span>
                       <span className="text-2xl font-bold text-[#1A8CFF]">₹{Number(selectedTxn.amount || 0).toLocaleString()}</span>
                    </div>
                    {selectedTxn.type === 'Order Payment' && selectedTxn.productSubtotal > 0 && (
                       <div className="mt-2 pt-2 border-t border-slate-200 space-y-1">
                          <div className="flex justify-between items-center">
                             <span className="text-xs font-medium text-slate-500">Gross Product Sales</span>
                             <span className="text-sm font-semibold text-slate-700">₹{Number(selectedTxn.productSubtotal || 0).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center">
                             <span className="text-xs font-medium text-rose-500">Platform Commission</span>
                             <span className="text-sm font-semibold text-rose-600">- ₹{Number(selectedTxn.commission || 0).toLocaleString()}</span>
                          </div>
                       </div>
                    )}
                 </div>
                 
                 {selectedTxn.items && selectedTxn.items.length > 0 && (
                   <div className="mt-4">
                     <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-3">
                       Items Ordered ({selectedTxn.items.length})
                     </h4>
                     <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
                       {selectedTxn.items.map((item, idx) => (
                         <div
                           key={idx}
                           className="flex items-center justify-between p-3 bg-white ring-1 ring-slate-100 rounded-2xl group hover:shadow-md transition-all"
                         >
                           <div className="flex items-center gap-4">
                             <div className="h-12 w-12 rounded-xl overflow-hidden bg-slate-50 ring-1 ring-slate-200">
                               {item.image ? (
                                 <img
                                   src={item.image}
                                   alt={item.name}
                                   className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500"
                                 />
                               ) : (
                                 <div className="h-full w-full flex items-center justify-center text-slate-600 text-xs font-bold">
                                   —
                                 </div>
                               )}
                             </div>
                             <div>
                               <p className="text-xs font-bold text-slate-900">
                                 {item.name}
                               </p>
                               <p className="text-[10px] font-semibold text-slate-600 mt-0.5">
                                 ₹{Number(item.price).toFixed(2)} × {item.quantity}
                               </p>
                             </div>
                           </div>
                           <div className="text-right">
                             <p className="text-xs font-black text-slate-900">
                               ₹{(item.price * item.quantity).toFixed(2)}
                             </p>
                           </div>
                         </div>
                       ))}
                     </div>
                   </div>
                 )}
                 
                 <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Status</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "uppercase text-[10px] tracking-wider",
                            selectedTxn.status === "completed" || selectedTxn.status === "SUCCESS" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            selectedTxn.status === "pending" || selectedTxn.status === "PENDING" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            "bg-slate-50 text-slate-700 border-slate-200"
                          )}
                        >
                          {selectedTxn.status || "Completed"}
                        </Badge>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Date</p>
                        <p className="text-sm font-medium text-slate-800">{selectedTxn.date || (selectedTxn.createdAt ? new Date(selectedTxn.createdAt).toLocaleDateString() : "-")}</p>
                    </div>
                    <div className="col-span-2">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Type</p>
                        <p className="text-sm font-medium text-slate-800 capitalize">{selectedTxn.type?.toLowerCase().replace(/_/g, " ") || "-"}</p>
                    </div>
                    <div className="col-span-2">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Order / Reference ID</p>
                        <p className="text-sm font-mono bg-slate-100 p-2 rounded-md text-slate-800 break-all">{selectedTxn.ref || selectedTxn.id || "N/A"}</p>
                    </div>
                    {selectedTxn.customer && (
                        <div className="col-span-2">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Customer</p>
                            <p className="text-sm font-medium text-slate-700">{selectedTxn.customer}</p>
                        </div>
                    )}
                    {selectedTxn.description && (
                        <div className="col-span-2">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Description</p>
                            <p className="text-sm font-medium text-slate-700">{selectedTxn.description}</p>
                        </div>
                    )}
                 </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Earnings;
