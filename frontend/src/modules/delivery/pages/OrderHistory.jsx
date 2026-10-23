import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Calendar,
  MapPin,
  Clock,
  ChevronRight,
  Filter,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "@/shared/components/ui/Card";
import { deliveryApi } from "../services/deliveryApi";
import { toast } from "sonner";

const displayOrderStatus = (order) => {
  if (order.displayStatus) return order.displayStatus;
  if (order?.workflowStatus === "DELIVERED" || order?.status === "delivered")
    return "delivered";
  if (order?.workflowStatus === "CANCELLED" || order?.status === "cancelled")
    return "cancelled";
  return order?.status || "active";
};

const OrderHistory = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const prevFilterRef = useRef(filter);
  const fetchSeqRef = useRef(0);
  const visibilityAbortRef = useRef(null);

  useEffect(() => {
    visibilityAbortRef.current?.abort();
    const filterChanged = prevFilterRef.current !== filter;
    prevFilterRef.current = filter;
    if (filterChanged) {
      setOrders([]);
    }

    const abortController = new AbortController();
    const runSeq = ++fetchSeqRef.current;

    setLoading(true);
    (async () => {
      try {
        const response = await deliveryApi.getOrderHistory(
          { status: filter },
          { signal: abortController.signal },
        );
        if (runSeq !== fetchSeqRef.current) return;
        const list =
          response.data?.results ?? response.data?.result ?? [];
        setOrders(Array.isArray(list) ? list : []);
      } catch (error) {
        if (
          error?.code === "ERR_CANCELED" ||
          error?.name === "CanceledError" ||
          error?.name === "AbortError"
        ) {
          return;
        }
        if (runSeq !== fetchSeqRef.current) return;
        toast.error("Failed to fetch order history");
      } finally {
        if (runSeq === fetchSeqRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      abortController.abort();
      visibilityAbortRef.current?.abort();
    };
  }, [filter]);

  useEffect(() => {
    let sawHidden = false;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        sawHidden = true;
        return;
      }
      if (!sawHidden || document.visibilityState !== "visible") return;
      sawHidden = false;

      visibilityAbortRef.current?.abort();
      const ac = new AbortController();
      visibilityAbortRef.current = ac;
      const runSeq = ++fetchSeqRef.current;
      setLoading(true);
      (async () => {
        try {
          const response = await deliveryApi.getOrderHistory(
            { status: filter },
            { signal: ac.signal },
          );
          if (runSeq !== fetchSeqRef.current) return;
          const list =
            response.data?.results ?? response.data?.result ?? [];
          setOrders(Array.isArray(list) ? list : []);
        } catch (error) {
          if (
            error?.code === "ERR_CANCELED" ||
            error?.name === "CanceledError" ||
            error?.name === "AbortError"
          ) {
            return;
          }
          if (runSeq !== fetchSeqRef.current) return;
          toast.error("Failed to fetch order history");
        } finally {
          if (runSeq === fetchSeqRef.current) {
            setLoading(false);
          }
        }
      })();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      visibilityAbortRef.current?.abort();
    };
  }, [filter]);

  const initialLoading = loading && orders.length === 0;
  const refreshing = loading && orders.length > 0;

  const filteredOrders = (orders || []).filter((order) => {
    const q = searchQuery.toLowerCase();
    const oid = String(order.orderId ?? "");
    return (
      oid.toLowerCase().includes(q) ||
      order.customer?.name?.toLowerCase().includes(q) ||
      order.seller?.shopName?.toLowerCase().includes(q)
    );
  });

  const openOrderDetail = (order) => {
    const id = order.orderId || order._id;
    if (!id) {
      toast.error("Missing order reference");
      return;
    }
    const typeQuery = order.historyJobType ? `?type=${order.historyJobType}` : '';
    navigate(`/delivery/order-details/${encodeURIComponent(String(id))}${typeQuery}`);
  };

  return (
    <div className="bg-white min-h-screen pb-28 relative overflow-hidden font-sans">
      
      {/* Brand Blue Header Banner */}
      <div className="bg-gradient-to-br from-[#09356E] via-[#0057B7] to-[#004494] text-white pt-4 pb-12 px-6 relative">
        <h1 className="text-lg font-black leading-tight tracking-tight mb-3">Order History</h1>
        
        {/* Search Input inside Header */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 group-focus-within:text-gray-400"
            size={16}
          />
          <input
            type="text"
            placeholder="Search Order ID, Customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white/10 text-white placeholder:text-white/50 rounded-xl text-xs focus:outline-none focus:bg-white focus:text-gray-900 focus:placeholder:text-gray-400 focus:ring-2 focus:ring-white/10 transition-all border border-white/5"
          />
        </div>
      </div>

      {/* Main Content Area overlapping with rounded corners */}
      <div className="bg-white rounded-t-[32px] -mt-5 pt-4 px-4 space-y-3.5 relative z-10">
        
        {/* Status Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar snap-x snap-mandatory">
          {["All", "Delivered", "Cancelled", "Returns"].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status.toLowerCase())}
              className={`snap-start h-8 px-4 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                filter === status.toLowerCase()
                  ? "bg-[#0057B7] text-white border-transparent shadow-md shadow-[#0057B7]/20"
                  : "bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100"
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Orders List */}
        <div className="space-y-3.5 max-w-lg mx-auto">
          {refreshing && (
            <div className="flex items-center justify-center gap-1.5 py-1 text-[11px] font-bold text-[#0057B7]">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#0057B7] border-t-transparent" />
              <span>Updating…</span>
            </div>
          )}
          
          {initialLoading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0057B7]"></div>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredOrders.length > 0 ? (
                filteredOrders.map((order) => (
                  <motion.div
                    key={order._id}
                    layout
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Card
                      role="button"
                      tabIndex={0}
                      onClick={() => openOrderDetail(order)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openOrderDetail(order);
                        }
                      }}
                      className="hover:shadow-sm transition-shadow cursor-pointer group bg-white border border-gray-100 rounded-xl"
                    >
                      <div className="p-3.5">
                        <div className="flex justify-between items-start mb-2.5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 min-w-0 flex-wrap">
                              <span className="font-bold text-gray-900 text-xs group-hover:text-[#0057B7] transition-colors break-all">
                                #{order.orderId} {order.historyJobType === 'RETURN' ? <span className="text-amber-600">(Return)</span> : ''}
                              </span>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                  displayOrderStatus(order) === "delivered"
                                    ? "bg-green-50 text-emerald-700 border border-green-100/30"
                                    : displayOrderStatus(order) === "cancelled"
                                    ? "bg-rose-50 text-rose-700 border border-rose-100/30"
                                    : "bg-blue-50 text-[#0057B7]"
                                }`}
                              >
                                {displayOrderStatus(order)}
                              </span>
                            </div>
                            <div className="flex items-center text-gray-400 text-[10px]">
                              <Calendar size={10} className="mr-1" />
                              {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="block font-black text-base text-[#0057B7] leading-none mb-0.5">
                              ₹{Math.round(order.displayEarnings ?? (order.paymentBreakdown?.riderPayoutTotal || ((order.pricing?.total || 0) * 0.1)))}
                            </span>
                            <span className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Earnings</span>
                          </div>
                        </div>

                        <div className="border-t border-b border-gray-100 py-2 my-2 space-y-1.5">
                          <div className="flex items-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 flex-shrink-0 shadow-[0_0_6px_rgba(34,197,94,0.4)]"></div>
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[10px] text-gray-400 font-bold uppercase shrink-0">Store:</span>
                              <span className="text-xs font-semibold text-gray-700 truncate">
                                {order.seller?.shopName || "Unknown Store"}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-2 flex-shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.4)]"></div>
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[10px] text-gray-400 font-bold uppercase shrink-0">Cust:</span>
                              <span className="text-xs font-semibold text-gray-700 truncate">
                                {order.customer?.name || "Customer"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-gray-500">
                          <div className="flex items-center gap-2">
                            <span className="flex items-center bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 font-medium">
                              <MapPin size={10} className="mr-0.5 text-gray-400" />{" "}
                              {order.distanceSnapshot?.distanceKmRounded || 2.4} km
                            </span>
                            <span className="flex items-center bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 font-medium">
                              <Clock size={10} className="mr-0.5 text-gray-400" /> {Math.round((order.distanceSnapshot?.distanceKmRounded || 2.4) * 6.25)} min
                            </span>
                          </div>
                          <div className="flex items-center text-[#0057B7] font-bold group-hover:underline">
                            View Details <ChevronRight size={12} className="ml-0.5" />
                          </div>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-16"
                >
                  <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3 border border-gray-100">
                    <Filter size={24} className="text-gray-400" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 mb-1">No Orders Found</h3>
                  <p className="text-gray-400 text-xs">Try changing your filters.</p>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderHistory;
