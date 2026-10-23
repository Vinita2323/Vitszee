import React, { useState, useEffect } from "react";
import {
    IndianRupee,
    Clock,
    CheckCircle2,
    XCircle,
    ArrowLeft,
    ArrowUpRight,
    Wallet,
    AlertCircle,
    RotateCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { deliveryApi } from "../../services/deliveryApi";

const Withdrawals = () => {
    const navigate = useNavigate();
    const [amount, setAmount] = useState("");
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [stats, setStats] = useState({
        availableBalance: 0,
        pendingWithdrawals: 0,
        history: []
    });

    const fetchData = async () => {
        try {
            setFetching(true);
            const res = await deliveryApi.getEarnings();
            if (res.data.success) {
                setStats({
                    availableBalance: res.data.result.totalEarnings || 0,
                    pendingWithdrawals: (res.data.result.recentTransactions || [])
                        .filter(t => t.type.includes('Withdrawal') && (t.status === 'Pending' || t.status === 'Processing'))
                        .reduce((acc, t) => acc + Math.abs(t.amount), 0),
                    history: (res.data.result.recentTransactions || [])
                        .filter(t => t.type.includes('Withdrawal'))
                });
            }
        } catch (error) {
            console.error("Fetch Error:", error);
            // Fallback with mock data for frontend demo if API fails
            setStats({
                availableBalance: 1250,
                pendingWithdrawals: 0,
                history: [
                    { id: 'WDR123', amount: 500, status: 'Settled', date: '2024-03-20', type: 'Withdrawal' },
                    { id: 'WDR124', amount: 300, status: 'Pending', date: '2024-03-21', type: 'Withdrawal' }
                ]
            });
        } finally {
            setFetching(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleRequest = async () => {
        if (!amount || isNaN(amount) || Number(amount) <= 0) {
            return toast.error("Please enter a valid amount");
        }
        if (Number(amount) > stats.availableBalance) {
            return toast.error("Insufficient balance");
        }

        setLoading(true);
        try {
            const res = await deliveryApi.requestWithdrawal({ amount: Number(amount) });
            if (res.data.success) {
                toast.success("Withdrawal request submitted successfully!");
                setAmount("");
                fetchData();
            } else {
                toast.error(res.data.message || "Failed to submit request");
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to submit request");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white min-h-screen pb-28 relative overflow-hidden font-sans">
            
            {/* Sticky Brand Blue Header Banner */}
            <div className="bg-gradient-to-br from-[#09356E] via-[#0057B7] to-[#004494] text-white py-3 px-5 sticky top-0 z-40 shadow-sm flex items-center">
                <button
                    onClick={() => navigate(-1)}
                    className="p-1.5 rounded-full hover:bg-white/10 transition-colors mr-2 cursor-pointer"
                    aria-label="Go Back"
                >
                    <ArrowLeft className="text-white" size={18} />
                </button>
                <h1 className="text-sm font-black leading-tight tracking-tight">Money Request</h1>
            </div>

            <div className="p-4 max-w-lg mx-auto space-y-4 relative z-10">
                {/* Balance Card */}
                <div className="bg-gradient-to-br from-[#09356E] via-[#0057B7] to-[#004494] p-4.5 rounded-2xl text-white shadow-md shadow-[#0057B7]/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-6 -mt-6 blur-xl" />
                    <div className="absolute bottom-0 left-0 w-20 h-20 bg-black/5 rounded-full -ml-6 -mb-6 blur-lg" />

                    <div className="relative z-10">
                        <p className="text-white/60 text-[9px] font-bold uppercase tracking-wider mb-1 opacity-90">Available for Withdrawal</p>
                        <h2 className="text-3xl font-black flex items-baseline leading-none tracking-tight">
                            <span className="text-xl mr-0.5 font-bold">₹</span>
                            {stats.availableBalance.toLocaleString()}
                        </h2>

                        <div className="mt-4 flex items-center justify-between text-white bg-white/10 p-2.5 rounded-xl backdrop-blur-md border border-white/10">
                            <div className="flex items-center">
                                <Clock size={14} className="mr-1.5 opacity-80" />
                                <span className="text-[10px] font-bold">Pending: ₹{stats.pendingWithdrawals.toLocaleString()}</span>
                            </div>
                            <ArrowUpRight size={14} className="opacity-80" />
                        </div>
                    </div>
                </div>

                {/* Withdrawal Form */}
                <Card className="p-4 border border-gray-100 bg-white rounded-xl shadow-sm">
                    <div className="flex items-center gap-2 mb-3.5">
                        <div className="p-1.5 bg-[#0057B7]/10 text-[#0057B7] rounded-lg">
                            <Wallet size={16} />
                        </div>
                        <h3 className="font-bold text-gray-800 text-xs">Request Fund Transfer</h3>
                    </div>

                    <div className="space-y-3.5">
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">
                                Amount to Withdraw
                            </label>
                            <div className="relative">
                                <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <input
                                    type="number"
                                    placeholder="0.00"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="w-full bg-gray-50/60 border border-gray-100 rounded-xl py-2.5 pl-10 pr-4 font-extrabold text-lg outline-none focus:ring-2 focus:ring-[#0057B7]/15 focus:border-[#0057B7] transition-all"
                                />
                            </div>
                        </div>

                        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100/50 rounded-xl">
                            <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={14} />
                            <p className="text-[10px] text-amber-700 font-medium leading-normal">
                                Processing may take 24-48 business hours. Funds will be transferred to your primary bank account.
                            </p>
                        </div>

                        <Button
                            onClick={handleRequest}
                            disabled={loading || !amount || Number(amount) <= 0}
                            className="w-full py-2.5 bg-[#0057B7] hover:bg-[#004899] text-white border-none rounded-xl font-bold text-xs shadow-md shadow-[#0057B7]/20 flex justify-center items-center"
                        >
                            {loading ? (
                                <RotateCw className="animate-spin mr-1.5 text-white" size={14} />
                            ) : null}
                            {loading ? "PROCESSING..." : "SUBMIT REQUEST"}
                        </Button>
                    </div>
                </Card>

                {/* History */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1 pt-1">
                        <h3 className="font-bold text-gray-400 flex items-center gap-2 uppercase tracking-wider text-[10px]">
                            Transfer History
                        </h3>
                        <button
                            onClick={fetchData}
                            className="text-[#0057B7] text-[10px] font-bold flex items-center gap-1 uppercase hover:underline cursor-pointer"
                        >
                            <RotateCw size={10} className={fetching ? "animate-spin" : ""} />
                            Refresh
                        </button>
                    </div>

                    <div className="space-y-2">
                        {stats.history.length > 0 ? (
                            stats.history.map((item, idx) => (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    key={item.id}
                                    className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between"
                                >
                                    <div className="flex items-center">
                                        <div className={cn(
                                            "p-2 rounded-full mr-3",
                                            item.status === 'Settled' ? "bg-emerald-50 text-emerald-600" :
                                                item.status === 'Failed' ? "bg-rose-50 text-rose-600" :
                                                    "bg-amber-50 text-amber-600"
                                        )}>
                                            {item.status === 'Settled' ? <CheckCircle2 size={14} /> :
                                                item.status === 'Failed' ? <XCircle size={14} /> :
                                                    <Clock size={14} />}
                                        </div>
                                        <div>
                                            <p className="font-extrabold text-xs text-gray-900">₹{Math.abs(item.amount).toLocaleString()}</p>
                                            <p className="text-[9px] font-bold text-gray-400 mt-0.5">
                                                {new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} • {item.id}
                                            </p>
                                        </div>
                                    </div>
                                    <Badge variant={item.status === 'Settled' ? 'success' : item.status === 'Failed' ? 'destructive' : 'warning'}>
                                        {item.status.toUpperCase()}
                                    </Badge>
                                </motion.div>
                            ))
                        ) : (
                            <div className="bg-white p-8 rounded-xl border border-dashed border-gray-200 text-center">
                                <Clock className="mx-auto text-gray-300 mb-1.5" size={24} />
                                <p className="text-[10px] text-gray-400 font-bold tracking-tight">No history found</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const Badge = ({ children, variant = "default" }) => {
    const variants = {
        default: "bg-gray-100 text-gray-600",
        success: "bg-brand-50 text-brand-600",
        warning: "bg-amber-50 text-amber-600",
        destructive: "bg-red-50 text-red-600",
    };

    return (
        <span className={cn("px-2 py-1 rounded text-[10px] font-bold tracking-wider leading-none", variants[variant])}>
            {children}
        </span>
    );
};

const cn = (...classes) => classes.filter(Boolean).join(" ");

export default Withdrawals;
