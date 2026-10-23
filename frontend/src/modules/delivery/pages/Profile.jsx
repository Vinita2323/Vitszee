import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  Phone,
  Truck,
  CreditCard,
  FileText,
  HelpCircle,
  LogOut,
  Trash2,
  ChevronRight,
  Bell,
  Settings,
  ChevronDown,
  ChevronUp,
  Star,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import Button from "@/shared/components/ui/Button";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";
import axiosInstance from "@core/api/axios";
import { deliveryApi } from "../services/deliveryApi";
import DeliveryAvatar from "../components/DeliveryAvatar";

const Profile = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const appName = settings?.appName || "App";
  const [faqs, setFaqs] = useState([]);
  const [stats, setStats] = useState({ totalDeliveries: 0 });
  const [deleting, setDeleting] = useState(false);
  const [profile, setProfile] = useState(user);

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Delete your delivery account permanently? This cannot be undone. You will be signed out and cannot log in with this account again.",
    );
    if (!confirmed) return;

    const doubleCheck = window.confirm(
      "Are you sure you want to delete your account?",
    );
    if (!doubleCheck) return;

    setDeleting(true);
    try {
      await deliveryApi.deleteAccount();
      toast.success("Account deleted");
      await logout();
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to delete account";
      toast.error(message);
      setDeleting(false);
    }
  };

  useEffect(() => {
    setProfile(user);
  }, [user]);

  useEffect(() => {
    const fetchFaqs = async () => {
      try {
        const response = await axiosInstance.get("/public/faqs", {
          params: { category: "Delivery", status: "published" },
        });
        setFaqs(response.data.results || []);
      } catch (error) {
        console.error("Error fetching FAQs:", error);
      }
    };
    const fetchStats = async () => {
      try {
        const res = await deliveryApi.getStats();
        if (res.data.success || res.data.result) {
          setStats(res.data.result || { totalDeliveries: 0 });
        }
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };
    const fetchProfile = async () => {
      try {
        const res = await deliveryApi.getProfile();
        const data = res.data?.result;
        if (data) setProfile(data);
      } catch (error) {
        console.error("Error fetching profile:", error);
      }
    };
    fetchFaqs();
    fetchStats();
    fetchProfile();
  }, []);

  const menuItems = [
    {
      icon: User,
      label: "Personal Details",
      sub: "Name, Address, Email",
      color: "text-brand-600 bg-brand-50",
      path: "/delivery/profile/personal-details",
    },
    {
      icon: Truck,
      label: "Vehicle Information",
      sub: "Bike, License, Insurance",
      color: "text-orange-600 bg-orange-50",
      path: "/delivery/profile/vehicle-info",
    },
    {
      icon: Star,
      label: "My Reviews",
      sub: "Customer ratings & feedback",
      color: "text-amber-600 bg-amber-50",
      path: "/delivery/reviews",
    },
    {
      icon: CreditCard,
      label: "Bank Account",
      sub: "Bank details",
      color: "text-brand-600 bg-brand-50",
      path: "/delivery/profile/bank-account",
    },
    // Wallet / money request temporarily disabled
    {
      icon: FileText,
      label: "Documents",
      sub: "Aadhar, PAN, DL",
      color: "text-purple-600 bg-purple-50",
      path: "/delivery/profile/documents",
    },
    {
      icon: FileText,
      label: "Privacy Policy",
      sub: "How we use your data",
      color: "text-indigo-600 bg-indigo-50",
      path: "/delivery/privacy",
    },
    {
      icon: Settings,
      label: "Settings",
      sub: "Notifications, Language",
      color: "text-gray-600 bg-gray-50",
      path: "/delivery/profile/settings",
    },
    {
      icon: HelpCircle,
      label: "Help & Support",
      sub: "FAQs, Chat support",
      color: "text-teal-600 bg-teal-50",
      path: "/delivery/support",
    },
  ];

  return (
    <div className="bg-gray-50/50 min-h-full pb-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#09356E] via-[#0057B7] to-[#004494] pt-3 pb-8 px-4 rounded-b-2xl relative shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-white text-base font-black leading-tight tracking-tight">
            My Profile
          </h1>
          <button
            type="button"
            className="text-white hover:bg-white/20 h-7 w-7 rounded-full flex items-center justify-center"
            onClick={() => toast.info("No new notifications")}
            aria-label="Notifications"
          >
            <Bell size={16} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="w-12 h-12 bg-white rounded-full p-0.5 shadow-sm overflow-hidden">
              <DeliveryAvatar user={profile || user} />
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
          </div>
          <div className="text-white min-w-0">
            <h2 className="font-extrabold text-sm leading-snug truncate">
              {(profile || user)?.name || "Delivery Partner"}
            </h2>
            <p className="text-white/80 text-[11px] flex items-center truncate">
              <Phone size={11} className="mr-1 shrink-0" /> {(profile || user)?.phone || ""}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="bg-white/20 px-1.5 py-0.5 rounded text-[9px] font-bold">
                ID: {(profile || user)?._id ? String((profile || user)._id).substring(0, 6).toUpperCase() : ""}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-wide ${
                  (profile || user)?.isVerified
                    ? "bg-emerald-500 text-white"
                    : "bg-red-500 text-white"
                }`}
              >
                {(profile || user)?.isVerified ? "VERIFIED" : "UNVERIFIED"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Card */}
      <div className="mx-4 -mt-4 bg-white rounded-xl p-2.5 shadow-sm mb-3 flex justify-between text-center relative z-10 border border-gray-100/50">
        <div className="flex-1 py-0.5">
          <p className="text-gray-400 text-[8px] uppercase font-bold tracking-wider">
            Joined
          </p>
          <p className="font-bold text-gray-900 text-xs">
            {(profile || user)?.createdAt
              ? new Date((profile || user).createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  year: "2-digit",
                })
              : "New"}
          </p>
        </div>
        <div className="w-px bg-gray-100" />
        <div className="flex-1 py-0.5">
          <p className="text-gray-400 text-[8px] uppercase font-bold tracking-wider">
            Trips
          </p>
          <p className="font-bold text-gray-900 text-xs">
            {stats?.totalDeliveries || 0}
          </p>
        </div>
        <div className="w-px bg-gray-100" />
        <div className="flex-1 py-0.5">
          <p className="text-gray-400 text-[8px] uppercase font-bold tracking-wider">
            Rating
          </p>
          <p className="font-bold text-gray-900 text-xs flex justify-center items-center">
            {(profile || user)?.averageRating
              ? Number((profile || user).averageRating).toFixed(1)
              : (profile || user)?.rating
                ? Number((profile || user).rating).toFixed(1)
                : "N/A"}
            <span className="text-yellow-400 text-[10px] ml-0.5">★</span>
          </p>
        </div>
      </div>

      <div className="px-4 space-y-3 max-w-lg mx-auto">
        {/* Compact menu list */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
          {menuItems.map((item) => (
            <button
              key={item.path}
              type="button"
              className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-gray-50 active:bg-gray-100 transition-colors group"
              onClick={() => navigate(item.path)}
            >
              <div className="flex items-center min-w-0">
                <div
                  className={`p-1.5 rounded-lg mr-2.5 shrink-0 transition-colors ${item.color}`}
                >
                  <item.icon size={15} />
                </div>
                <div className="text-left min-w-0">
                  <p className="font-bold text-gray-900 text-[13px] leading-tight group-hover:text-primary transition-colors truncate">
                    {item.label}
                  </p>
                  <p className="text-[10px] text-gray-400 leading-tight truncate">
                    {item.sub}
                  </p>
                </div>
              </div>
              <ChevronRight
                size={16}
                className="text-gray-300 group-hover:text-primary transition-colors shrink-0 ml-2"
              />
            </button>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 overflow-hidden">
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
            Delivery Partner FAQs
          </p>
          <div className="divide-y divide-gray-50">
            {faqs.length > 0 ? (
              faqs.map((faq) => (
                <DeliveryFAQItem
                  key={faq._id}
                  question={faq.question}
                  answer={faq.answer}
                />
              ))
            ) : (
              <div className="py-2.5 text-center text-[11px] text-gray-400">
                No FAQs available
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <Button
            onClick={logout}
            variant="outline"
            className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 h-10 text-sm"
          >
            <LogOut size={16} className="mr-1.5" /> Logout
          </Button>
          <Button
            onClick={handleDeleteAccount}
            disabled={deleting}
            variant="outline"
            className="w-full border-red-300 text-red-700 bg-red-50 hover:bg-red-100 hover:text-red-800 h-10 text-sm disabled:opacity-60"
          >
            {deleting ? (
              <Loader2 size={16} className="mr-1.5 animate-spin" />
            ) : (
              <Trash2 size={16} className="mr-1.5" />
            )}
            {deleting ? "Deleting…" : "Delete Account"}
          </Button>
        </div>
      </div>

      <div className="text-center text-gray-400 text-[10px] mt-4 mb-2 leading-relaxed">
        {appName} Delivery Partner App
        <br />
        Version 1.2.0 (Build 450)
      </div>
    </div>
  );
};

const DeliveryFAQItem = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div
      className="py-2 px-1 cursor-pointer hover:bg-gray-50 transition-colors"
      onClick={() => setIsOpen(!isOpen)}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-gray-700 leading-snug">{question}</h3>
        {isOpen ? (
          <ChevronUp size={14} className="text-gray-400 shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-gray-400 shrink-0" />
        )}
      </div>
      {isOpen && (
        <p className="mt-1.5 text-[11px] text-gray-500 font-medium leading-relaxed">
          {answer}
        </p>
      )}
    </div>
  );
};

export default Profile;
