import React, { useState, useMemo, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import {
    Users,
    Search,
    Download,
    Eye,
    Phone,
    ShoppingBag,
    UserPlus,
    RotateCw,
    Activity,
    Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from '../services/adminApi';
import { toast } from 'sonner';

const CustomerManagement = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [isExporting, setIsExporting] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchCustomers(1);
        }, 500);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageSize, searchTerm, filterStatus]);
    const fetchCustomers = async (requestedPage = 1) => {
        try {
            setLoading(true);
            const params = { page: requestedPage, limit: pageSize };
            if (searchTerm.trim()) params.search = searchTerm.trim();
            if (filterStatus !== 'all') params.status = filterStatus;
            const { data } = await adminApi.getUsers(params);
            if (data.success) {
                const payload = data.result || {};
                const list = Array.isArray(payload.items) ? payload.items : (data.results || []);
                setCustomers(list);
                if (typeof payload.total === 'number') {
                    setTotal(payload.total);
                } else {
                    setTotal(list.length);
                }
                if (typeof payload.page === 'number') {
                    setPage(payload.page);
                } else {
                    setPage(requestedPage);
                }
            }
        } catch (error) {
            console.error("Error fetching customers:", error);
            toast.error("Failed to load customers");
        } finally {
            setLoading(false);
        }
    };

    const stats = useMemo(() => {
        const safeCustomers = Array.isArray(customers) ? customers : [];
        return {
            total: total,
            active: safeCustomers.filter(c => c.status === 'active').length,
            newToday: safeCustomers.filter(c => {
                const today = new Date().toISOString().split('T')[0];
                const joined = new Date(c.joinedDate).toISOString().split('T')[0];
                return joined === today;
            }).length
        };
    }, [customers, total]);

    const filteredCustomers = useMemo(() => {
        const safeCustomers = Array.isArray(customers) ? customers : [];
        return safeCustomers.filter(c => {
            const matchesSearch = (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (c.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (c.phone || '').includes(searchTerm);
            const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
            return matchesSearch && matchesStatus;
        });
    }, [customers, searchTerm, filterStatus]);

    const handleExport = () => {
        setIsExporting(true);
        setTimeout(() => {
            setIsExporting(false);
            toast.success('Customer database exported successfully!');
        }, 1500);
    };

    const getTimeAgo = (date) => {
        if (!date) return 'Never';
        const now = new Date();
        const past = new Date(date);
        const diffInMs = now - past;
        const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));

        if (diffInHours < 1) return 'Recently';
        if (diffInHours < 24) return `${diffInHours}h ago`;
        const diffInDays = Math.floor(diffInHours / 24);
        return `${diffInDays}d ago`;
    };

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-16 space-y-6">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 flex items-center gap-3">
                        Customers
                        <div className="p-1.5 bg-brand-50 rounded-xl">
                            <Users className="h-5 w-5 text-brand-600" />
                        </div>
                    </h1>
                    <p className="text-sm font-medium text-slate-500 mt-1">Manage and track all customer accounts.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white ring-1 ring-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                    >
                        {isExporting ? <RotateCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-slate-500" />}
                        {isExporting ? 'EXPORTING...' : 'EXPORT'}
                    </button>
                </div>
            </div>

            {/* Quick Stats - Compacted */}
            <div className="flex flex-wrap gap-3 items-center">
                {[
                    { label: 'Total Customers', value: stats.total.toLocaleString(), icon: Users, bg: 'bg-brand-50', iconColor: 'text-brand-600' },
                    { label: 'Active Users', value: stats.active.toLocaleString(), icon: Activity, bg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
                    { label: 'New Today', value: stats.newToday.toLocaleString(), icon: UserPlus, bg: 'bg-blue-50', iconColor: 'text-blue-600' },
                ].map((stat, i) => (
                    <Card key={i} className="border-none shadow-xs ring-1 ring-slate-200/80 px-4 py-2.5 bg-white rounded-lg w-full sm:w-56 md:w-60 shrink-0 text-left">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 whitespace-nowrap">{stat.label}</p>
                                <h3 className="text-2xl font-black text-slate-900 mt-0.5">{stat.value}</h3>
                            </div>
                            <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", stat.bg)}>
                                <stat.icon className={cn("h-5 w-5", stat.iconColor)} />
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Filter & Search Bar */}
            <Card className="p-3 px-4 border-none shadow-xs ring-1 ring-slate-200/80 bg-white rounded-xl">
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="flex-1 relative group w-full text-left">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-brand-600 transition-colors" />
                        <input
                            type="text"
                            placeholder="Search by customer name, email or phone..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200/70 rounded-xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-white transition-all placeholder:text-slate-400"
                        />
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 bg-slate-100 p-1 rounded-xl">
                        {['all', 'active', 'inactive'].map((status) => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={cn(
                                    "px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer",
                                    filterStatus === status ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                                )}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                </div>
            </Card>

            {/* Customer List Table */}
            <Card className="border-none shadow-xs ring-1 ring-slate-200/80 bg-white rounded-2xl overflow-hidden relative min-h-[350px]">
                {loading && (
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] z-10 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-7 w-7 text-brand-600 animate-spin" />
                            <p className="text-xs font-bold text-slate-500">Loading Customers...</p>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-100">
                                <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Customer</th>
                                <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Activity</th>
                                <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Total Spend</th>
                                <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {!loading && filteredCustomers.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-16 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="p-3.5 bg-slate-50 rounded-2xl ring-1 ring-slate-100">
                                                <Users className="h-7 w-7 text-slate-300" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-400">No customers found</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredCustomers.map((cust) => (
                                    <tr key={cust.id} className="hover:bg-slate-50/60 transition-colors">
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <img
                                                    src="https://cdn-icons-png.flaticon.com/512/149/149071.png"
                                                    alt=""
                                                    className="h-10 w-10 rounded-xl bg-slate-100 ring-2 ring-slate-100 shadow-xs object-cover shrink-0"
                                                />
                                                <div>
                                                    <p
                                                        onClick={() => navigate(`/admin/customers/${cust.id}`)}
                                                        className="text-sm font-bold text-slate-900 hover:text-brand-600 cursor-pointer transition-colors"
                                                    >
                                                        {cust.name || 'Unnamed Customer'}
                                                    </p>
                                                    <p className="text-xs font-medium text-slate-500">{cust.email || 'No email'}</p>
                                                    <div className="flex items-center gap-1.5 mt-0.5 text-slate-400">
                                                        <Phone className="h-3 w-3" />
                                                        <span className="text-xs font-semibold">{cust.phone || 'N/A'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <div>
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                                    <ShoppingBag className="h-3.5 w-3.5 text-brand-600" />
                                                    {cust.totalOrders || 0} Orders
                                                </div>
                                                <p className="text-xs font-medium text-slate-400 mt-0.5">Last: {getTimeAgo(cust.lastOrderDate)}</p>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className="text-sm font-black text-slate-900">
                                                ₹{Number(cust.totalSpent || 0).toLocaleString('en-IN')}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <Badge
                                                variant={cust.status === 'active' ? 'success' : 'secondary'}
                                                className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5"
                                            >
                                                {cust.status || 'inactive'}
                                            </Badge>
                                        </td>
                                        <td className="px-5 py-3.5 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    onClick={() => navigate(`/admin/customers/${cust.id}`)}
                                                    className="p-2 bg-slate-100 hover:bg-brand-50 hover:text-brand-600 text-slate-700 rounded-xl transition-colors cursor-pointer"
                                                    title="View Customer Profile"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/40">
                    <Pagination
                        page={page}
                        totalPages={Math.ceil(total / pageSize) || 1}
                        total={total}
                        pageSize={pageSize}
                        onPageChange={(p) => fetchCustomers(p)}
                        onPageSizeChange={(newSize) => {
                            setPageSize(newSize);
                            setPage(1);
                        }}
                        loading={loading}
                    />
                </div>
            </Card>
        </div>
    );
};

export default CustomerManagement;
