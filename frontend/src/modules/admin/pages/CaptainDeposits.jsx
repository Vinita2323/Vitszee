import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Landmark, RotateCw, Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import Card from '@shared/components/ui/Card';
import { adminApi } from '../services/adminApi';

const STATUS_FILTERS = [
    ['', 'All statuses'],
    ['APPROVED', 'Paid / Verified'],
    ['PAYMENT_PENDING', 'Payment pending'],
    ['PAYMENT_FAILED', 'Payment failed'],
    ['SUBMITTED', 'Awaiting verification'],
    ['REJECTED', 'Rejected'],
];
const METHOD_FILTERS = [
    ['', 'All methods'],
    ['RAZORPAY', 'Razorpay (online)'],
    ['BANK_UPI', 'Bank / UPI'],
    ['PHYSICAL_CASH', 'Cash at Hub / Office'],
    ['ADMIN_ADJUSTMENT', 'Admin adjustment'],
];
const METHOD_LABEL = {
    RAZORPAY: 'Razorpay',
    BANK_UPI: 'Bank / UPI',
    PHYSICAL_CASH: 'Cash at Hub',
    ADMIN_ADJUSTMENT: 'Adjustment',
};

/** One status vocabulary for all methods: Pending / Paid-Verified / Failed. */
const statusUi = (d) => {
    const online = d.method === 'RAZORPAY';
    switch (d.status) {
        case 'APPROVED':
            return { label: online ? 'Paid · Verified' : 'Approved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
        case 'PARTIALLY_APPROVED':
            return { label: 'Partly verified', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
        case 'PAYMENT_FAILED':
            return { label: 'Failed', cls: 'bg-red-50 text-red-700 border-red-200' };
        case 'REJECTED':
            return { label: 'Rejected', cls: 'bg-red-50 text-red-700 border-red-200' };
        case 'PAYMENT_PENDING':
            return { label: 'Payment pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
        default:
            return { label: 'Awaiting verification', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
};

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmt = (iso) =>
    iso
        ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';

const CaptainDeposits = () => {
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState('');
    const [method, setMethod] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const limit = 20;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await adminApi.getCaptainDeposits({ page, limit, status: status || undefined, method: method || undefined });
            const r = res.data?.result || {};
            setRows(r.items || []);
            setTotal(r.total || 0);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Could not load captain deposits');
        } finally {
            setLoading(false);
        }
    }, [page, status, method]);

    useEffect(() => {
        load();
    }, [load]);

    const approve = async (d) => {
        if (!window.confirm(`Approve ${rupees(d.amount)} deposit from ${d.captain?.name || 'captain'}? This settles their cash orders.`)) return;
        setBusyId(d.id);
        try {
            await adminApi.approveCaptainDeposit(d.id, {});
            toast.success('Deposit approved');
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Could not approve');
        } finally {
            setBusyId(null);
        }
    };

    const reject = async (d) => {
        const reason = window.prompt('Reason for rejecting this deposit (shown to the captain):');
        if (!reason || reason.trim().length < 3) return;
        setBusyId(d.id);
        try {
            await adminApi.rejectCaptainDeposit(d.id, { reason: reason.trim() });
            toast.success('Deposit rejected');
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Could not reject');
        } finally {
            setBusyId(null);
        }
    };

    const needle = search.trim().toLowerCase();
    const visible = needle
        ? rows.filter((d) =>
              [d.captain?.name, d.captain?.phone, d.depositId, d.razorpayPaymentId, d.razorpayOrderId, d.shift?.shiftId]
                  .filter(Boolean)
                  .some((v) => String(v).toLowerCase().includes(needle)),
          )
        : rows;
    const pages = Math.max(1, Math.ceil(total / limit));

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                        <Landmark size={20} />
                    </div>
                    <div>
                        <h1 className="text-lg font-black text-gray-900 leading-tight">Captain Cash Deposits</h1>
                        <p className="text-xs text-gray-500">Online (Razorpay), bank/UPI and hub cash deposits from captains</p>
                    </div>
                </div>
                <button
                    onClick={load}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                >
                    <RotateCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            <Card className="p-3">
                <div className="flex flex-wrap gap-2">
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search captain, phone, payment ID, shift…"
                        className="flex-1 min-w-[220px] px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <select
                        value={status}
                        onChange={(e) => { setPage(1); setStatus(e.target.value); }}
                        className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
                    >
                        {STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <select
                        value={method}
                        onChange={(e) => { setPage(1); setMethod(e.target.value); }}
                        className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
                    >
                        {METHOD_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                </div>
            </Card>

            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
                            <tr>
                                <th className="text-left px-4 py-3">Captain</th>
                                <th className="text-left px-4 py-3">Shift</th>
                                <th className="text-right px-4 py-3">Amount</th>
                                <th className="text-left px-4 py-3">Method</th>
                                <th className="text-left px-4 py-3">Payment ID</th>
                                <th className="text-left px-4 py-3">Status</th>
                                <th className="text-left px-4 py-3">Date &amp; time</th>
                                <th className="text-right px-4 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                                        <Loader2 className="animate-spin inline" size={18} />
                                    </td>
                                </tr>
                            )}
                            {!loading && visible.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-10 text-center text-gray-400">No deposits found</td>
                                </tr>
                            )}
                            {!loading &&
                                visible.map((d) => {
                                    const ui = statusUi(d);
                                    const manualPending = d.status === 'SUBMITTED';
                                    return (
                                        <tr key={d.id} className="align-top hover:bg-gray-50/60">
                                            <td className="px-4 py-3">
                                                <p className="font-bold text-gray-900">{d.captain?.name || 'Unknown'}</p>
                                                <p className="text-xs text-gray-400">{d.captain?.phone || ''}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                {d.shift ? (
                                                    <>
                                                        <p className="font-mono text-xs font-bold text-gray-800">{d.shift.shiftId}</p>
                                                        <p className="text-[11px] text-gray-400">
                                                            {fmt(d.shift.startedAt)}{d.shift.endedAt ? ` → ${fmt(d.shift.endedAt)}` : ' (active)'}
                                                        </p>
                                                    </>
                                                ) : (
                                                    <span className="text-gray-400 text-xs">No shift</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right font-black text-gray-900">{rupees(d.amount)}</td>
                                            <td className="px-4 py-3 text-xs font-semibold text-gray-700">{METHOD_LABEL[d.method] || d.method}</td>
                                            <td className="px-4 py-3">
                                                {d.method === 'RAZORPAY' ? (
                                                    <>
                                                        <p className="font-mono text-xs text-gray-800 break-all">{d.razorpayPaymentId || '—'}</p>
                                                        <p className="font-mono text-[10px] text-gray-400 break-all">{d.razorpayOrderId || ''}</p>
                                                    </>
                                                ) : d.method === 'BANK_UPI' ? (
                                                    <p className="font-mono text-xs text-gray-800 break-all">
                                                        {d.utr || '—'}
                                                        {d.proofUrl && (
                                                            <a href={d.proofUrl} target="_blank" rel="noreferrer" className="ml-1 text-blue-600 inline-flex items-center">
                                                                <ExternalLink size={11} />
                                                            </a>
                                                        )}
                                                    </p>
                                                ) : (
                                                    <p className="font-mono text-xs text-gray-800">{d.receiptNumber || '—'}</p>
                                                )}
                                                <p className="font-mono text-[10px] text-gray-400">{d.depositId}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-block text-[11px] font-bold px-2 py-1 rounded-full border ${ui.cls}`}>{ui.label}</span>
                                                {d.failureReason && d.status === 'PAYMENT_FAILED' && (
                                                    <p className="text-[11px] text-red-600 mt-1 max-w-[180px]">{d.failureReason}</p>
                                                )}
                                                {d.rejectionReason && (
                                                    <p className="text-[11px] text-red-600 mt-1 max-w-[180px]">{d.rejectionReason}</p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                                                {fmt(d.paidAt || d.submittedAt)}
                                                {d.method === 'RAZORPAY' && d.paidAt && <p className="text-[10px] text-gray-400">paid</p>}
                                            </td>
                                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                                {manualPending ? (
                                                    <div className="inline-flex gap-1.5">
                                                        <button
                                                            disabled={busyId === d.id}
                                                            onClick={() => approve(d)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                                        >
                                                            <CheckCircle2 size={13} /> Approve
                                                        </button>
                                                        <button
                                                            disabled={busyId === d.id}
                                                            onClick={() => reject(d)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                                                        >
                                                            <XCircle size={13} /> Reject
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-gray-300">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                        </tbody>
                    </table>
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
                    <span>{total} deposits</span>
                    <div className="flex items-center gap-2">
                        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40">Prev</button>
                        <span>Page {page} / {pages}</span>
                        <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40">Next</button>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default CaptainDeposits;
