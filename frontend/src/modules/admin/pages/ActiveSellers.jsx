import React, { useEffect, useMemo, useRef, useState } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Pagination from "@shared/components/ui/Pagination";
import {
  HiOutlineBuildingOffice2,
  HiOutlineMagnifyingGlass,
  HiOutlineFunnel,
  HiOutlineEnvelope,
  HiOutlinePhone,
  HiOutlineCalendarDays,
  HiOutlineArrowTrendingUp,
  HiOutlineMapPin,
  HiOutlineXMark,
  HiOutlineEye,
  HiOutlineClock,
  HiOutlineArrowPath,
  HiOutlineDocumentText,
  HiOutlineTrash,
  HiOutlinePencilSquare,
  HiOutlineCheck,
  HiOutlineArrowTopRightOnSquare,
} from "react-icons/hi2";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";

const SORT_OPTIONS = [
  { value: "recent", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name_asc", label: "Shop name A-Z" },
  { value: "name_desc", label: "Shop name Z-A" },
  { value: "revenue_desc", label: "Highest revenue" },
  { value: "orders_desc", label: "Most orders" },
  { value: "products_desc", label: "Most products" },
];

const currency = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const statClass = {
  blue: "bg-brand-50 text-brand-600",
  emerald: "bg-brand-50 text-brand-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
};

const emptyStats = {
  totalActiveSellers: 0,
  totalOrders: 0,
  totalRevenue: 0,
  newThisMonth: 0,
  highVolume: 0,
  averageRevenuePerSeller: 0,
  averageOrdersPerSeller: 0,
};

const normalizeSeller = (seller) => {
  const joinedAt = seller.joinedAt || seller.createdAt || null;

  return {
    ...seller,
    documents: Array.isArray(seller.documents) ? seller.documents : [],
    documentFiles: Array.isArray(seller.documentFiles) ? seller.documentFiles : [],
    rawDocuments: seller.rawDocuments || seller.documents || {},
    address: seller.address || seller.location || "",
    locality: seller.locality || "",
    pincode: seller.pincode || "",
    city: seller.city || "",
    state: seller.state || "",
    description: seller.description || "",
    totalOrders: safeNumber(seller.totalOrders),
    deliveredOrders: safeNumber(seller.deliveredOrders),
    pendingOrders: safeNumber(seller.pendingOrders),
    totalRevenue: safeNumber(seller.totalRevenue),
    productCount: safeNumber(seller.productCount),
    avgOrderValue: safeNumber(seller.avgOrderValue),
    fulfillmentRate: safeNumber(seller.fulfillmentRate),
    serviceRadius: safeNumber(seller.serviceRadius) || 5,
    joinedDate: joinedAt
      ? new Date(joinedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : "N/A",
    lastOrderLabel: seller.lastOrderAt
      ? new Date(seller.lastOrderAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : "No orders yet",
    location: seller.location || seller.address || "Location not set",
    avatar:
      seller.avatar ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
        seller.shopName || seller.ownerName || seller.email || "seller",
      )}`,
  };
};

const ActiveSellers = () => {
  const requestSeq = useRef(0);

  const [sellers, setSellers] = useState([]);
  const [stats, setStats] = useState(emptyStats);
  const [categories, setCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedSeller, setSelectedSeller] = useState(null);

  const [previewDoc, setPreviewDoc] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: "",
    shopName: "",
    email: "",
    phone: "",
    category: "",
    serviceRadius: 5,
    address: "",
    description: "",
  });

  useEffect(() => {
    if (selectedSeller || previewDoc) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedSeller, previewDoc]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, sortBy, pageSize]);

  useEffect(() => {
    const currentSeq = ++requestSeq.current;

    const loadSellers = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await adminApi.getActiveSellers({
          q: debouncedSearch || undefined,
          category: categoryFilter !== "all" ? categoryFilter : undefined,
          sort: sortBy,
          page,
          limit: pageSize,
        });

        if (currentSeq !== requestSeq.current) return;

        const payload = response.data?.result || {};
        const items = Array.isArray(payload.items) ? payload.items : [];
        const normalizedItems = items.map(normalizeSeller);

        setSellers(normalizedItems);
        setStats({
          ...emptyStats,
          ...payload.stats,
        });
        setCategories(
          Array.isArray(payload.filters?.categories) ? payload.filters.categories : [],
        );
        setTotal(safeNumber(payload.total) || normalizedItems.length);
        setTotalPages(safeNumber(payload.totalPages) || 1);
        setLastSyncAt(new Date());

        if (safeNumber(payload.totalPages) > 0 && page > payload.totalPages) {
          setPage(payload.totalPages);
        }
      } catch (err) {
        if (currentSeq !== requestSeq.current) return;
        console.error("Failed to load active sellers", err);
        const message =
          err.response?.data?.message || "Failed to load active sellers";
        setError(message);
        toast.error(message);
      } finally {
        if (currentSeq === requestSeq.current) {
          setLoading(false);
        }
      }
    };

    loadSellers();
  }, [debouncedSearch, categoryFilter, sortBy, page, pageSize, refreshTick]);

  const handleDeleteSeller = async (sellerId) => {
    if (!window.confirm("Are you sure you want to delete this store? This action cannot be undone.")) return;
    setIsDeleting(true);
    try {
      await adminApi.rejectSeller(sellerId, { reason: "Deleted by Admin" });
      toast.success("Store deleted successfully");
      setSelectedSeller(null);
      setRefreshTick((t) => t + 1);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete store");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartEdit = (seller) => {
    setEditFormData({
      name: seller.ownerName || seller.name || "",
      shopName: seller.shopName || "",
      email: seller.email || "",
      phone: seller.phone || "",
      category: seller.category || "General",
      serviceRadius: seller.serviceRadius || 5,
      address: seller.address || seller.location || "",
      description: seller.description || "",
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedSeller?.id) return;
    setIsSavingEdit(true);
    try {
      await adminApi.updateSeller(selectedSeller.id, editFormData);
      toast.success("Seller details updated successfully");
      setIsEditing(false);
      setSelectedSeller((prev) => ({
        ...prev,
        ...editFormData,
        ownerName: editFormData.name,
        location: editFormData.address || prev.location,
      }));
      setRefreshTick((t) => t + 1);
    } catch (err) {
      console.error("Failed to update seller", err);
      toast.error(err.response?.data?.message || "Failed to update seller details");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const summaryCards = useMemo(
    () => [
      {
        label: "Active Sellers",
        value: stats.totalActiveSellers.toLocaleString("en-IN"),
        icon: HiOutlineBuildingOffice2,
        color: "blue",
        note: "Verified and live",
      },
      {
        label: "Gross Revenue",
        value: currency(stats.totalRevenue),
        icon: HiOutlineArrowTrendingUp,
        color: "emerald",
        note: "Delivered order value",
      },
      {
        label: "Total Orders",
        value: stats.totalOrders.toLocaleString("en-IN"),
        icon: HiOutlineDocumentText,
        color: "amber",
        note: "Lifetime order volume",
      },
      {
        label: "New This Month",
        value: stats.newThisMonth.toLocaleString("en-IN"),
        icon: HiOutlineCalendarDays,
        color: "rose",
        note: "Recently approved",
      },
    ],
    [stats],
  );

  return (
    <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-2 duration-700 pb-16 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 flex items-center gap-3">
            Active Sellers
            <Badge
              variant="success"
              className="text-xs px-2.5 py-0.5 font-bold uppercase tracking-wider"
            >
              Live
            </Badge>
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Review every verified seller, their performance, and current store health.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setRefreshTick((value) => value + 1)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-white ring-1 ring-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-xs cursor-pointer"
            title="Refresh active sellers"
          >
            <HiOutlineArrowPath className={cn("h-4 w-4 text-slate-600", loading && "animate-spin")} />
            <span>Refresh</span>
          </button>
          <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2.5 rounded-xl ring-1 ring-slate-200 text-xs font-bold text-slate-700">
            <HiOutlineClock className="h-4 w-4 text-slate-500" />
            <span className="uppercase tracking-wider">
              {lastSyncAt
                ? `Synced ${lastSyncAt.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : "Sync pending"}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Stats - Compacted */}
      <div className="flex flex-wrap gap-3 items-center">
        {summaryCards.map((card) => (
          <Card
            key={card.label}
            className="border-none shadow-xs ring-1 ring-slate-200/80 px-4 py-2.5 bg-white rounded-lg w-full sm:w-56 md:w-60 shrink-0"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                  {card.label}
                </p>
                <h4 className="text-2xl font-black text-slate-900 mt-0.5">
                  {card.value}
                </h4>
              </div>
              <div
                className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                  statClass[card.color] || "bg-brand-50 text-brand-600",
                )}
              >
                <card.icon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Search & Filters */}
      <Card className="border-none shadow-xl ring-1 ring-slate-200/80 p-4 bg-white rounded-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <HiOutlineMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by store name, owner, email, phone or location..."
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200/70 rounded-xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all placeholder:text-slate-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full lg:w-auto">
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="px-4 py-2.5 bg-white ring-1 ring-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-50 transition-all"
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="px-4 py-2.5 bg-white ring-1 ring-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-50 transition-all"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="border-none shadow-xl ring-1 ring-slate-200/80 overflow-hidden rounded-xl bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="text-xs uppercase tracking-wider font-bold text-slate-500 px-6 py-3.5">Store Entity</th>
                <th className="text-xs uppercase tracking-wider font-bold text-slate-500 px-6 py-3.5">Performance</th>
                <th className="text-xs uppercase tracking-wider font-bold text-slate-500 px-6 py-3.5">Business Intel</th>
                <th className="text-xs uppercase tracking-wider font-bold text-slate-500 px-6 py-3.5">Status</th>
                <th className="text-xs uppercase tracking-wider font-bold text-slate-500 px-6 py-3.5 !text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <HiOutlineArrowPath className="h-8 w-8 text-slate-400 animate-spin" />
                      <p className="text-slate-600 font-bold text-base">
                        Loading active sellers...
                      </p>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="5" className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-16 w-16 rounded-full bg-rose-50 flex items-center justify-center">
                        <HiOutlineXMark className="h-8 w-8 text-rose-500" />
                      </div>
                      <p className="text-base font-bold text-slate-700">{error}</p>
                      <button
                        onClick={() => setRefreshTick((value) => value + 1)}
                        className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all"
                      >
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : sellers.length > 0 ? (
                sellers.map((seller) => (
                  <tr key={seller.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4.5 align-middle">
                      <div className="flex items-center gap-4">
                        <div className="h-11 w-11 rounded-xl overflow-hidden bg-slate-100 ring-2 ring-slate-100 flex items-center justify-center shrink-0">
                          <img
                            src={seller.avatar}
                            alt={seller.shopName}
                            className="h-full w-full object-cover"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        </div>
                        <div>
                          <p className="text-base font-bold text-slate-900 group-hover:text-primary transition-colors">
                            {seller.shopName}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs font-semibold text-slate-500">
                              {seller.ownerName}
                            </span>
                            <span className="h-1 w-1 rounded-full bg-slate-300" />
                            <span className="text-[11px] font-bold text-brand-600 uppercase tracking-wide">
                              {seller.category || "General"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4.5 align-middle">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-slate-900">
                            {(seller.totalOrders || 0).toLocaleString("en-IN")} Orders
                          </span>
                          <span className="text-xs font-bold text-brand-600">
                            {currency(seller.totalRevenue)}
                          </span>
                        </div>
                        <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-500 rounded-full"
                            style={{
                              width: `${Math.min(100, seller.fulfillmentRate || 0)}%`,
                            }}
                          />
                        </div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                          {(seller.fulfillmentRate || 0)}% fulfillment
                        </p>
                      </div>
                    </td>

                    <td className="px-6 py-4.5 align-middle">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-slate-800">
                          <HiOutlineDocumentText className="h-4 w-4 text-slate-500" />
                          <span className="text-xs font-bold text-slate-800">
                            {(seller.productCount || 0).toLocaleString("en-IN")} products
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-700">
                          <HiOutlineMapPin className="h-4 w-4 text-slate-500 shrink-0" />
                          <span className="text-xs font-semibold text-slate-700 truncate max-w-[260px]">
                            {seller.location || "Location not set"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500">
                          <HiOutlineCalendarDays className="h-4 w-4 text-slate-400" />
                          <span className="text-xs font-semibold text-slate-500">
                            Joined {seller.joinedDate || "N/A"}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4.5 align-middle">
                      <div className="flex flex-col gap-1.5">
                        <Badge
                          variant="success"
                          className="w-fit text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider"
                        >
                          Active
                        </Badge>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Last order: {seller.lastOrderLabel || "No orders yet"}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4.5 text-right align-middle">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedSeller(seller)}
                          className="h-9 px-4 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-primary transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                        >
                          <HiOutlineEye className="h-4 w-4" />
                          VIEW PROFILE
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center">
                        <HiOutlineBuildingOffice2 className="h-8 w-8 text-slate-300" />
                      </div>
                      <p className="text-slate-700 font-bold text-base">
                        No active sellers found.
                      </p>
                      <p className="text-xs font-semibold text-slate-400">
                        Try a different search or filter.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4">
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          loading={loading}
        />
      </div>

      {/* Seller Profile / Edit Modal */}
      <AnimatePresence>
        {selectedSeller && (
          <div className="fixed inset-0 z-[120] overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-3 sm:p-4 lg:p-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-slate-950/75 backdrop-blur-md"
                onClick={() => {
                  if (!isSavingEdit) {
                    setSelectedSeller(null);
                    setIsEditing(false);
                  }
                }}
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 24 }}
                className="relative z-10 w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col my-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="flex items-start justify-between p-5 lg:p-6 border-b border-slate-100 shrink-0 bg-white z-20">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-2xl overflow-hidden bg-slate-100 ring-4 ring-white shadow-lg shrink-0">
                      <img
                        src={selectedSeller.avatar}
                        alt={selectedSeller.shopName}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div>
                      <h3 className="text-2xl lg:text-3xl font-black text-slate-900 leading-tight">
                        {selectedSeller.shopName}
                      </h3>
                      <p className="text-sm font-bold text-slate-600 mt-0.5">
                        Owned by {selectedSeller.ownerName}
                      </p>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="success"
                          className="text-xs px-2.5 py-0.5 font-bold uppercase tracking-wider"
                        >
                          Active
                        </Badge>
                        <Badge
                          variant="primary"
                          className="text-xs px-2.5 py-0.5 font-bold uppercase tracking-wider"
                        >
                          {selectedSeller.category || "General"}
                        </Badge>
                        {isEditing && (
                          <Badge
                            variant="warning"
                            className="text-xs px-2.5 py-0.5 font-bold uppercase tracking-wider animate-pulse"
                          >
                            Editing
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedSeller(null);
                      setIsEditing(false);
                    }}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                  >
                    <HiOutlineXMark className="h-6 w-6 text-slate-500" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="overflow-y-auto flex-1 overscroll-contain">
                  {isEditing ? (
                    /* Edit Form */
                    <div className="flex flex-col min-h-full">
                      <div className="p-6 lg:p-8 space-y-5 flex-1">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                          <div>
                            <h4 className="text-lg font-black text-slate-900">Edit Store Information</h4>
                            <p className="text-xs font-semibold text-slate-500">Update verified seller profile, contact, and operations.</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Shop / Store Name *</label>
                            <input
                              type="text"
                              value={editFormData.shopName}
                              onChange={(e) => setEditFormData({ ...editFormData, shopName: e.target.value })}
                              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all"
                              placeholder="Store Name"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Owner Name *</label>
                            <input
                              type="text"
                              value={editFormData.name}
                              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all"
                              placeholder="Owner Name"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Business Email *</label>
                            <input
                              type="email"
                              value={editFormData.email}
                              onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all"
                              placeholder="seller@email.com"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Phone Number *</label>
                            <input
                              type="text"
                              value={editFormData.phone}
                              onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all"
                              placeholder="10-digit phone"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Category</label>
                            <input
                              type="text"
                              value={editFormData.category}
                              onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all"
                              placeholder="e.g. Grocery, Fruits & Vegetables"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Service Radius (km)</label>
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={editFormData.serviceRadius}
                              onChange={(e) => setEditFormData({ ...editFormData, serviceRadius: Number(e.target.value) || 5 })}
                              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all"
                            />
                          </div>

                          <div className="space-y-1.5 md:col-span-2">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Store Full Address</label>
                            <textarea
                              rows="2"
                              value={editFormData.address}
                              onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all"
                              placeholder="Complete store location and address..."
                            />
                          </div>

                          <div className="space-y-1.5 md:col-span-2">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Store Note / Description</label>
                            <textarea
                              rows="2"
                              value={editFormData.description}
                              onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all"
                              placeholder="Optional store description or note..."
                            />
                          </div>
                        </div>
                      </div>

                      {/* Sticky Edit Footer */}
                      <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm p-4 px-6 lg:px-8 border-t border-slate-100 flex items-center justify-end gap-3 z-10">
                        <button
                          type="button"
                          onClick={() => setIsEditing(false)}
                          disabled={isSavingEdit}
                          className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          disabled={isSavingEdit}
                          className="px-5 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          {isSavingEdit ? (
                            <HiOutlineArrowPath className="h-4 w-4 animate-spin" />
                          ) : (
                            <HiOutlineCheck className="h-4 w-4" />
                          )}
                          Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                  /* Standard Profile View */
                  <div className="grid grid-cols-1 lg:grid-cols-12">
                    {/* Left Column: Contact, Health, Documents */}
                    <div className="lg:col-span-5 bg-slate-50/80 p-5 lg:p-6 border-r border-slate-100 space-y-6">
                      {/* Contact Info */}
                      <div className="space-y-3">
                        <p className="text-xs font-black text-slate-500 uppercase tracking-wider">
                          Contact Details
                        </p>
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 text-slate-800">
                            <HiOutlineEnvelope className="h-4 w-4 text-slate-500 shrink-0" />
                            <span className="text-xs font-bold break-all">
                              {selectedSeller.email || "N/A"}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-slate-800">
                            <HiOutlinePhone className="h-4 w-4 text-slate-500 shrink-0" />
                            <span className="text-xs font-bold">
                              {selectedSeller.phone || "N/A"}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-slate-800">
                            <HiOutlineMapPin className="h-4 w-4 text-slate-500 shrink-0" />
                            <span className="text-xs font-bold leading-relaxed">
                              {selectedSeller.location || "Location not set"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Store Health */}
                      <div className="space-y-3">
                        <p className="text-xs font-black text-slate-500 uppercase tracking-wider">
                          Store Health
                        </p>
                        <div className="p-4 bg-white rounded-2xl ring-1 ring-slate-200 space-y-3">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                            <span>Verification</span>
                            <span className="text-brand-600 font-extrabold">Verified & Active</span>
                          </div>
                          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                            <span>Joined Date</span>
                            <span className="text-slate-900 font-extrabold">{selectedSeller.joinedDate || "N/A"}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                            <span>Service Radius</span>
                            <span className="text-slate-900 font-extrabold">{selectedSeller.serviceRadius || 5} km</span>
                          </div>
                          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                            <span>Last Order</span>
                            <span className="text-slate-900 font-extrabold">{selectedSeller.lastOrderLabel || "No orders yet"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Submitted Documents */}
                      <div className="space-y-3">
                        <p className="text-xs font-black text-slate-500 uppercase tracking-wider">
                          Verification Documents
                        </p>
                        {Array.isArray(selectedSeller.documentFiles) && selectedSeller.documentFiles.length > 0 ? (
                          <div className="space-y-2">
                            {selectedSeller.documentFiles.map((doc, idx) => (
                              <div
                                key={doc.key || idx}
                                className="p-3 bg-white rounded-xl ring-1 ring-slate-200 flex items-center justify-between gap-3 shadow-xs hover:border-brand-300 transition-all"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                    <HiOutlineDocumentText className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-900 truncate">
                                      {doc.label}
                                    </p>
                                    <p className="text-[10px] font-semibold text-slate-400 truncate">
                                      {doc.isViewable ? "Uploaded file" : doc.value || "Submitted"}
                                    </p>
                                  </div>
                                </div>
                                {doc.isViewable && doc.url ? (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewDoc(doc)}
                                    className="px-2.5 py-1 bg-brand-50 hover:bg-brand-600 text-brand-600 hover:text-white rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1"
                                    title="View document in viewer"
                                  >
                                    <HiOutlineEye className="h-3.5 w-3.5" />
                                    <span>View</span>
                                  </button>
                                ) : (
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">Verified</span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : Array.isArray(selectedSeller.documents) && selectedSeller.documents.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {selectedSeller.documents.map((doc, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg ring-1 ring-blue-100 uppercase"
                              >
                                {doc}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="p-3 bg-white rounded-xl ring-1 ring-slate-200 text-xs font-bold text-slate-400 text-center">
                            No documents submitted
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Column: Performance & Stats */}
                    <div className="lg:col-span-7 p-5 lg:p-6 bg-white flex flex-col justify-between space-y-6">
                      <div className="space-y-6">
                        {/* 6 Metrics Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                          {[
                            {
                              label: "Orders",
                              value: (selectedSeller.totalOrders || 0).toLocaleString("en-IN"),
                            },
                            { label: "Revenue", value: currency(selectedSeller.totalRevenue) },
                            {
                              label: "Products",
                              value: (selectedSeller.productCount || 0).toLocaleString("en-IN"),
                            },
                            {
                              label: "Delivered",
                              value: (selectedSeller.deliveredOrders || 0).toLocaleString("en-IN"),
                            },
                            {
                              label: "Pending",
                              value: (selectedSeller.pendingOrders || 0).toLocaleString("en-IN"),
                            },
                            {
                              label: "Fulfillment",
                              value: `${selectedSeller.fulfillmentRate || 0}%`,
                            },
                          ].map((item) => (
                            <div
                              key={item.label}
                              className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100"
                            >
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                                {item.label}
                              </p>
                              <p className="text-xl font-black text-slate-900">{item.value}</p>
                            </div>
                          ))}
                        </div>

                        {/* Performance & Average order value */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div className="p-4 rounded-2xl bg-brand-50 border border-brand-100">
                            <p className="text-xs font-black text-brand-600 uppercase tracking-wider mb-1">
                              Performance
                            </p>
                            <p className="text-sm font-bold text-slate-800 leading-relaxed">
                              {(selectedSeller.fulfillmentRate || 0)}% of orders completed successfully.
                            </p>
                          </div>
                          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                            <p className="text-xs font-black text-slate-600 uppercase tracking-wider mb-1">
                              Avg Order Value
                            </p>
                            <p className="text-sm font-bold text-slate-800 leading-relaxed">
                              {currency(selectedSeller.avgOrderValue)}
                            </p>
                          </div>
                        </div>

                        {selectedSeller.description && (
                          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                            <p className="text-xs font-black text-slate-600 uppercase tracking-wider mb-1">
                              Store Note
                            </p>
                            <p className="text-xs font-medium text-slate-700 leading-relaxed">
                              {selectedSeller.description}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Action Footer */}
                      <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                        <button
                          onClick={() => handleStartEdit(selectedSeller)}
                          className="px-4 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                        >
                          <HiOutlinePencilSquare className="h-4 w-4" />
                          Edit Store
                        </button>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleDeleteSeller(selectedSeller.id)}
                            disabled={isDeleting}
                            className="px-4 py-2.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold hover:bg-rose-600 hover:text-white transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                          >
                            {isDeleting ? (
                              <HiOutlineArrowPath className="h-4 w-4 animate-spin" />
                            ) : (
                              <HiOutlineTrash className="h-4 w-4" />
                            )}
                            Delete Store
                          </button>
                          <button
                            onClick={() => {
                              setSelectedSeller(null);
                              setIsEditing(false);
                            }}
                            className="px-4 py-2.5 bg-slate-100 text-slate-800 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all cursor-pointer"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>

      {/* In-App Document Preview Modal */}
      <AnimatePresence>
        {previewDoc && (
          <div className="fixed inset-0 z-[130] overflow-y-auto">
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

export default ActiveSellers;
