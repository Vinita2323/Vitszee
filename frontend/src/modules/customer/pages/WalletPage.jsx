import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, ArrowDownLeft, ChevronLeft, Wallet, X } from 'lucide-react';
import { customerApi } from '../services/customerApi';
import { toast } from 'sonner';
import { onNotificationNew } from '@core/services/orderSocket';
import { useAuth } from '@core/context/AuthContext';

const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today) return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const WalletPage = () => {
    const navigate = useNavigate();
    const [balance, setBalance] = useState(0);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const { getToken } = useAuth();
    const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [withdrawMethod, setWithdrawMethod] = useState('UPI');
    const [withdrawDetails, setWithdrawDetails] = useState({ upiId: '', accountNumber: '', ifsc: '', accountName: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleWithdraw = async (e) => {
        e.preventDefault();
        const amount = Number(withdrawAmount);
        if (!amount || amount <= 0 || amount > balance) {
            toast.error('Invalid withdrawal amount');
            return;
        }

        let details = {};
        if (withdrawMethod === 'UPI') {
            if (!withdrawDetails.upiId) return toast.error('UPI ID is required');
            details = { upiId: withdrawDetails.upiId };
        } else {
            if (!withdrawDetails.accountNumber || !withdrawDetails.ifsc || !withdrawDetails.accountName) {
                return toast.error('All bank details are required');
            }
            details = {
                accountNumber: withdrawDetails.accountNumber,
                ifsc: withdrawDetails.ifsc,
                accountName: withdrawDetails.accountName,
            };
        }

        setIsSubmitting(true);
        try {
            await customerApi.requestWithdrawal({
                amount,
                method: withdrawMethod,
                details
            });
            toast.success('Withdrawal request submitted successfully');
            setIsWithdrawModalOpen(false);
            setWithdrawAmount('');
            setWithdrawDetails({ upiId: '', accountNumber: '', ifsc: '', accountName: '' });
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to submit withdrawal request');
        } finally {
            setIsSubmitting(false);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [profileRes, ordersRes] = await Promise.all([
                customerApi.getProfile(),
                customerApi.getMyOrders(),
            ]);
            const profile = profileRes.data?.result ?? profileRes.data?.data ?? profileRes.data;
            const rawOrders = ordersRes.data?.results ?? ordersRes.data?.result ?? [];
            const orders = Array.isArray(rawOrders) ? rawOrders : [];
            setBalance(profile?.walletBalance ?? 0);
            const walletOrders = orders.filter(
                (o) => (o.payment?.method || '').toLowerCase() === 'wallet'
            );
            const items = walletOrders.map((o) => ({
                _id: o._id,
                type: 'debit',
                title: 'Order Payment',
                amount: o.pricing?.total ?? o.payableAmount ?? 0,
                date: o.createdAt,
                orderId: o.orderId,
            }));
            setTransactions(items);
        } catch (err) {
            console.error('Wallet fetch error:', err);
            setBalance(0);
            setTransactions([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        
        const cleanupSocket = onNotificationNew(getToken, (data) => {
            if (data?.eventType === 'CUSTOMER_WALLET_CREDIT' || data?.eventType === 'CUSTOMER_WALLET_DEBIT') {
                fetchData();
            }
        });

        return () => {
            cleanupSocket();
        };
    }, [getToken]);

    return (
        <div className="min-h-screen bg-slate-50 pb-24 font-sans">
            <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-slate-200/60 mb-4 flex items-center gap-2">
                <button
                    onClick={() => navigate(-1)}
                    className="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 rounded-full transition-colors -ml-1"
                >
                    <ChevronLeft size={22} className="text-slate-800" />
                </button>
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Wallet</h1>
            </div>

            <div className="max-w-2xl mx-auto px-4 pt-1 relative z-20 space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Available Balance</p>
                    <h2 className="text-3xl font-semibold text-slate-900 mt-1">
                        {loading ? '...' : `₹${(balance || 0).toLocaleString('en-IN')}`}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Return refunds are credited here</p>
                    {balance > 0 && (
                        <button
                            onClick={() => setIsWithdrawModalOpen(true)}
                            className="mt-4 w-full bg-brand-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-brand-700 transition-colors"
                        >
                            Withdraw Balance
                        </button>
                    )}
                </div>

                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-base font-semibold text-slate-800">Transaction History</h3>
                        <Wallet size={18} className="text-slate-400" />
                    </div>

                    {loading ? (
                        <div className="py-12 flex justify-center text-slate-400 text-sm font-semibold">
                            Loading...
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center px-6">
                            <p className="text-sm font-semibold text-slate-500 mb-1">No wallet payments yet</p>
                            <p className="text-xs text-slate-400">
                                Orders paid using wallet will appear here.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {transactions.map((tx) => (
                                <div key={tx._id} className="px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${tx.type === 'credit' ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-700'}`}>
                                            {tx.type === 'credit' ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-slate-800 text-sm">{tx.title}</h4>
                                            <p className="text-[11px] text-slate-500">{formatDate(tx.date)}</p>
                                            {tx.orderId && (
                                                <p className="text-[10px] text-slate-500">#{tx.orderId}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className={`text-sm font-semibold ${tx.type === 'credit' ? 'text-brand-600' : 'text-slate-900'}`}>
                                        {tx.type === 'credit' ? '+' : '-'}₹{(tx.amount || 0).toLocaleString('en-IN')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Withdraw Modal */}
            {isWithdrawModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h3 className="font-semibold text-slate-800">Withdraw Balance</h3>
                            <button onClick={() => setIsWithdrawModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleWithdraw} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1.5">Withdrawal Amount (₹)</label>
                                <input
                                    type="number"
                                    value={withdrawAmount}
                                    onChange={(e) => setWithdrawAmount(e.target.value)}
                                    placeholder={`Max: ₹${balance}`}
                                    max={balance}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1.5">Withdrawal Method</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setWithdrawMethod('UPI')}
                                        className={`py-2 text-sm font-medium rounded-lg border ${withdrawMethod === 'UPI' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        UPI ID
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setWithdrawMethod('BANK_ACCOUNT')}
                                        className={`py-2 text-sm font-medium rounded-lg border ${withdrawMethod === 'BANK_ACCOUNT' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        Bank Account
                                    </button>
                                </div>
                            </div>

                            {withdrawMethod === 'UPI' ? (
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1.5">UPI ID</label>
                                    <input
                                        type="text"
                                        value={withdrawDetails.upiId}
                                        onChange={(e) => setWithdrawDetails({ ...withdrawDetails, upiId: e.target.value })}
                                        placeholder="e.g. 9876543210@ybl"
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                                        required={withdrawMethod === 'UPI'}
                                    />
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1.5">Account Holder Name</label>
                                        <input
                                            type="text"
                                            value={withdrawDetails.accountName}
                                            onChange={(e) => setWithdrawDetails({ ...withdrawDetails, accountName: e.target.value })}
                                            placeholder="Name as per bank"
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                                            required={withdrawMethod === 'BANK_ACCOUNT'}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1.5">Account Number</label>
                                        <input
                                            type="text"
                                            value={withdrawDetails.accountNumber}
                                            onChange={(e) => setWithdrawDetails({ ...withdrawDetails, accountNumber: e.target.value })}
                                            placeholder="Enter Account Number"
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                                            required={withdrawMethod === 'BANK_ACCOUNT'}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1.5">IFSC Code</label>
                                        <input
                                            type="text"
                                            value={withdrawDetails.ifsc}
                                            onChange={(e) => setWithdrawDetails({ ...withdrawDetails, ifsc: e.target.value })}
                                            placeholder="Enter IFSC Code"
                                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all uppercase"
                                            required={withdrawMethod === 'BANK_ACCOUNT'}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="pt-2">
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !withdrawAmount || Number(withdrawAmount) > balance}
                                    className="w-full bg-brand-600 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? 'Submitting...' : 'Submit Request'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WalletPage;
