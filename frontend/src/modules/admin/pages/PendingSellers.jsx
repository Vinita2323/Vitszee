import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import {
    HiOutlineBuildingOffice2,
    HiOutlineMagnifyingGlass,
    HiOutlineFunnel,
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineEye,
    HiOutlineEnvelope,
    HiOutlinePhone,
    HiOutlineDocumentText,
    HiOutlineMapPin,
    HiOutlineCalendarDays,
    HiOutlineClock,
    HiOutlineXMark,
    HiOutlineArrowPath,
    HiOutlineArrowTopRightOnSquare
} from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { adminApi } from '../services/adminApi';

const PendingSellers = () => {
    const navigate = useNavigate();
    const [pendingSellers, setPendingSellers] = useState([]);
    const [summaryStats, setSummaryStats] = useState({
        totalApplications: 0,
        receivedToday: 0,
        missingInfo: 0,
        avgReviewTimeHours: 24
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [viewingSeller, setViewingSeller] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const [previewDoc, setPreviewDoc] = useState(null);

    const fetchPendingSellers = async () => {
        setIsLoading(true);
        try {
            const response = await adminApi.getPendingSellers({ q: searchTerm || undefined });
            const payload = response.data.result || {};
            const items = Array.isArray(payload.items) ? payload.items : [];
            setPendingSellers(items);
            setSummaryStats({
                totalApplications: payload.stats?.totalApplications ?? items.length,
                receivedToday: payload.stats?.receivedToday ?? 0,
                missingInfo: payload.stats?.missingInfo ?? items.filter((s) => (s.documents || []).length < 3).length,
                avgReviewTimeHours: payload.stats?.avgReviewTimeHours ?? 24
            });
        } catch (error) {
            console.error('Failed to fetch pending sellers', error);
            toast.error(error.response?.data?.message || 'Failed to load seller applications');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchPendingSellers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (isReviewModalOpen || previewDoc) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isReviewModalOpen, previewDoc]);

    const stats = useMemo(() => ({
        total: summaryStats.totalApplications,
        today: summaryStats.receivedToday,
        urgent: summaryStats.missingInfo
    }), [summaryStats]);

    const filteredSellers = useMemo(() => {
        return pendingSellers.filter(s =>
            String(s.shopName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(s.ownerName || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [pendingSellers, searchTerm]);

    const reviewDocuments = useMemo(() => {
        if (!viewingSeller) {
            return [];
        }

        if (Array.isArray(viewingSeller.documentFiles) && viewingSeller.documentFiles.length) {
            return viewingSeller.documentFiles;
        }

        return (viewingSeller.documents || []).map((label, index) => ({
            key: `legacy-${index}`,
            label,
            url: '',
            fileName: label,
            isViewable: false,
            fileType: 'unknown'
        }));
    }, [viewingSeller]);

    const handleApprove = async (id) => {
        setIsProcessing(true);
        try {
            await adminApi.approveSeller(id);
            setIsReviewModalOpen(false);
            setViewingSeller(null);
            setPreviewDoc(null);
            toast.success('Seller approved successfully');
            await fetchPendingSellers();
        } catch (error) {
            console.error('Failed to approve seller', error);
            toast.error(error.response?.data?.message || 'Failed to approve seller');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReject = async (id) => {
        if (window.confirm('Are you sure you want to reject this application?')) {
            setIsProcessing(true);
            try {
                const reason = window.prompt('Optional rejection reason (leave blank if not needed):') || '';
                await adminApi.rejectSeller(id, { reason });
                setIsReviewModalOpen(false);
                setViewingSeller(null);
                setPreviewDoc(null);
                toast.success('Seller application rejected');
                await fetchPendingSellers();
            } catch (error) {
                console.error('Failed to reject seller', error);
                toast.error(error.response?.data?.message || 'Failed to reject seller');
            } finally {
                setIsProcessing(false);
            }
        }
    };

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-2 duration-700 pb-16 space-y-6">
            {/* Page Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 flex items-center gap-3">
                        Pending Approvals
                        <Badge variant="warning" className="text-xs px-2.5 py-0.5 font-bold animate-pulse">Action Required</Badge>
                    </h1>
                    <p className="text-sm font-medium text-slate-500 mt-1">Check new seller applications before they can start selling.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => fetchPendingSellers()}
                        className="flex items-center gap-2 px-3.5 py-2.5 bg-white ring-1 ring-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-xs cursor-pointer"
                        title="Refresh application list"
                    >
                        <HiOutlineArrowPath className={cn("h-4 w-4 text-slate-600", isLoading && "animate-spin")} />
                        <span>Refresh</span>
                    </button>
                    <div className="flex items-center gap-2.5 bg-amber-50 px-4 py-2.5 rounded-xl ring-1 ring-amber-200">
                        <HiOutlineClock className="h-5 w-5 text-amber-600" />
                        <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Avg Review Time: {summaryStats.avgReviewTimeHours}h</span>
                    </div>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="flex flex-wrap gap-3 items-center">
                {[
                    { label: 'Total Applications', val: stats.total, icon: HiOutlineDocumentText, color: 'text-brand-600', bg: 'bg-brand-50' },
                    { label: 'Received Today', val: stats.today, icon: HiOutlineCalendarDays, color: 'text-brand-600', bg: 'bg-brand-50' },
                    { label: 'Missing Info', val: stats.urgent, icon: HiOutlineXCircle, color: 'text-rose-600', bg: 'bg-rose-50' }
                ].map((stat, i) => (
                    <Card key={i} className="border-none shadow-xs ring-1 ring-slate-200/80 px-4 py-2.5 bg-white rounded-lg w-full sm:w-56 md:w-60 shrink-0">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 whitespace-nowrap">{stat.label}</p>
                                <h4 className="text-2xl font-black text-slate-900 mt-0.5">{stat.val}</h4>
                            </div>
                            <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", stat.bg, stat.color)}>
                                <stat.icon className="h-5 w-5" />
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Content Area */}
            <Card className="border-none shadow-xl ring-1 ring-slate-200/80 overflow-hidden rounded-xl bg-white">
                <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row gap-4 items-center justify-between bg-white">
                    <div className="relative flex-1 w-full max-w-md">
                        <HiOutlineMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by shop name or owner..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200/70 rounded-xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all placeholder:text-slate-400"
                        />
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2.5 bg-white ring-1 ring-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all">
                        <HiOutlineFunnel className="h-4 w-4 text-slate-500" />
                        <span>Filter by Date</span>
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-100">
                                <th className="text-xs uppercase tracking-wider font-bold text-slate-500 px-6 py-3.5">Applicant Store</th>
                                <th className="text-xs uppercase tracking-wider font-bold text-slate-500 px-6 py-3.5">Documentation</th>
                                <th className="text-xs uppercase tracking-wider font-bold text-slate-500 px-6 py-3.5">Applied On</th>
                                <th className="text-xs uppercase tracking-wider font-bold text-slate-500 px-6 py-3.5 !text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center justify-center gap-3">
                                             <HiOutlineArrowPath className="h-8 w-8 text-slate-400 animate-spin" />
                                            <p className="text-slate-600 font-bold text-base">Loading seller applications...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredSellers.length > 0 ? filteredSellers.map((s) => (
                                <tr key={s.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-6 py-4.5 align-middle">
                                        <div
                                            className="flex items-center gap-4 cursor-pointer group/name"
                                            onClick={() => navigate(`/admin/sellers/active/${s.id}`)}
                                        >
                                            <div className="h-11 w-11 rounded-xl overflow-hidden bg-slate-100 ring-2 ring-slate-100 group-hover:ring-primary/30 transition-all flex items-center justify-center shrink-0">
                                                <HiOutlineBuildingOffice2 className="h-6 w-6 text-slate-500" />
                                            </div>
                                            <div>
                                                <p className="text-base font-bold text-slate-900 group-hover/name:text-primary transition-colors">{s.shopName}</p>
                                                <p className="text-xs font-semibold text-slate-500">{s.ownerName}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4.5 align-middle">
                                        <div className="flex flex-wrap gap-1.5 items-center">
                                            {(s.documents || []).map((doc, idx) => (
                                                <span key={idx} className="px-2.5 py-1 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-md ring-1 ring-blue-100 uppercase">{doc}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4.5 align-middle">
                                        <div className="flex flex-col justify-center">
                                            <span className="text-sm font-bold text-slate-800">{s.applicationDate}</span>
                                            <span className="text-xs font-medium text-slate-400">Received {s.receivedAt || 'Recently'}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4.5 text-right align-middle">
                                        <div className="flex items-center justify-end gap-2.5 h-full">
                                            {s.documents && s.documents.length > 0 && (
                                                <button
                                                    onClick={() => handleApprove(s.id)}
                                                    className="h-9 w-9 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all ring-1 ring-emerald-200 cursor-pointer"
                                                    title="Quick Approve"
                                                >
                                                    <HiOutlineCheckCircle className="h-5 w-5" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleReject(s.id)}
                                                className="h-9 w-9 flex items-center justify-center rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white transition-all ring-1 ring-rose-200 cursor-pointer"
                                                title="Quick Reject"
                                            >
                                                <HiOutlineXCircle className="h-5 w-5" />
                                            </button>
                                            <div className="w-[1px] h-5 bg-slate-200 mx-1" />
                                            <button
                                                onClick={() => { setViewingSeller(s); setIsReviewModalOpen(true); }}
                                                className="h-9 px-4 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-primary transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                                            >
                                                <HiOutlineEye className="h-4 w-4" />
                                                REVIEW
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="4" className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                                <HiOutlineCheckCircle className="h-8 w-8 text-slate-300" />
                                            </div>
                                            <p className="text-slate-600 font-bold text-base">All caught up! No pending applications.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Review Modal */}
            <AnimatePresence>
                {isReviewModalOpen && viewingSeller && (
                    <div className="fixed inset-0 z-[100] overflow-y-auto">
                        <div className="min-h-full flex items-center justify-center p-4 lg:p-6">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm"
                                onClick={() => setIsReviewModalOpen(false)}
                            />

                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="w-full max-w-4xl relative z-10 bg-white rounded-2xl shadow-2xl overflow-hidden"
                            >
                                <div className="grid grid-cols-1 lg:grid-cols-12">
                                    {/* Sidebar Info */}
                                    <div className="lg:col-span-4 bg-slate-50 p-6 border-r border-slate-100 flex flex-col justify-between">
                                        <div>
                                            <div className="flex justify-between items-start mb-6">
                                                <div className="h-16 w-16 rounded-xl bg-primary text-white shadow-md flex items-center justify-center text-2xl font-extrabold">
                                                    {(viewingSeller.shopName || 'S').charAt(0)}
                                                </div>
                                                <button
                                                    onClick={() => setIsReviewModalOpen(false)}
                                                    className="lg:hidden p-2 hover:bg-slate-200 rounded-full"
                                                >
                                                    <HiOutlineXMark className="h-6 w-6" />
                                                </button>
                                            </div>

                                            <div className="space-y-6">
                                                <div>
                                                    <h3 className="text-2xl font-extrabold text-slate-900 leading-snug">{viewingSeller.shopName}</h3>
                                                    <p className="text-xs font-bold text-primary mt-1 uppercase tracking-wider">{viewingSeller.category || 'General'} PARTNER</p>
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-3">
                                                        <HiOutlineBuildingOffice2 className="h-5 w-5 text-slate-400 shrink-0" />
                                                        <span className="text-base font-bold text-slate-800">{viewingSeller.ownerName}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <HiOutlineEnvelope className="h-5 w-5 text-slate-400 shrink-0" />
                                                        <span className="text-sm font-semibold text-slate-700 break-all">{viewingSeller.email}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <HiOutlinePhone className="h-5 w-5 text-slate-400 shrink-0" />
                                                        <span className="text-base font-bold text-slate-800">{viewingSeller.phone}</span>
                                                    </div>
                                                    <div className="flex items-start gap-3">
                                                        <HiOutlineMapPin className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
                                                        <span className="text-sm font-semibold text-slate-700">{viewingSeller.location}</span>
                                                    </div>
                                                </div>

                                                <div className="pt-6 border-t border-slate-200">
                                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Application Memo</h4>
                                                    <p className="text-sm font-semibold text-slate-700 italic leading-relaxed">
                                                        "{viewingSeller.description}"
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Main Review Section */}
                                    <div className="lg:col-span-8 p-6 bg-white relative">
                                        <button
                                            onClick={() => setIsReviewModalOpen(false)}
                                            className="hidden lg:block absolute right-6 top-6 p-2 hover:bg-slate-100 rounded-full transition-colors"
                                        >
                                            <HiOutlineXMark className="h-6 w-6 text-slate-400" />
                                        </button>

                                        <div className="space-y-6">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <HiOutlineDocumentText className="h-6 w-6 text-primary" />
                                                    <h4 className="text-lg font-extrabold text-slate-900">Submitted Verification Documents</h4>
                                                </div>
                                                <p className="text-sm text-slate-600 font-medium">Check each document before final approval.</p>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {reviewDocuments.length > 0 ? reviewDocuments.map((doc) => (
                                                    <div
                                                        key={doc.key}
                                                        className={`p-4 rounded-xl border transition-all group ${doc.isViewable
                                                                ? 'border-slate-200 bg-slate-50 hover:bg-white hover:border-primary/40'
                                                                : 'border-slate-200 bg-slate-50/70'
                                                            }`}
                                                    >
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <div className="h-11 w-11 rounded-lg bg-white flex items-center justify-center shadow-xs shrink-0">
                                                                    <HiOutlineDocumentText className="h-6 w-6 text-primary" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-base font-bold text-slate-900">{doc.label}</p>
                                                                    <p className={`text-xs font-bold uppercase tracking-wide truncate ${doc.isViewable ? 'text-primary' : 'text-amber-600'
                                                                        }`}>
                                                                        {doc.isViewable
                                                                            ? doc.fileType === 'pdf'
                                                                                ? 'SECURE PDF'
                                                                                : 'SECURE IMAGE'
                                                                            : 'FILE LINK NOT AVAILABLE'}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {doc.isViewable ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPreviewDoc(doc)}
                                                                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-xs font-extrabold uppercase tracking-wider hover:bg-primary transition-colors shrink-0 shadow-xs cursor-pointer"
                                                                >
                                                                    <HiOutlineEye className="h-4 w-4" />
                                                                    <span>View</span>
                                                                </button>
                                                            ) : (
                                                                <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                                                                    <HiOutlineXMark className="h-4 w-4" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <div className="md:col-span-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                                                        <p className="text-base font-bold text-slate-500">No documents were submitted with this application.</p>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="bg-amber-50 rounded-xl p-5 border border-amber-200">
                                                <div className="flex gap-4 items-start">
                                                    <div className="h-10 w-10 rounded-full bg-amber-200 flex items-center justify-center shrink-0 mt-0.5">
                                                        <HiOutlineCheckCircle className="h-6 w-6 text-amber-800" />
                                                    </div>
                                                    <div>
                                                        <h5 className="text-base font-bold text-amber-950">Initial Review Passed</h5>
                                                        <p className="text-xs text-amber-900 font-semibold mt-1 leading-relaxed">
                                                            Our system automatically checked all basic identity and shop locations. You need to check documents manually now.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Action Bar */}
                                            <div className="flex items-center gap-3 pt-4">
                                                <button
                                                    disabled={isProcessing}
                                                    onClick={() => handleReject(viewingSeller.id)}
                                                    className="flex-1 py-4 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-800 rounded-xl text-sm font-extrabold tracking-wider transition-all uppercase cursor-pointer"
                                                >
                                                    REJECT APPLICATION
                                                </button>
                                                {reviewDocuments.length > 0 && (
                                                    <button
                                                        disabled={isProcessing}
                                                        onClick={() => handleApprove(viewingSeller.id)}
                                                        className="flex-[2] py-4 bg-slate-900 text-white rounded-xl text-sm font-extrabold tracking-wider shadow-lg hover:bg-primary transition-all uppercase flex items-center justify-center gap-2 cursor-pointer"
                                                    >
                                                        {isProcessing ? (
                                                            <>
                                                                <HiOutlineArrowPath className="h-5 w-5 animate-spin" />
                                                                <span>FINALIZING...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <HiOutlineCheckCircle className="h-5 w-5" />
                                                                <span>APPROVE SELLER</span>
                                                            </>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                )}
            </AnimatePresence>

            {/* In-App Document Preview Modal */}
            <AnimatePresence>
                {previewDoc && (
                    <div className="fixed inset-0 z-[120] overflow-y-auto">
                        <div className="min-h-full flex items-center justify-center p-4 lg:p-6">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
                                onClick={() => setPreviewDoc(null)}
                            />

                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="w-full max-w-4xl max-h-[92vh] relative z-10 bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-900"
                            >
                                {/* Header */}
                                <div className="p-4 px-6 border-b border-slate-100 flex items-center justify-between bg-white">
                                    <div className="flex items-center gap-3">
                                        <div className="h-9 w-9 rounded-xl bg-blue-50 text-brand-600 flex items-center justify-center shrink-0 ring-1 ring-blue-100">
                                            <HiOutlineDocumentText className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-bold text-slate-900 leading-tight">{previewDoc.label}</h3>
                                            <p className="text-xs font-semibold text-slate-500">{previewDoc.fileName || 'Submitted Document'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => window.open(previewDoc.url, '_blank', 'noopener,noreferrer')}
                                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 transition-colors cursor-pointer ring-1 ring-slate-200/60"
                                            title="Open full view in new tab"
                                        >
                                            <HiOutlineArrowTopRightOnSquare className="h-5 w-5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPreviewDoc(null)}
                                            className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-700 transition-colors cursor-pointer ring-1 ring-slate-200/60"
                                            title="Close preview"
                                        >
                                            <HiOutlineXMark className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Viewer Body */}
                                <div className="flex-1 bg-slate-50 flex items-center justify-center p-6 min-h-[400px] max-h-[75vh] overflow-auto">
                                    {previewDoc.fileType === 'pdf' || (previewDoc.url && previewDoc.url.toLowerCase().endsWith('.pdf')) ? (
                                        <iframe
                                            src={previewDoc.url}
                                            title={previewDoc.label}
                                            className="w-full h-[70vh] rounded-2xl bg-white border border-slate-200 shadow-sm"
                                        />
                                    ) : (
                                        <img
                                            src={previewDoc.url}
                                            alt={previewDoc.label}
                                            className="max-h-[70vh] max-w-full object-contain rounded-2xl shadow-md border border-slate-200 bg-white"
                                        />
                                    )}
                                </div>
                            </motion.div>
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PendingSellers;
