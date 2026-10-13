import React, { useState, useMemo } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import {
    Users,
    UserCheck,
    Activity,
    Trophy,
    Search,
    Filter,
    Plus,
    MoreVertical,
    Phone,
    MapPin,
    Truck,
    User,
    Star,
    DollarSign,
    ShieldCheck,
    XCircle,
    Pencil,
    Trash2,
    Eye,
    X,
    FileText,
    ExternalLink,
    CheckCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import Pagination from '@shared/components/ui/Pagination';
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

const ActiveDeliveryBoys = () => {
    const [riders, setRiders] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [selectedRider, setSelectedRider] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isOnboardModalOpen, setIsOnboardModalOpen] = useState(false);
    const [viewingRider, setViewingRider] = useState(null);
    const [previewDoc, setPreviewDoc] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Form states
    const [formState, setFormState] = useState({
        name: '', phone: '', email: '', vehicle: '', vehicleNum: '', location: ''
    });

    // Fetch Riders
    const fetchRiders = async (requestedPage = 1) => {
        setIsLoading(true);
        try {
            const params = { page: requestedPage, limit: pageSize };
            if (searchTerm.trim()) params.search = searchTerm.trim();
            if (statusFilter !== 'all') params.status = statusFilter;

            const response = await adminApi.getDeliveryPartners(params);
            const payload = response.data.result || {};
            const data = Array.isArray(payload.items) ? payload.items : (response.data.results || response.data.result || []);

            const mappedRiders = data.map(r => {
                const documentList = extractDocumentList(r);
                const avgRatingNum = typeof r.averageRating === 'number' ? r.averageRating : (typeof r.rating === 'number' ? r.rating : 0);
                const totalOrdersCount = r.totalDeliveries ?? r.totalOrders ?? 0;
                const walletBalanceVal = r.walletBalance ?? r.walletCreds ?? 0;
                const todayEarningsVal = r.todayEarnings ?? 0;
                const totalReviewsCount = r.totalReviews || 0;
                const fleetRankStr = r.fleetRank || 'N/A';

                return {
                    id: r._id,
                    name: r.name,
                    phone: r.phone,
                    email: r.email,
                    isVerified: Boolean(r.isVerified),
                    status: r.isOnline ? 'available' : 'offline',
                    vehicle: r.vehicleType,
                    vehicleNum: r.vehicleNumber || 'N/A',
                    drivingLicenseNumber: r.drivingLicenseNumber || null,
                    address: r.address || null,
                    avatar: r.profileImage || null,
                    documents: r.documents || {},
                    documentList,
                    rating: avgRatingNum > 0 ? avgRatingNum.toFixed(1) : (totalReviewsCount > 0 ? '0.0' : '0.0'),
                    ratingNumber: avgRatingNum,
                    totalReviews: totalReviewsCount,
                    totalOrders: totalOrdersCount,
                    todayEarnings: todayEarningsVal,
                    walletBalance: walletBalanceVal,
                    fleetRank: fleetRankStr,
                    location: r.currentArea || 'Unknown',
                    lastSync: r.lastLocationAt 
                        ? new Date(r.lastLocationAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                        : (r.isOnline ? 'Active' : 'Offline'),
                    joinDate: r.createdAt 
                        ? new Date(r.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) 
                        : 'N/A'
                };
            });

            setRiders(mappedRiders);
            setTotal(typeof payload.total === 'number' ? payload.total : mappedRiders.length);
            setPage(typeof payload.page === 'number' ? payload.page : requestedPage);
        } catch (error) {
            console.error('Fetch Riders Error:', error);
            toast.error('Failed to fetch delivery partners');
        } finally {
            setIsLoading(false);
        }
    };

React.useEffect(() => {
    const timer = setTimeout(() => {
        fetchRiders(1);
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [pageSize, searchTerm, statusFilter]);

// Lock background scroll when any modal is open
React.useEffect(() => {
    const isModalOpen = Boolean(viewingRider || previewDoc || isEditModalOpen || isOnboardModalOpen);
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
}, [viewingRider, previewDoc, isEditModalOpen, isOnboardModalOpen]);

// Filtering logic
const filteredRiders = useMemo(() => {
    return riders.filter(r => {
        const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.phone.includes(searchTerm);
        const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
        return matchesSearch && matchesStatus;
    });
}, [riders, searchTerm, statusFilter]);

const handleAction = (type, rider) => {
    if (type === 'view') {
        setViewingRider(rider);
    } else if (type === 'edit') {
        setFormState(rider);
        setSelectedRider(rider);
        setIsEditModalOpen(true);
    } else if (type === 'delete') {
        if (window.confirm(`Are you sure you want to deactivate ${rider.name}?`)) {
            (async () => {
                try {
                    await adminApi.updateDeliveryPartner(rider.id, { isOnline: false });
                    toast.success(`${rider.name} marked offline/deactivated`);
                    fetchRiders(page);
                } catch (err) {
                    console.error(err);
                    toast.error("Failed to deactivate rider");
                }
            })();
        }
    } else if (type === 'approve') {
        handleApprove(rider.id);
    }
};

const handleApprove = async (id) => {
    setIsProcessing(true);
    try {
        await adminApi.approveDeliveryPartner(id);
        toast.success('Rider approved & activated successfully!');
        setViewingRider(prev => prev && prev.id === id ? { ...prev, isVerified: true, status: 'available' } : prev);
        fetchRiders(page);
    } catch (error) {
        console.error('Approve Rider Error:', error);
        toast.error(error?.response?.data?.message || 'Failed to approve rider');
    } finally {
        setIsProcessing(false);
    }
};

const validateForm = () => {
    if (!/^[a-zA-Z\s]+$/.test(formState.name.trim())) {
        toast.error("Name should contain only alphabets and spaces (no special characters or numbers).");
        return false;
    }
    if (!/^[6-9][0-9]{9}$/.test(formState.phone.trim())) {
        toast.error("Mobile number must be exactly 10 digits and start with 6, 7, 8, or 9.");
        return false;
    }
    if (formState.vehicle !== 'Cycle' && !/^[A-Za-z]{2} [0-9]{2} [A-Za-z]{1,2} [0-9]{4}$/.test(formState.vehicleNum.trim())) {
        toast.error("Vehicle registration number must follow the format 'AA 00 AA 0000' with spaces (e.g., MH 12 AB 1234).");
        return false;
    }
    if (formState.location.trim().length < 3) {
        toast.error("Please enter a valid operational area (min 3 chars).");
        return false;
    }
    return true;
};

const handleOnboardSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    const newRider = {
        ...formState,
        id: 'r' + (riders.length + 1),
        status: 'offline',
        rating: '0.0',
        totalOrders: 0,
        todayEarnings: 0,
        walletBalance: 0,
        fleetRank: 'N/A',
        lastSync: 'Just now',
        joinDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    };
    setRiders([newRider, ...riders]);
    setIsOnboardModalOpen(false);
    setFormState({ name: '', phone: '', email: '', vehicle: '', vehicleNum: '', location: '' });
    toast.success("New rider added successfully");
};

const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    try {
        await adminApi.updateDeliveryPartner(selectedRider.id, {
            name: formState.name,
            phone: formState.phone,
            email: formState.email,
            vehicle: formState.vehicle,
            vehicleNum: formState.vehicleNum,
            currentArea: formState.location
        });
        toast.success("Rider details updated successfully");
        setIsEditModalOpen(false);
        setSelectedRider(null);
        fetchRiders(page);
    } catch (err) {
        console.error("Update rider error:", err);
        toast.error("Failed to update rider details");
    }
};

const stats = [
    { label: 'Total Riders', value: total || riders.length, color: 'indigo', icon: Users, description: 'Total fleet size' },
    { label: 'Available', value: riders.filter(r => r.status === 'available').length, color: 'emerald', icon: UserCheck, description: 'Ready for orders' },
    { label: 'Busy (On Task)', value: riders.filter(r => r.status === 'busy').length, color: 'amber', icon: Activity, description: 'Currently delivering' },
    { label: 'Top Earners', value: riders.filter(r => Number(r.rating) >= 4.0).length, color: 'rose', icon: Trophy, description: 'High performance' },
];

return (
    <div className="ds-section-spacing animate-in fade-in duration-700">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
                <h1 className="ds-h1 flex items-center gap-3">
                    Delivery Boys
                    <div className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
                </h1>
                <p className="ds-description mt-1">Manage all your active delivery partners here.</p>
            </div>
            <button
                onClick={() => setIsOnboardModalOpen(true)}
                className="flex items-center space-x-2 bg-slate-900 text-white px-6 py-3.5 rounded-2xl text-xs font-bold hover:bg-slate-800 transition-all shadow-xl hover:shadow-slate-200 active:scale-95 group"
            >
                <Plus className="h-4 w-4 group-hover:rotate-90 transition-transform" />
                <span>ADD NEW RIDER</span>
            </button>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, idx) => (
                <Card key={idx} className="p-6 border-none shadow-xl ring-1 ring-slate-100 hover:ring-primary/20 transition-all group overflow-hidden relative">
                    <div className="flex justify-between items-start relative z-10">
                        <div>
                            <p className="ds-label mb-2">{stat.label}</p>
                            <h3 className="ds-stat-medium">{stat.value}</h3>
                        </div>
                        <div className={cn(
                            "p-3 rounded-2xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 shadow-lg",
                            stat.color === 'indigo' ? "bg-brand-500/10 text-brand-600 shadow-brand-100" :
                                stat.color === 'emerald' ? "bg-brand-500/10 text-brand-600 shadow-brand-100" :
                                    stat.color === 'amber' ? "bg-amber-500/10 text-amber-600 shadow-amber-100" :
                                        "bg-rose-500/10 text-rose-600 shadow-rose-100"
                        )}>
                            <stat.icon className="h-5 w-5" strokeWidth={2.5} />
                        </div>
                    </div>
                    {/* Decorative background element */}
                    <div className="absolute -bottom-6 -right-6 h-24 w-24 bg-slate-50 rounded-full group-hover:scale-150 transition-transform duration-700" />
                </Card>
            ))}
        </div>

        {/* Filters & Search Section */}
        <Card className="p-4 border-none shadow-sm ring-1 ring-slate-100 bg-white/50 backdrop-blur-xl">
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1 relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400 group-focus-within:text-primary transition-colors" />
                    <input
                        type="text"
                        placeholder="Search by name or phone number..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-100/50 border-none rounded-2xl text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-slate-100/50 p-1 rounded-2xl flex items-center">
                        {['all', 'available', 'busy', 'offline'].map((status) => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={cn(
                                    "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                                    statusFilter === status
                                        ? "bg-white text-slate-900 shadow-sm"
                                        : "text-slate-400 hover:text-slate-600"
                                )}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                    <button className="p-3.5 bg-white ring-1 ring-slate-200 rounded-2xl text-slate-600 hover:text-primary hover:ring-primary/30 transition-all shadow-sm">
                        <Filter className="h-5 w-5" />
                    </button>
                </div>
            </div>
        </Card>

        {/* Riders Grid View */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 relative min-h-[300px]">
            {isLoading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm rounded-3xl">
                    <div className="flex flex-col items-center gap-3">
                        <div className="h-10 w-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fetching fleet...</p>
                    </div>
                </div>
            )}
            <AnimatePresence mode='popLayout'>
                {!isLoading && filteredRiders.length === 0 ?
                    <div className="col-span-full py-20 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                        <User className="h-10 w-10 text-slate-300 mx-auto mb-4" />
                        <p className="text-sm font-bold text-slate-500">No delivery partners found matching your filters.</p>
                    </div>
                    :
                    filteredRiders.map((rider) => (
                        <motion.div
                            layout
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            key={rider.id}
                        >
                            <Card className="group border-none shadow-xl ring-1 ring-slate-100 hover:ring-primary/20 transition-all overflow-hidden bg-white">
                                <div className="p-6 space-y-5">
                                    {/* Rider Top Header */}
                                    <div className="flex justify-between items-start">
                                        <div className="flex gap-4">
                                            <div className="relative">
                                                <img 
                                                   src={rider.avatar && !rider.avatar.includes('emoji') && !rider.avatar.includes('avatar') ? rider.avatar : "https://cdn-icons-png.flaticon.com/512/149/149071.png"} 
                                                   alt="" 
                                                   className="h-14 w-14 rounded-lg bg-gray-100 ring-2 ring-white shadow-sm object-cover group-hover:scale-105 transition-transform" 
                                                />
                                                <div className={cn(
                                                    "absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-4 border-white shadow-sm",
                                                    rider.status === 'available' ? 'bg-brand-500' :
                                                        rider.status === 'busy' ? 'bg-amber-500' : 'bg-slate-300'
                                                )} />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-black text-slate-900 group-hover:text-primary transition-colors">{rider.name}</h4>
                                                <div className="flex items-center gap-1.5 mt-1 text-slate-500">
                                                    <Phone className="h-3 w-3" />
                                                    <span className="text-[10px] font-bold">{rider.phone}</span>
                                                </div>
                                                {!rider.isVerified && (
                                                    <span className="inline-block mt-1 text-[9px] font-black uppercase text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/80">
                                                        Pending Approval
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 bg-amber-50 text-amber-600 px-2 py-1 rounded-lg">
                                            <Star className="h-3 w-3 fill-current" />
                                            <span className="text-[10px] font-black">{rider.rating}</span>
                                        </div>
                                    </div>

                                    {/* Metrics Row */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-50 p-3 rounded-2xl">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Today Earnings</p>
                                            <div className="flex items-center gap-1.5">
                                                <DollarSign className="h-3.5 w-3.5 text-brand-500" />
                                                <span className="text-xs font-black text-slate-900">₹{(rider.todayEarnings || 0).toLocaleString('en-IN')}</span>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 p-3 rounded-2xl">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Total Success</p>
                                            <div className="flex items-center gap-1.5">
                                                <ShieldCheck className="h-3.5 w-3.5 text-brand-500" />
                                                <span className="text-xs font-black text-slate-900">{rider.totalOrders} Deliv.</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Location & Vehicle & Documents */}
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                                            <span className="text-[10px] font-semibold truncate">{rider.location}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <Truck className="h-3.5 w-3.5 shrink-0" />
                                            <span className="text-[10px] font-semibold truncate">{rider.vehicle} • <span className="text-slate-900 font-bold">{rider.vehicleNum}</span></span>
                                        </div>
                                        <div className="flex items-center gap-2 text-slate-500 pt-0.5">
                                            <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                            <span className="text-[10px] font-semibold">
                                                {rider.documentList?.length > 0 ? (
                                                    <span className="text-emerald-600 font-black">{rider.documentList.length} Docs Uploaded</span>
                                                ) : (
                                                    <span className="text-slate-400">No Docs Uploaded</span>
                                                )}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Action Footer */}
                                    <div className="pt-2 flex items-center gap-2">
                                        {!rider.isVerified && (
                                            <button
                                                type="button"
                                                onClick={() => handleApprove(rider.id)}
                                                disabled={isProcessing}
                                                className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                                                title="Approve this rider"
                                            >
                                                <CheckCircle className="h-3.5 w-3.5" />
                                                APPROVE
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleAction('view', rider)}
                                            className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-bold shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            <Eye className="h-3.5 w-3.5" />
                                            VIEW PROFILE
                                        </button>
                                        <button
                                            onClick={() => handleAction('edit', rider)}
                                            className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-brand-50 hover:text-brand-600 transition-all"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => handleAction('delete', rider)}
                                            className="p-2.5 bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-all"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </Card>
                        </motion.div>
                    ))
                }
            </AnimatePresence>
        </div>
        <div className="mt-6 flex justify-center">
            <Pagination
                page={page}
                totalPages={Math.ceil(total / pageSize) || 1}
                total={total}
                pageSize={pageSize}
                onPageChange={(p) => fetchRiders(p)}
                onPageSizeChange={(newSize) => {
                    setPageSize(newSize);
                    setPage(1);
                }}
                loading={isLoading}
            />
        </div>

        {/* Profile Detail Modal */}
        <AnimatePresence>
            {viewingRider && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 overscroll-contain"
                    data-lenis-prevent
                    data-lenis-prevent-wheel
                    data-lenis-prevent-touch
                    style={{ overscrollBehavior: "contain" }}
                >
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-md"
                        onClick={() => setViewingRider(null)}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 15 }}
                        className="w-full max-w-2xl max-h-[90vh] relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto overscroll-contain"
                        data-lenis-prevent
                        data-lenis-prevent-wheel
                        data-lenis-prevent-touch
                        style={{ overscrollBehavior: "contain" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Sticky Modal Header */}
                        <div className="sticky top-0 bg-white/95 backdrop-blur-md z-20 px-6 sm:px-8 py-5 border-b border-slate-100 flex justify-between items-start shrink-0">
                            <div className="flex gap-4 sm:gap-6 items-center">
                                <img 
                                   src={viewingRider.avatar && !viewingRider.avatar.includes('emoji') && !viewingRider.avatar.includes('avatar') ? viewingRider.avatar : "https://cdn-icons-png.flaticon.com/512/149/149071.png"} 
                                   alt="" 
                                   className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-gray-100 ring-4 ring-slate-50 shadow-md object-cover" 
                                />
                                <div>
                                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">{viewingRider.name}</h2>
                                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                        {!viewingRider.isVerified ? (
                                            <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                                                Pending Approval
                                            </span>
                                        ) : (
                                            <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                                                <CheckCircle className="h-3 w-3" />
                                                Verified Partner
                                            </span>
                                        )}
                                        <Badge variant={viewingRider.status === 'available' ? 'success' : viewingRider.status === 'busy' ? 'warning' : 'neutral'} className="uppercase font-black text-[9px] px-3">
                                            {viewingRider.status}
                                        </Badge>
                                        <span className="text-xs font-bold text-slate-400">Rider ID: RD-00{viewingRider.id.slice(1)}</span>
                                        {viewingRider.documentList?.length > 0 && (
                                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                                                ✓ {viewingRider.documentList.length} Docs Uploaded
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setViewingRider(null)}
                                className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                                title="Close"
                            >
                                <XCircle className="h-6 w-6" />
                            </button>
                        </div>

                        {/* Scrollable Modal Body */}
                        <div
                            className="p-6 sm:p-8 overflow-y-auto flex-1 space-y-6 overscroll-contain"
                            data-lenis-prevent
                            data-lenis-prevent-wheel
                            data-lenis-prevent-touch
                            style={{ overscrollBehavior: "contain" }}
                        >
                            {/* Details Grid */}
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-5 p-5 bg-slate-50/70 rounded-2xl border border-slate-100">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact Number</p>
                                    <p className="text-sm font-bold text-slate-900">{viewingRider.phone}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Address</p>
                                    <p className="text-sm font-bold text-slate-900 truncate" title={viewingRider.email}>{viewingRider.email}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fleet Partner Since</p>
                                    <p className="text-sm font-bold text-slate-900">{viewingRider.joinDate}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vehicle Assigned</p>
                                    <p className="text-sm font-bold text-slate-900 capitalize">{viewingRider.vehicle}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Registration No.</p>
                                    <p className="text-sm font-bold text-slate-900">{viewingRider.vehicleNum}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Last Synced Area</p>
                                    <p className="text-sm font-bold text-slate-900">{viewingRider.location}</p>
                                </div>
                                {viewingRider.drivingLicenseNumber && (
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Driving License No.</p>
                                        <p className="text-sm font-bold text-slate-900 font-mono">{viewingRider.drivingLicenseNumber}</p>
                                    </div>
                                )}
                                {viewingRider.address && (
                                    <div className="space-y-1 col-span-2">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Registered Address</p>
                                        <p className="text-xs font-bold text-slate-700 truncate" title={viewingRider.address}>{viewingRider.address}</p>
                                    </div>
                                )}
                            </div>

                            {/* Metrics Grid */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100">
                                <div className="text-center">
                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Lifetime Rating</p>
                                    <div className="flex justify-center items-center gap-1">
                                        <Star className="h-4 w-4 text-amber-500 fill-current" />
                                        <span className="text-lg font-black text-slate-900">
                                            {Number(viewingRider.rating) > 0 ? viewingRider.rating : "0.0"}
                                        </span>
                                    </div>
                                    <p className="text-[9px] text-slate-400 font-medium mt-0.5">
                                        {viewingRider.totalReviews ? `${viewingRider.totalReviews} review${viewingRider.totalReviews > 1 ? 's' : ''}` : 'No reviews yet'}
                                    </p>
                                </div>
                                <div className="text-center border-l border-slate-200">
                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Fleet Rank</p>
                                    <span className="text-lg font-black text-slate-900">
                                        {viewingRider.fleetRank || 'N/A'}
                                    </span>
                                    <p className="text-[9px] text-slate-400 font-medium mt-0.5">Fleet rank</p>
                                </div>
                                <div className="text-center border-l border-slate-200">
                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Total Deliveries</p>
                                    <span className="text-lg font-black text-slate-900 text-brand-600">
                                        {viewingRider.totalOrders}
                                    </span>
                                    <p className="text-[9px] text-slate-400 font-medium mt-0.5">Delivered orders</p>
                                </div>
                                <div className="text-center border-l border-slate-200">
                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Wallet Creds</p>
                                    <span className="text-lg font-black text-slate-900 text-brand-600">
                                        ₹{(viewingRider.walletBalance || 0).toLocaleString('en-IN')}
                                    </span>
                                    <p className="text-[9px] text-slate-400 font-medium mt-0.5">Available balance</p>
                                </div>
                            </div>

                            {/* Uploaded Verification Documents Section */}
                            <div className="space-y-3 pt-2 border-t border-slate-100">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-blue-600" />
                                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                                            Uploaded Documents ({viewingRider.documentList?.length || 0})
                                        </h4>
                                    </div>
                                    {viewingRider.documentList?.length > 0 && (
                                        <span className="text-[10px] font-bold text-slate-400">Click preview to view</span>
                                    )}
                                </div>

                                {viewingRider.documentList?.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {viewingRider.documentList.map((doc, idx) => (
                                            <div
                                                key={doc.id || idx}
                                                className="p-3.5 bg-slate-50 hover:bg-blue-50/40 border border-slate-200/80 hover:border-blue-300 rounded-2xl transition-all flex flex-col justify-between group"
                                            >
                                                <div className="flex items-start gap-3">
                                                    {/* Document Thumbnail / Icon */}
                                                    <div 
                                                        onClick={() => setPreviewDoc({ ...doc, riderName: viewingRider.name })}
                                                        className="w-14 h-14 rounded-xl bg-white border border-slate-200 overflow-hidden shrink-0 cursor-pointer flex items-center justify-center group-hover:ring-2 group-hover:ring-blue-400 transition-all relative shadow-2xs"
                                                        title="Click to preview"
                                                    >
                                                        {doc.url ? (
                                                            <img
                                                                src={doc.url}
                                                                alt={doc.label}
                                                                className="w-full h-full object-cover"
                                                                onError={(e) => {
                                                                    e.target.style.display = 'none';
                                                                    if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                                                                }}
                                                            />
                                                        ) : null}
                                                        <div style={{ display: doc.url ? 'none' : 'flex' }} className="w-full h-full items-center justify-center bg-slate-100 text-slate-400">
                                                            <FileText className="h-6 w-6" />
                                                        </div>
                                                    </div>

                                                    {/* Document Info */}
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-black text-slate-900 truncate">
                                                            {doc.label}
                                                        </p>
                                                        {doc.number && (
                                                            <p className="text-[10px] font-mono font-bold text-slate-500 truncate mt-0.5">
                                                                {doc.number}
                                                            </p>
                                                        )}
                                                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md mt-1 border border-emerald-200/50">
                                                            <CheckCircle className="h-2.5 w-2.5" />
                                                            Uploaded
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="mt-3 pt-2.5 border-t border-slate-200/70 flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewDoc({ ...doc, riderName: viewingRider.name })}
                                                        className="flex-1 py-1.5 px-2 bg-white hover:bg-slate-900 hover:text-white text-slate-700 text-[11px] font-black rounded-xl border border-slate-200/90 shadow-2xs transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                                                    >
                                                        <Eye className="h-3.5 w-3.5" />
                                                        Preview
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => window.open(doc.url, '_blank', 'noopener,noreferrer')}
                                                        className="p-1.5 bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-900 rounded-xl border border-slate-200/90 transition-colors cursor-pointer"
                                                        title="Open original file in new tab"
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center">
                                        <FileText className="h-8 w-8 text-slate-300 mx-auto mb-1.5" />
                                        <p className="text-xs font-bold text-slate-500">No verification documents uploaded yet for this partner.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Sticky Modal Footer */}
                        <div className="sticky bottom-0 bg-white/95 backdrop-blur-md z-20 px-6 sm:px-8 py-4 border-t border-slate-100 flex flex-wrap sm:flex-nowrap gap-3 shrink-0">
                            {!viewingRider.isVerified ? (
                                <button
                                    type="button"
                                    onClick={() => handleApprove(viewingRider.id)}
                                    disabled={isProcessing}
                                    className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-600/25 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    <CheckCircle className="h-4 w-4" />
                                    {isProcessing ? "APPROVING..." : "APPROVE DELIVERY BOY"}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => {
                                        window.location.href = `tel:${viewingRider.phone}`;
                                    }}
                                    className="flex-1 py-3.5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all cursor-pointer hover:bg-slate-800"
                                >
                                    Call / Message Partner
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    window.location.href = `tel:${viewingRider.phone}`;
                                }}
                                className="px-5 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                                title="Call / Contact partner"
                            >
                                <Phone className="h-4 w-4" />
                                <span className="hidden sm:inline">Call</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    handleAction('delete', viewingRider);
                                    setViewingRider(null);
                                }}
                                className="px-6 py-3.5 bg-rose-50 text-rose-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-100 transition-all active:scale-95 cursor-pointer"
                            >
                                DEACTIVATE
                            </button>
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
                        {/* Header */}
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
                                        {previewDoc.riderName ? `Delivery Partner: ${previewDoc.riderName}` : 'Verification Document'}
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

                        {/* Viewer Body */}
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

        {/* Onboard / Edit Modal */}
        <AnimatePresence>
            {(isOnboardModalOpen || isEditModalOpen) && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-lg"
                        onClick={() => {
                            setIsOnboardModalOpen(false);
                            setIsEditModalOpen(false);
                        }}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 30 }}
                        className="w-full max-w-lg relative z-[120] bg-white rounded-2xl p-5 shadow-3xl"
                    >
                        <h3 className="ds-h2 mb-2">
                            {isEditModalOpen ? 'Edit Rider' : 'Add New Rider'}
                        </h3>
                        <p className="ds-label mt-1 text-slate-500">
                            {isEditModalOpen ? 'Update rider details below.' : 'Enter details to register a new delivery partner.'}
                        </p>

                        <form onSubmit={isEditModalOpen ? handleEditSubmit : handleOnboardSubmit} className="space-y-5">
                            <div className="grid grid-cols-1 gap-5">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Identity Name</label>
                                    <input
                                        required
                                        type="text"
                                        value={formState.name}
                                        onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                                        className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                                        placeholder="e.g. Rahul Sharma"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Secure Contact</label>
                                        <input
                                            required
                                            type="text"
                                            value={formState.phone}
                                            onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                                            className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                                            placeholder="+91..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Work Vehicle</label>
                                        <select
                                            required
                                            value={formState.vehicle}
                                            onChange={(e) => setFormState({ ...formState, vehicle: e.target.value })}
                                            className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10 transition-all appearance-none"
                                        >
                                            <option value="">Select Vehicle</option>
                                            <option>Two Wheeler</option>
                                            <option>Electric Scooter</option>
                                            <option>Cycle</option>
                                            <option>Three Wheeler</option>
                                        </select>
                                    </div>
                                </div>
                                {formState.vehicle !== 'Cycle' && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Registration Vehicle No.</label>
                                        <input
                                            required
                                            type="text"
                                            value={formState.vehicleNum}
                                            onChange={(e) => setFormState({ ...formState, vehicleNum: e.target.value.toUpperCase() })}
                                            className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                                            placeholder="e.g. MH 12 AB 0000"
                                        />
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Assigned Operational Area</label>
                                    <input
                                        required
                                        type="text"
                                        value={formState.location}
                                        onChange={(e) => setFormState({ ...formState, location: e.target.value })}
                                        className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                                        placeholder="e.g. Bandra West, Mumbai"
                                    />
                                </div>
                            </div>

                            <button type="submit" className="w-full py-4.5 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-2xl hover:bg-slate-800 transition-all transform active:scale-[0.98] mt-4">
                                {isEditModalOpen ? 'SAVE CHANGES' : 'ADD RIDER'}
                            </button>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    </div>
);
};

export default ActiveDeliveryBoys;
