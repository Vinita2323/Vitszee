import React, { useState, useEffect } from "react";
import {
  Bell,
  Star,
  TrendingUp,
  Package,
  MapPin,
  CheckCircle,
  XCircle,
  IndianRupee,
  AlertCircle,
  LocateFixed,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";

import { useAuth } from "@core/context/AuthContext";
import { deliveryApi } from "../services/deliveryApi";
import DeliveryAvatar from "../components/DeliveryAvatar";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [isOnline, setIsOnline] = useState(user?.isOnline || false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [locationText, setLocationText] = useState("Fetching location...");
  const [isDetecting, setIsDetecting] = useState(false);
  const [activeTab, setActiveTab] = useState("delivery"); // 'delivery' or 'return'
  const [availableOrders, setAvailableOrders] = useState([]);
  const [ongoingOrder, setOngoingOrder] = useState(null);
  const [earnings, setEarnings] = useState({
    today: 0,
    deliveries: 0,
    incentives: 0,
    cashCollected: 0,
    ongoingCount: 0,
  });

  // Sync isOnline with user profile from context
  useEffect(() => {
    if (user) {
      setIsOnline(user.isOnline);
    }
  }, [user]);

  // Fetch human-readable location using Google Maps via our backend
  const fetchAddress = async (lat, lng) => {
    try {
      const response = await deliveryApi.geocodeAddress(`${lat},${lng}`);
      if (response.data.success && response.data.result) {
        const address = response.data.result.formattedAddress;
        
        // Extract city/locality from the formatted address for a shorter display
        const parts = address.split(',').map(p => p.trim());
        // Simple heuristic: if it's long, take the first two meaningful parts, else take it all.
        if (parts.length > 3) {
           const shortName = `${parts[Math.max(0, parts.length - 4)]}, ${parts[parts.length - 3]}`;
           setLocationText(shortName.replace(/[0-9]{6}/g, '').trim()); 
        } else {
           setLocationText(address);
        }
      } else {
        setLocationText("Current Location");
      }
    } catch (error) {
      setLocationText("Current Location");
    }
  };

  useEffect(() => {
    import("../utils/deliveryLastLocation.js").then(({ getCachedDeliveryPartnerLocation }) => {
      const loc = getCachedDeliveryPartnerLocation();
      if (!loc) {
        setLocationText("Location not available");
        return;
      }
      fetchAddress(loc.lat, loc.lng);
    });
  }, []);

  const handleDetectLocation = async () => {
    setIsDetecting(true);
    setLocationText("Detecting...");
    try {
      const { getCurrentPositionWithCache } = await import("../utils/deliveryLastLocation.js");
      getCurrentPositionWithCache(
        (loc) => {
          fetchAddress(loc.lat, loc.lng);
          setIsDetecting(false);
          toast.success("Location updated");
        },
        () => {
          setLocationText("Failed to detect");
          setIsDetecting(false);
          toast.error("Could not get your location. Please check GPS permissions.");
        },
        { maxCacheAgeMs: 0 } // Force a fresh read
      );
    } catch (error) {
      setIsDetecting(false);
      setLocationText("Current Location");
    }
  };

  const fetchStats = async () => {
    try {
      const response = await deliveryApi.getStats();
      if (response.data.success) {
        console.log("Stats Fetched:", response.data.result);
        setEarnings((prev) => ({
          ...prev,
          ...response.data.result,
        }));
      }
    } catch (error) {
      console.error("Failed to fetch statistics:", error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const response = await deliveryApi.getNotifications();
      if (response.data.success && response.data.result) {
        setUnreadCount(response.data.result.unreadCount || 0);
      }
    } catch (error) {
      console.error("Failed to fetch notifications");
    }
  };

  const fetchAvailableOrders = async () => {
    try {
      const response = await deliveryApi.getAvailableOrders({ type: activeTab });
      if (response.data.success) {
        const orders = response.data.results || response.data.result || [];
        setAvailableOrders(orders);
      }
    } catch (error) {
      console.error("Failed to fetch available orders:", error);
    }
  };

  const fetchOngoingOrder = async () => {
    try {
      const response = await deliveryApi.getOrderHistory({ status: 'all' });
      const orders = response.data?.results ?? response.data?.result ?? [];
      const active = orders.find(o => 
         o.displayStatus === "active" || o.displayStatus === "active return" ||
         (!o.displayStatus && o.status !== "delivered" && o.status !== "cancelled")
      );
      setOngoingOrder(active || null);
    } catch (error) {
      console.error("Failed to fetch ongoing order:", error);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchNotifications();
    if (isOnline) {
      fetchAvailableOrders();
      fetchOngoingOrder();
    }
  }, [isOnline, activeTab]);

  const handleOnlineToggle = async () => {
    const newStatus = !isOnline;
    try {
      await deliveryApi.updateProfile({ isOnline: newStatus });
      await refreshUser(); // Refresh global auth state
      setIsOnline(newStatus);
      if (newStatus) {
        toast.success("You are now ONLINE. Finding orders...");
      } else {
        toast.info("You are now OFFLINE. No new orders.");
      }
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleAcceptReturn = async (orderId) => {
    try {
      const response = await deliveryApi.acceptReturnPickup(orderId);
      if (response.data.success) {
        toast.success("Return pickup accepted!");
        fetchAvailableOrders();
        // Option: navigate to details
        navigate(`/delivery/order-details/${orderId}`);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to accept return");
    }
  };

  return (
    <div className="bg-white min-h-screen pb-28 relative overflow-hidden font-sans">
      
      {/* Deep Green Header Banner */}
      <div className="bg-[#1A4516] text-white pt-3 pb-10 px-6 relative">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div
              className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/20 shadow-md cursor-pointer"
              onClick={() => navigate("/delivery/profile")}
            >
              <DeliveryAvatar user={user} />
            </div>
            <div>
              <h2 className="text-[16px] font-black leading-tight tracking-tight">
                Hi, {user?.name?.split(" ")[0] || "Partner"} 👋
              </h2>
              <div className="flex items-center mt-0.5 space-x-2">
                <p className="text-xs text-white/70 font-medium flex items-center max-w-[200px] truncate">
                  <MapPin size={12} className="mr-1 shrink-0" />
                  <span className="truncate">{locationText}</span>
                </p>
                <button
                  onClick={handleDetectLocation}
                  disabled={isDetecting}
                  className="p-1 bg-white/10 hover:bg-white/20 rounded-full transition-colors flex-shrink-0"
                  title="Detect Location"
                >
                  <LocateFixed size={12} className={`text-white ${isDetecting ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          <div
            className="relative p-2.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full transition-colors cursor-pointer"
            onClick={() => navigate("/delivery/notifications")}
          >
            <Bell size={20} className="text-white" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 border-2 border-[#1A4516] rounded-full animate-pulse"></span>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area overlapping with rounded corners */}
      <div className="bg-white rounded-t-[32px] -mt-5 pt-4 px-4 space-y-3 relative z-10">
        
        {/* Today's Overview Section */}
        <div>
          <h3 className="text-[13px] font-bold text-gray-800 mb-2">Today's Overview</h3>
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white py-2 px-1 rounded-xl text-center border border-gray-100 shadow-sm flex flex-col justify-center min-h-[68px]">
              <span className="text-[17px] font-bold text-gray-900 block leading-none">{earnings.deliveries}</span>
              <span className="text-[9px] text-gray-400 font-bold block mt-1">Orders</span>
            </div>
            <div className="bg-white py-2 px-1 rounded-xl text-center border border-gray-100 shadow-sm flex flex-col justify-center min-h-[68px]">
              <span className="text-[17px] font-bold text-gray-900 block leading-none">{earnings.deliveries}</span>
              <span className="text-[9px] text-gray-400 font-bold block mt-1">Completed</span>
            </div>
            <div className="bg-white py-2 px-1 rounded-xl text-center border border-gray-100 shadow-sm flex flex-col justify-center min-h-[68px]">
              <span className="text-[17px] font-bold text-gray-900 block leading-none">₹{earnings.today}</span>
              <span className="text-[9px] text-gray-400 font-bold block mt-1">Earnings</span>
            </div>
          </div>
        </div>

        {/* Today's Earnings Card */}
        <Card className="bg-white p-3.5 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-bold text-gray-400">Today's Earnings</span>
            <button
              onClick={() => navigate("/delivery/earnings")}
              className="text-[#1A4516] text-[10px] font-bold hover:underline"
            >
              View Details
            </button>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <div className="text-xl font-black text-gray-900 tracking-tight leading-none">₹{earnings.today}</div>
              <span className="text-[10px] font-bold text-emerald-600 flex items-center mt-1 whitespace-nowrap">
                <TrendingUp size={10} className="mr-0.5 shrink-0" /> +₹120 vs yesterday
              </span>
            </div>
            {/* Sparkline Graphic (SVG Line) matching user image */}
            <div className="w-20 h-8">
              <svg viewBox="0 0 100 40" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="sparkline-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1A4516" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#1A4516" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path
                  d="M5,30 Q25,12 40,25 T75,8 T100,5"
                  fill="none"
                  stroke="#1A4516"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M5,30 Q25,12 40,25 T75,8 T100,5 L100,40 L5,40 Z"
                  fill="url(#sparkline-grad)"
                />
                <circle cx="100" cy="5" r="3" fill="#1A4516" />
              </svg>
            </div>
          </div>
        </Card>

        {/* Current Status (Toggle Card) */}
        <Card className="bg-white py-2.5 px-3.5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <span className="text-xs font-bold text-gray-800">Current Status</span>
          <div className="flex items-center">
            <button
              onClick={handleOnlineToggle}
              className={`w-18 h-6.5 rounded-full transition-all duration-300 relative flex items-center px-1 ${
                isOnline ? "bg-[#1A4516]" : "bg-gray-200"
              }`}
            >
              {isOnline ? (
                <>
                  <span className="text-[9px] font-bold text-white ml-1">Online</span>
                  <div className="w-4.5 h-4.5 bg-white rounded-full absolute right-1 shadow-sm" />
                </>
              ) : (
                <>
                  <div className="w-4.5 h-4.5 bg-white rounded-full absolute left-1 shadow-sm" />
                  <span className="text-[9px] font-bold text-gray-400 ml-auto mr-1">Offline</span>
                </>
              )}
            </button>
          </div>
        </Card>

        {/* Action List Section */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-100">
          
          {/* New Orders Item */}
          <button
            onClick={() => {
              if (isOnline) {
                setActiveTab("delivery");
              } else {
                toast.error("Please go online to check available orders");
              }
            }}
            className="w-full flex items-center justify-between py-2.5 px-3.5 hover:bg-gray-50/50 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100/30">
                <Package size={15} />
              </div>
              <span className="text-xs font-bold text-gray-700">New Orders</span>
            </div>
            <span className="h-5 w-5 rounded-full bg-[#1A4516] text-white text-[9px] font-black flex items-center justify-center">
              {availableOrders.length}
            </span>
          </button>

          {/* Ongoing Orders Item */}
          <button
            onClick={() => {
              if (earnings.ongoingCount > 0) {
                navigate("/delivery/history");
              } else {
                toast.info("No ongoing order currently");
              }
            }}
            className="w-full flex items-center justify-between py-2.5 px-3.5 hover:bg-gray-50/50 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-100/30">
                <MapPin size={15} />
              </div>
              <span className="text-xs font-bold text-gray-700">Ongoing Orders</span>
            </div>
            <span className="h-5 w-5 rounded-full bg-[#1A4516] text-white text-[9px] font-black flex items-center justify-center">
              {earnings.ongoingCount || 0}
            </span>
          </button>

          {/* Completed Orders Item */}
          <button
            onClick={() => navigate("/delivery/history")}
            className="w-full flex items-center justify-between py-2.5 px-3.5 hover:bg-gray-50/50 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-green-50 text-[#1A4516] flex items-center justify-center border border-green-100/30">
                <CheckCircle size={15} />
              </div>
              <span className="text-xs font-bold text-gray-700">Completed Orders</span>
            </div>
            <span className="h-5 w-5 rounded-full bg-[#1A4516] text-white text-[9px] font-black flex items-center justify-center">
              {earnings.deliveries}
            </span>
          </button>
        </div>

        {/* Dynamic Orders List Section (from availability) */}
        {isOnline && (
          <div className="pt-2">
            <AnimatePresence mode="wait">
              {activeTab === 'delivery' ? (
                availableOrders.length > 0 ? (
                  <motion.div
                    key="waiting"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm text-center"
                  >
                    <div className="flex justify-center mb-3">
                      <div className="w-12 h-12 rounded-full bg-[#1A4516]/10 flex items-center justify-center">
                        <Package className="text-[#1A4516]" size={24} />
                      </div>
                    </div>
                    <h3 className="text-sm font-bold text-gray-900 mb-1">
                      {availableOrders.length === 1
                        ? "1 order waiting"
                        : `${availableOrders.length} orders waiting`}
                    </h3>
                    <p className="text-xs text-gray-500 leading-relaxed px-1">
                      A fullscreen alert will open with Accept and Reject. Use that to respond before the timer ends.
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      <span className="w-2 h-2 bg-[#1A4516] rounded-full animate-pulse" />
                      Listening for assignments
                    </div>
                  </motion.div>
                ) : ongoingOrder ? (
                  <motion.div
                    key="ongoing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="bg-[#1A4516] rounded-2xl p-5 text-white shadow-lg relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <Package size={80} />
                    </div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shadow-sm">
                          <LocateFixed size={14} className="text-white animate-pulse" />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">Ongoing Order</span>
                      </div>
                      <h3 className="text-xl font-black mb-1">#{ongoingOrder.orderId}</h3>
                      <p className="text-xs text-white/80 mb-5 truncate max-w-[80%] font-medium">
                        {ongoingOrder.historyJobType === 'RETURN' ? 'Return Pickup' : 'Delivery to Customer'}
                      </p>
                      <Button onClick={() => navigate(`/delivery/order-details/${ongoingOrder.orderId}`)} variant="secondary" className="w-full bg-white text-[#1A4516] hover:bg-gray-50 font-bold border-0 shadow-sm py-2.5">
                        View Order Details
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="searching"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="bg-white rounded-2xl p-5 text-center border border-dashed border-gray-200 relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-[#1A4516]/5 opacity-50"></div>
                    <div className="relative z-10">
                      <div className="relative w-12 h-12 mx-auto mb-2.5">
                        <div className="absolute inset-0 bg-[#1A4516]/10 rounded-full animate-ping opacity-20"></div>
                        <div className="absolute inset-1 bg-[#1A4516]/10 rounded-full animate-ping opacity-40 delay-150"></div>
                        <div className="relative w-full h-full bg-[#1A4516]/5 rounded-full flex items-center justify-center border border-[#1A4516]/10 shadow-sm">
                          <MapPin size={20} className="text-[#1A4516]" />
                        </div>
                      </div>
                      <h3 className="text-xs font-bold mb-1 text-gray-800">
                        Finding Orders Nearby...
                      </h3>
                      <p className="text-[10px] text-gray-400 max-w-[180px] mx-auto">
                        We're looking for delivery requests in your area. Stay online!
                      </p>
                    </div>
                  </motion.div>
                )
              ) : (
                <motion.div
                  key="returns-list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4 text-left"
                >
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="text-sm font-bold text-gray-800 tracking-tight">Available Return Pickups</h3>
                    <span className="text-[10px] font-bold text-[#1A4516] bg-[#1A4516]/10 px-2 py-0.5 rounded-full uppercase italic">Open for Acceptance</span>
                  </div>
                  {availableOrders.length > 0 ? (
                    availableOrders.map((order) => (
                      <Card key={order._id} className="p-4 border border-gray-100 hover:border-[#1A4516]/30 transition-all shadow-sm bg-white rounded-2xl">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <span className="text-[10px] font-black text-[#1A4516]/60 uppercase tracking-widest mb-1 block">Return Task</span>
                            <h4 className="font-bold text-gray-900">#{order.orderId}</h4>
                          </div>
                          <div className="text-right">
                            <span className="block font-black text-[#1A4516] text-lg">₹{order.returnDeliveryCommission || 0}</span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Commission</span>
                          </div>
                        </div>
                        
                        <div className="space-y-2 mb-5">
                          <div className="flex items-center text-xs text-gray-600">
                            <MapPin size={12} className="mr-2 text-gray-400" />
                            <span className="truncate">{order.seller?.shopName || "Store"}</span>
                          </div>
                          <div className="flex items-center text-[11px] text-gray-500 font-medium">
                            <Package size={12} className="mr-2 text-gray-400" />
                            <span>Pickup from Customer & Return to Store</span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button 
                            variant="primary" 
                            size="sm" 
                            className="flex-1 font-black text-[10px] tracking-widest uppercase h-10 shadow-md bg-[#1A4516] hover:bg-[#0f2d0f] text-white rounded-xl"
                            onClick={() => handleAcceptReturn(order.orderId)}
                          >
                            Accept Pickup
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="px-4 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 hover:bg-gray-50 h-10 rounded-xl"
                            onClick={() => navigate(`/delivery/order-details/${order.orderId}`)}
                          >
                            View
                          </Button>
                        </div>
                      </Card>
                    ))
                  ) : (
                    <div className="bg-white rounded-3xl p-8 text-center border border-dashed border-gray-100 flex flex-col items-center">
                      <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100 opacity-60">
                        <Package size={20} className="text-gray-400" />
                      </div>
                      <h4 className="text-sm font-bold text-gray-800 mb-1">No returns nearby</h4>
                      <p className="text-[11px] text-gray-400">Keep checking back for new return tasks.</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
 
        {/* Go Online / Go Offline Action Button */}
        <button
          onClick={handleOnlineToggle}
          className="w-full py-3.5 rounded-2xl text-sm font-black uppercase tracking-wider transition-all duration-300 shadow-md bg-[#1A4516] hover:bg-[#0f2d0f] text-white shadow-[#1A4516]/10"
        >
          {isOnline ? "Go Offline" : "Go Online"}
        </button>

      </div>
    </div>
  );
};

export default Dashboard;
