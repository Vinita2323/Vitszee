import React, { useState, useMemo } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import {
    Search,
    Filter,
    CheckCircle,
    XCircle,
    FileSearch,
    Phone,
    Mail,
    Truck,
    MapPin,
    Calendar,
    IdCard,
    RotateCw,
    Check,
    X,
    FileText,
    ExternalLink,
    Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { adminApi } from '../services/adminApi';

const extractDocumentList = (r) => {
    const list = [];
    const docs = r.documents || {};

    const aadharUrl = docs.aadhar || r.aadharUrl || r.aadhar;
    if (aadharUrl && typeof aadharUrl === 'string' && /^https?:\/\//i.test(aadharUrl)) {
        list.push({
            id: 'aadhar',
            label: 'Aadhar Card',
            type: 'Identity Proof',
            url: aadharUrl,
            number: r.aadharNumber || null
        });
    }

    const panUrl = docs.pan || r.panUrl || r.pan;
    if (panUrl && typeof panUrl === 'string' && /^https?:\/\//i.test(panUrl)) {
        list.push({
            id: 'pan',
            label: 'PAN Card',
            type: 'Tax Identification',
            url: panUrl,
            number: r.panNumber || null
        });
    }

    const dlUrl = docs.drivingLicense || docs.dl || r.drivingLicenseUrl || r.dlUrl;
    if (dlUrl && typeof dlUrl === 'string' && /^https?:\/\//i.test(dlUrl)) {
        list.push({
            id: 'drivingLicense',
            label: 'Driving License',
            type: 'Driving Permit',
            url: dlUrl,
            number: r.drivingLicenseNumber || null
        });
    }

    if (typeof docs === 'object' && docs !== null && !Array.isArray(docs)) {
        Object.entries(docs).forEach(([key, val]) => {
            if (!['aadhar', 'pan', 'drivingLicense', 'dl'].includes(key) && typeof val === 'string' && /^https?:\/\//i.test(val)) {
                list.push({
                    id: key,
                    label: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
                    type: 'Uploaded Document',
                    url: val
                });
            }
        });
    }

    return list;
};

const PendingDeliveryBoys = () => {
    const [pendingRiders, setPendingRiders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [viewingRider, setViewingRider] = useState(null);
    const [previewDoc, setPreviewDoc] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Fetch Pending Riders
    const fetchPendingRiders = async () => {
        setIsLoading(true);
        try {
            // verified=false fetches riders waiting for review
            const params = { verified: 'false' };
            if (searchTerm.trim()) params.search = searchTerm.trim();
            const response = await adminApi.getDeliveryPartners(params);
            const payload = response.data.result || {};
            const list = Array.isArray(payload.items) ? payload.items : (response.data.results || []);

            // Map backend data to frontend format
            const mappedRiders = list.map(r => {
                const documentList = extractDocumentList(r);
                return {
                    id: r._id,
                    name: r.name,
                    phone: r.phone,
                    email: r.email,
                    appliedDate: new Date(r.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                    location: r.currentArea || 'Unknown',
                    vehicle: r.vehicleType,
                    vehicleNumber: r.vehicleNumber || 'N/A',
                    drivingLicenseNumber: r.drivingLicenseNumber || null,
                    avatar: r.profileImage || null,
                    documents: documentList.map(d => d.label),
                    documentList,
                    status: r.isVerified ? 'approved' : 'pending_review',
                    experience: 'Not Specified', // Mock for now
                    preferredArea: r.currentArea || 'Not Specified'
                };
            });

            setPendingRiders(mappedRiders);
        } catch (error) {
            console.error('Fetch Pending Riders Error:', error);
            toast.error('Failed to load applications');
        } finally {
            setIsLoading(false);
        }
    };


React.useEffect(() => {
    const timer = setTimeout(() => {
        fetchPendingRiders();
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [searchTerm, filterStatus]);

// Lock background scroll when any modal is open
React.useEffect(() => {
    const isModalOpen = Boolean(viewingRider || previewDoc);
    if (isModalOpen) {
        const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
        const prevBodyOverflow = document.body.style.overflow;
        const prevHtmlOverflow = document.documentElement.style.overflow;
        const prevPaddingRight = document.body.style.paddingRight;

        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
        if (scrollBarWidth > 0) {
            document.body.style.paddingRight = `${scrollBarWidth}px`;
        }
        window.lenis?.stop();

        return () => {
            document.body.style.overflow = prevBodyOverflow;
            document.documentElement.style.overflow = prevHtmlOverflow;
            document.body.style.paddingRight = prevPaddingRight;
            window.lenis?.start();
        };
    }
}, [viewingRider, previewDoc]);

const filteredRiders = useMemo(() => {
    return pendingRiders.filter(r => {
        const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) || r.phone.includes(searchTerm);
        
        let matchesStatus = true;
        if (filterStatus === 'pending') {
            matchesStatus = r.status === 'pending_review';
        } else if (filterStatus === 'missing_info') {
            matchesStatus = !r.location || r.location === 'Unknown' || r.location === 'Not Specified';
        }

        return matchesSearch && matchesStatus;
    });
}, [pendingRiders, searchTerm, filterStatus]);

const handleApprove = async (id) => {
    setIsProcessing(true);
    try {
        await adminApi.approveDeliveryPartner(id);
        toast.success('Rider Approved & Activated!');
        setPendingRiders(pendingRiders.filter(r => r.id !== id));
        setViewingRider(null);
    } catch (error) {
        console.error('Approval Error:', error);
        toast.error('Failed to approve rider');
    } finally {
        setIsProcessing(false);
    }
};

const handleReject = async (id) => {
    if (window.confirm('Are you sure you want to reject this application?')) {
        setIsProcessing(true);
        try {
            await adminApi.rejectDeliveryPartner(id);
            toast.success('Application Rejected');
            setPendingRiders(pendingRiders.filter(r => r.id !== id));
            setViewingRider(null);
        } catch (error) {
            console.error('Rejection Error:', error);
            toast.error('Failed to reject rider');
        } finally {
            setIsProcessing(false);
        }
    }
};

return (
    <div className="ds-section-spacing animate-in fade-in duration-700">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
                <h1 className="ds-h1 flex items-center gap-3">
                    Rider Applications
                    <Badge variant="primary" className="text-[10px] px-2 py-0.5 uppercase">Pending Review</Badge>
                </h1>
                <p className="ds-description mt-1">Review documents for new delivery partners.</p>
            </div>
            <div className="flex items-center gap-3">
                <button className="p-3 bg-white ring-1 ring-slate-200 rounded-2xl text-slate-400 hover:text-primary transition-all shadow-sm active:rotate-180 duration-500">
                    <RotateCw className="h-5 w-5" />
                </button>
                <div className="h-10 w-[1px] bg-slate-200 mx-2" />
                <div className="flex flex-col items-end">
                    <p className="ds-label">Total Pending</p>
                    <h4 className="ds-h2">{pendingRiders.length}</h4>
                </div>
            </div>
        </div>

        {/* Utility Bar */}
        <Card className="p-4 border-none shadow-sm ring-1 ring-slate-100 bg-white/50 backdrop-blur-xl">
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1 relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400 group-focus-within:text-primary transition-colors" />
                    <input
                        type="text"
                        placeholder="Search by name or mobile..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-100/50 border-none rounded-2xl text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-slate-100/50 p-1 rounded-2xl flex items-center">
                        {['all', 'pending', 'missing_info'].map((status) => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={cn(
                                    "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                                    filterStatus === status
                                        ? "bg-white text-slate-900 shadow-sm"
                                        : "text-slate-400 hover:text-slate-600"
                                )}
                            >
                                {status === 'pending' ? 'PENDING' : status.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                    <button className="p-3.5 bg-white ring-1 ring-slate-200 rounded-2xl text-slate-600 hover:text-primary transition-all">
                        <Filter className="h-5 w-5" />
                    </button>
                </div>
            </div>
        </Card>

        {/* Applications Table View */}
        <Card className="border-none shadow-2xl ring-1 ring-slate-100 overflow-hidden bg-white rounded-xl relative min-h-[400px]">
            {isLoading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-3">
                        <div className="h-10 w-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Applications...</p>
                    </div>
                </div>
            )}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                            <th className="ds-table-header-cell px-4">Applicant Details</th>
                            <th className="ds-table-header-cell px-4">Operational Intel</th>
                            <th className="ds-table-header-cell px-4">Submission Status</th>
                            <th className="ds-table-header-cell px-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {!isLoading && filteredRiders.length === 0 ? (
                            <tr>
                                <td colSpan="4" className="py-20 text-center">
                                    <FileSearch className="h-10 w-10 text-slate-300 mx-auto mb-4" />
                                    <p className="text-sm font-bold text-slate-500">No pending applications found.</p>
                                </td>
                            </tr>
                        ) : (
                            filteredRiders.map((rider) => (
                                <tr key={rider.id} className="group hover:bg-slate-50/50 transition-colors">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-4">
                                            <img 
                                               src={rider.avatar && !rider.avatar.includes('emoji') && !rider.avatar.includes('avatar') ? rider.avatar : "https://cdn-icons-png.flaticon.com/512/149/149071.png"} 
                                               alt="" 
                                               className="h-12 w-12 rounded-lg bg-gray-100 ring-2 ring-white shadow-sm object-cover group-hover:scale-110 transition-all" 
                                            />
                                            <div>
                                                <p className="text-sm font-black text-slate-900">{rider.name}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <Phone className="h-3 w-3 text-slate-400" />
                                                    <span className="text-[10px] font-bold text-slate-500">{rider.phone}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <Truck className="h-3.5 w-3.5" />
                                                <span className="text-[10px] font-bold">{rider.vehicle}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-slate-400">
                                                <MapPin className="h-3.5 w-3.5" />
                                                <span className="text-[10px] font-bold">{rider.location}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col gap-2">
                                            <Badge variant={rider.status === 'pending_review' ? 'primary' : 'warning'} className="w-fit text-[8px] font-black uppercase">
                                                {rider.status.replace('_', ' ')}
                                            </Badge>
                                            <div className="flex gap-1">
                                                {rider.documents.slice(0, 2).map((doc, i) => (
                                                    <div key={i} className="h-5 px-2 bg-slate-100 rounded-md text-[8px] font-bold text-slate-500 flex items-center">
                                                        {doc}
                                                    </div>
                                                ))}
                                                {rider.documents.length > 2 && (
                                                    <div className="h-5 px-2 bg-slate-100 rounded-md text-[8px] font-bold text-slate-400 flex items-center">
                                                        +{rider.documents.length - 2} More
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => handleApprove(rider.id)}
                                                className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center transition-all shadow-sm"
                                                title="Approve"
                                            >
                                                <Check className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleReject(rider.id)}
                                                className="h-8 w-8 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center transition-all shadow-sm"
                                                title="Reject"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => setViewingRider(rider)}
                                                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-[10px] font-bold shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95 ml-2"
                                            >
                                                VIEW APPLICATION
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </Card>

        {/* Application Review Modal */}
        <AnimatePresence>
            {viewingRider && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 lg:p-8 overscroll-contain"
                    data-lenis-prevent
                    data-lenis-prevent-wheel
                    data-lenis-prevent-touch
                    style={{ overscrollBehavior: "contain" }}
                >
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl"
                        onClick={() => setViewingRider(null)}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="w-full max-w-5xl max-h-[92vh] relative z-10 bg-white rounded-[36px] sm:rounded-[48px] shadow-3xl overflow-hidden flex flex-col lg:flex-row my-auto overscroll-contain"
                        data-lenis-prevent
                        data-lenis-prevent-wheel
                        data-lenis-prevent-touch
                        style={{ overscrollBehavior: "contain" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Left: Applicant Profile Info */}
                        <div className="lg:w-80 bg-slate-50 p-5 border-r border-slate-100 overflow-y-auto shrink-0">
                            <div className="text-center mb-10">
                                <img 
                                   src={viewingRider.avatar && !viewingRider.avatar.includes('emoji') && !viewingRider.avatar.includes('avatar') ? viewingRider.avatar : "https://cdn-icons-png.flaticon.com/512/149/149071.png"} 
                                   alt="" 
                                   className="h-24 w-24 rounded-2xl bg-white shadow-xl object-cover ring-4 ring-white" 
                                />
                                <h3 className="ds-h2">{viewingRider.name}</h3>
                                <p className="ds-label text-primary mt-1">Applicant Node</p>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preferred Area</p>
                                    <div className="flex items-center gap-2 text-slate-700">
                                        <MapPin className="h-4 w-4 text-slate-400" />
                                        <span className="text-xs font-bold">{viewingRider.preferredArea}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Experience</p>
                                    <div className="flex items-center gap-2 text-slate-700">
                                        <Calendar className="h-4 w-4 text-slate-400" />
                                        <span className="text-xs font-bold">{viewingRider.experience}</span>
                                    </div>
                                </div>
                                <div className="pt-6 border-t border-slate-200">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">System Confidence</p>
                                    <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-brand-500 w-[85%]" />
                                    </div>
                                    <p className="text-[9px] font-bold text-brand-600 mt-2">85% Verification Score</p>
                                </div>
                            </div>
                        </div>

                        {/* Right: Document & Action Section */}
                        <div className="flex-1 p-5 lg:p-14 bg-white">
                            <div className="flex justify-between items-start mb-10">
                                <div>
                                    <h2 className="ds-h1">Vetting Protocol</h2>
                                    <p className="ds-description mt-1">Check submitted legal documents for platform entry.</p>
                                </div>
                                <button onClick={() => setViewingRider(null)} className="p-3 hover:bg-slate-50 rounded-2xl transition-all">
                                    <X className="h-6 w-6 text-slate-400" />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Contact Records</h4>
                                    <div className="p-6 bg-slate-50 rounded-xl space-y-4">
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-primary">
                                                <Phone className="h-5 w-5" />
                                            </div>
                                            <span className="text-sm font-bold text-slate-900">{viewingRider.phone}</span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-primary">
                                                <Mail className="h-5 w-5" />
                                            </div>
                                            <span className="text-sm font-bold text-slate-900">{viewingRider.email}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Vehicle Identification</h4>
                                    <div className="p-6 bg-slate-50 rounded-xl border-2 border-brand-500/10">
                                        <div className="flex items-center gap-4">
                                            <div className="h-12 w-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-brand-600">
                                                <Truck className="h-6 w-6" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-slate-900">{viewingRider.vehicle}</p>
                                                <p className="text-[9px] font-bold text-brand-600 uppercase tracking-widest mt-0.5">Eco-Friendly Ready</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 mb-10">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                        Submitted Documents ({viewingRider.documentList?.length || 0})
                                    </h4>
                                    <span className="text-[10px] font-bold text-slate-400">Click preview to view file</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                    {(viewingRider.documentList || []).map((doc, idx) => (
                                        <div key={idx} className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col justify-between group hover:border-blue-400 transition-all">
                                            <div className="flex items-center gap-3">
                                                <div 
                                                    onClick={() => setPreviewDoc({ ...doc, riderName: viewingRider.name })}
                                                    className="w-12 h-12 rounded-xl bg-white border border-slate-200 overflow-hidden shrink-0 cursor-pointer flex items-center justify-center hover:ring-2 hover:ring-blue-400 transition-all shadow-2xs"
                                                    title="Click to preview"
                                                >
                                                    {doc.url ? (
                                                        <img src={doc.url} alt={doc.label} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <FileText className="h-6 w-6 text-slate-400" />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-black text-slate-900 truncate">{doc.label}</p>
                                                    {doc.number && <p className="text-[10px] font-mono font-bold text-slate-500 truncate">{doc.number}</p>}
                                                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/50">✓ Uploaded</span>
                                                </div>
                                            </div>
                                            <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewDoc({ ...doc, riderName: viewingRider.name })}
                                                    className="flex-1 py-1.5 px-2 bg-white hover:bg-slate-900 hover:text-white text-slate-700 text-[11px] font-bold rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                                                >
                                                    <Eye className="h-3.5 w-3.5" />
                                                    Preview
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => window.open(doc.url, '_blank', 'noopener,noreferrer')}
                                                    className="p-1.5 bg-white hover:bg-slate-100 text-slate-500 rounded-xl border border-slate-200 cursor-pointer"
                                                    title="Open in new window"
                                                >
                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4">
                                <button
                                    disabled={isProcessing}
                                    onClick={() => handleApprove(viewingRider.id)}
                                    className="flex-1 py-5 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer"
                                >
                                    {isProcessing ? (
                                        <>
                                            <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                            Processing Vetting...
                                        </>
                                    ) : (
                                        <>
                                            <Check className="h-4 w-4" />
                                            APPROVE & ACTIVATE RIDER
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => handleReject(viewingRider.id)}
                                    className="py-5 px-5 bg-rose-50 text-rose-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-rose-100 transition-all active:scale-95 cursor-pointer"
                                >
                                    REJECT APPLICATION
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

        {/* In-App Document Preview Modal */}
        <AnimatePresence>
            {previewDoc && (
                <div
                    className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 overscroll-contain"
                    data-lenis-prevent
                    data-lenis-prevent-wheel
                    data-lenis-prevent-touch
                    style={{ overscrollBehavior: "contain" }}
                >
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-950/70 backdrop-blur-md"
                        onClick={() => setPreviewDoc(null)}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 15 }}
                        className="w-full max-w-4xl max-h-[92vh] relative z-10 bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-100 overscroll-contain"
                        data-lenis-prevent
                        data-lenis-prevent-wheel
                        data-lenis-prevent-touch
                        style={{ overscrollBehavior: "contain" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="sticky top-0 bg-white/95 backdrop-blur-md z-20 p-4 sm:px-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                    <FileText className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm sm:text-base font-black text-slate-900">
                                        {previewDoc.label}
                                    </h3>
                                    <p className="text-xs font-semibold text-slate-400">
                                        {previewDoc.riderName ? `Applicant: ${previewDoc.riderName}` : 'Submitted Document'}
                                        {previewDoc.number ? ` • ${previewDoc.number}` : ''}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => window.open(previewDoc.url, '_blank', 'noopener,noreferrer')}
                                    className="p-2 sm:px-3 sm:py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                                    title="Open in new window"
                                >
                                    <ExternalLink className="h-4 w-4" />
                                    <span className="hidden sm:inline">Open in Tab</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPreviewDoc(null)}
                                    className="p-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 rounded-xl transition-all cursor-pointer"
                                    title="Close Preview"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 bg-slate-900/5 flex items-center justify-center p-4 sm:p-6 overflow-auto max-h-[75vh]">
                            {previewDoc.url && previewDoc.url.toLowerCase().endsWith('.pdf') ? (
                                <iframe
                                    src={previewDoc.url}
                                    title={previewDoc.label}
                                    className="w-full h-[70vh] rounded-2xl bg-white border border-slate-200 shadow-sm"
                                />
                            ) : (
                                <img
                                    src={previewDoc.url}
                                    alt={previewDoc.label}
                                    className="max-h-[70vh] max-w-full object-contain rounded-2xl shadow-xl border border-slate-200 bg-white"
                                />
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    </div>
);
};

export default PendingDeliveryBoys;
