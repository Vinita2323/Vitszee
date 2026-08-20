import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";
import { UserRole } from "@core/constants/roles";
import {
  Mail,
  Lock,
  User,
  Phone,
  ArrowRight,
  Store,
  ShoppingBag,
  TrendingUp,
  Rocket,
  Globe,
  MapPin,
  LayoutList,
  FileText,
  Upload,
  CheckCircle,
  Navigation,
  Loader2,
  Eye,
  EyeOff,
  Calendar,
  Droplets,
} from "lucide-react";
import { toast } from "sonner";
import Lottie from "lottie-react";
import MapPicker from "../../../shared/components/MapPicker";
import { sellerApi } from "../services/sellerApi";

const createInitialVerificationState = () => ({
  status: "idle",
  otp: "",
  token: "",
  isOtpVisible: false,
  isSending: false,
  isVerifying: false,
  verifiedValue: "",
  timer: 0,
});

const REQUIRED_DOCUMENT_CONFIG = [
  { id: "tradeLicense", label: "Trade License" },
  { id: "gstCertificate", label: "GST Certificate" },
  { id: "idProof", label: "ID Proof" },
];

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [signupStep, setSignupStep] = useState(1);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const { login } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const appName = settings?.appName || "App";
  const logoUrl = "/LogoVitszee.png";
  const [verifications, setVerifications] = useState({
    email: createInitialVerificationState(),
    phone: createInitialVerificationState(),
  });

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    shopName: "",
    phone: "",
    locality: "",
    pincode: "",
    city: "",
    state: "",
    category: "",
    description: "",
    lat: null,
    lng: null,
    radius: 5,
    address: "",
    dob: "",
    bloodGroup: "",
  });

  React.useEffect(() => {
    const timerId = setInterval(() => {
      setVerifications((prev) => {
        let changed = false;
        const next = { ...prev };
        if (next.email.timer > 0) {
          next.email = { ...next.email, timer: next.email.timer - 1 };
          changed = true;
        }
        if (next.phone.timer > 0) {
          next.phone = { ...next.phone, timer: next.phone.timer - 1 };
          changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timerId);
  }, []);

  const handleLocationSelect = (location) => {
    setFormData((prev) => ({
      ...prev,
      lat: location.lat,
      lng: location.lng,
      radius: location.radius,
      address: location.address,
      locality: location.locality || prev.locality,
      pincode: location.pincode || prev.pincode,
      city: location.city || prev.city,
      state: location.state || prev.state,
    }));
  };

  const [documents, setDocuments] = useState({
    tradeLicense: null,
    gstCertificate: null,
    idProof: null,
  });

  const getMissingRequiredDocuments = () =>
    REQUIRED_DOCUMENT_CONFIG.filter((doc) => !documents[doc.id]);

  const updateVerificationState = (field, updates) => {
    setVerifications((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        ...updates,
      },
    }));
  };

  const resetVerificationState = (field) => {
    setVerifications((prev) => ({
      ...prev,
      [field]: createInitialVerificationState(),
    }));
  };

  const getVerificationPayload = (field) => {
    const channel = field === "email" ? "email" : "phone";
    return channel === "email"
      ? { channel, email: formData.email }
      : { channel, phone: formData.phone };
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "name") {
      // Owner name: only alphabets and spaces
      const cleaned = value.replace(/[^a-zA-Z\s]/g, "");
      setFormData({ ...formData, [name]: cleaned });
    } else if (name === "email") {
      // Business email: trim leading spaces, disallow spaces inside
      const cleaned = value.replace(/\s+/g, "").toLowerCase();
      if (cleaned !== formData.email) {
        resetVerificationState("email");
      }
      setFormData({ ...formData, [name]: cleaned });
    } else if (name === "phone") {
      // Contact number: only digits, max 10 characters
      const digitsOnly = value.replace(/[^0-9]/g, "").slice(0, 10);
      if (digitsOnly !== formData.phone) {
        resetVerificationState("phone");
      }
      setFormData({ ...formData, [name]: digitsOnly });
    } else if (name === "city" || name === "state") {
      // City & State: only alphabets and spaces
      const cleaned = value.replace(/[^a-zA-Z\s]/g, "");
      setFormData({ ...formData, [name]: cleaned });
    } else if (name === "pincode") {
      const digitsOnly = value.replace(/[^0-9]/g, "").slice(0, 6);
      setFormData({ ...formData, [name]: digitsOnly });
    } else if (name === "password") {
      // Password: allow any characters, min length 6
      setFormData({ ...formData, [name]: value });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleDocumentChange = (e, docName) => {
    setDocuments({ ...documents, [docName]: e.target.files[0] });
  };

  const handleSendVerificationOtp = async (field) => {
    const currentValue = formData[field];
    const isEmailField = field === "email";

    if (
      (isEmailField &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentValue || "")) ||
      (!isEmailField && !/^[0-9]{10}$/.test(currentValue || ""))
    ) {
      toast.error(
        isEmailField
          ? "Enter a valid email before requesting OTP."
          : "Enter a valid 10-digit phone number before requesting OTP.",
      );
      return;
    }

    updateVerificationState(field, {
      isSending: true,
      isOtpVisible: true,
      otp: "",
      token: "",
      status: "sending",
    });

    try {
      const response = await sellerApi.sendVerificationOtp(getVerificationPayload(field));
      const debugOtp = response?.data?.result?.debugOtp;
      updateVerificationState(field, {
        isSending: false,
        isOtpVisible: true,
        status: "otp-sent",
        timer: 60,
        otp: debugOtp || "",
      });
      toast.success(
        debugOtp
          ? `[Dev Mode] Verification code: ${debugOtp}`
          : isEmailField
            ? "Verification OTP sent to your email."
            : "Verification OTP sent to your phone."
      );
    } catch (error) {
      updateVerificationState(field, {
        isSending: false,
        status: "idle",
      });
      toast.error(error.response?.data?.message || "Failed to send OTP");
    }
  };

  const handleVerifyOtp = async (field) => {
    const verificationState = verifications[field];
    if (!/^\d{4}$/.test(verificationState.otp || "")) {
      toast.error("Enter a valid 4-digit OTP.");
      return;
    }

    updateVerificationState(field, {
      isVerifying: true,
    });

    try {
      const response = await sellerApi.verifyVerificationOtp({
        ...getVerificationPayload(field),
        otp: verificationState.otp,
      });
      const verificationToken =
        response.data?.result?.verificationToken || "";

      updateVerificationState(field, {
        isVerifying: false,
        isOtpVisible: false,
        status: "verified",
        otp: "",
        token: verificationToken,
        verifiedValue: formData[field],
      });
      toast.success(
        field === "email"
          ? "Email verified successfully."
          : "Phone number verified successfully.",
      );
    } catch (error) {
      updateVerificationState(field, {
        isVerifying: false,
      });
      toast.error(error.response?.data?.message || "Failed to verify OTP");
    }
  };

  const handlePanelWheel = (e) => {
    e.stopPropagation();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // Basic client-side validation for signup (step 1 fields)
      if (!isLogin) {
        const email = formData.email || "";
        const phone = formData.phone || "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          toast.error("Please enter a valid business email address.");
          setIsLoading(false);
          return;
        }
        if (!/^[0-9]{10}$/.test(phone)) {
          toast.error("Please enter a valid 10-digit contact number.");
          return;
        }
      }

      // Advance steps before password validation (password is set on step 1,
      // but validated only when the full submission is being made)
      if (!isLogin && signupStep < 3) {
        setSignupStep((prev) => prev + 1);
        return;
      }

      // Password: min 6 characters — only check when actually submitting
      const pwd = (formData.password || "").trim();
      if (pwd.length < 6) {
        toast.error(
          "Password must be at least 6 characters.",
        );
        return;
      }

      if (!isLogin) {
        const missingRequiredDocuments = getMissingRequiredDocuments();
        if (missingRequiredDocuments.length > 0) {
          toast.error(
            `Please upload all required documents: ${missingRequiredDocuments
              .map((doc) => doc.label)
              .join(", ")}`,
          );
          return;
        }
      }

      setIsLoading(true);
      // Note: backend expects a single address string, derive from city + state
      const address =
        formData.address ||
        [
          formData.locality,
          formData.city,
          formData.state,
          formData.pincode,
        ]
          .filter(Boolean)
          .join(", ");

      const response = isLogin
        ? await sellerApi.login({
          email: formData.email,
          password: formData.password,
        })
        : await (() => {
          const signupPayload = new FormData();

          Object.entries({
            ...formData,
            address,
            lat: formData.lat || 0,
            lng: formData.lng || 0,
            radius: formData.radius || 5,
          }).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== "") {
              signupPayload.append(key, value);
            }
          });

          Object.entries(documents).forEach(([key, file]) => {
            if (file) {
              signupPayload.append(key, file);
            }
          });

          return sellerApi.signup(signupPayload);
        })();

      if (isLogin) {
        const payload = response.data?.result || response.data;
        const { token, seller } = payload;
        
        login({
          ...seller,
          token,
          role: "seller",
        });
        toast.success("Welcome back, Partner!");
        
        // Use a slight delay and a hard redirect to ensure AuthContext 
        // state and localStorage are fully persisted and router mounts cleanly.
        setTimeout(() => {
          window.location.href = "/seller";
        }, 100);
      } else {
        setIsLogin(true);
        setSignupStep(1);
        setDocuments({
          tradeLicense: null,
          gstCertificate: null,
          idProof: null,
        });
        setFormData((prev) => ({
          ...prev,
          password: "",
        }));
        toast.success(
          "Application submitted. Login is enabled only after admin approval.",
        );
        navigate("/seller/pending-approval", {
          replace: true,
          state: {
            approvalRequired: true,
            applicationStatus: "pending",
          },
        });
      }
    } catch (error) {
      console.error("Seller Signup Error:", error);
      if (isLogin && error.response?.status === 403) {
        const applicationStatus =
          error.response?.data?.result?.applicationStatus || "pending";
        const rejectionReason =
          error.response?.data?.result?.rejectionReason || "";
        navigate("/seller/pending-approval", {
          replace: true,
          state: {
            approvalRequired: true,
            applicationStatus,
            rejectionReason,
          },
        });
        return;
      }
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        "Registration failed";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] p-4 sm:p-6 font-['Outfit',_sans-serif] overflow-hidden relative selection:bg-blue-500 selection:text-white">
      {/* Ambient Background with Soft Blue Glows */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full blur-[140px] bg-blue-400/15" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full blur-[140px] bg-sky-400/15" />
        <div className="absolute inset-0 bg-[radial-gradient(#0066ff0a_1px,transparent_1px)] [background-size:24px_24px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[1000px] min-h-[580px] bg-white rounded-3xl shadow-[0_20px_70px_-15px_rgba(0,102,255,0.12)] border border-blue-100 flex flex-col md:flex-row overflow-hidden">
        
        {/* Visual Side Panel - Modern Light Blue Seller Hub */}
        <div className="hidden md:flex w-[46%] bg-gradient-to-br from-blue-50/90 via-sky-50/50 to-indigo-50/60 relative flex-col justify-between p-8 lg:p-10 overflow-hidden text-slate-800 border-r border-blue-100">
          {/* Subtle Ambient Orbs */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full blur-3xl bg-blue-300/25" />
            <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full blur-3xl bg-sky-300/20" />
            <div className="absolute inset-0 bg-[radial-gradient(#0066ff08_1px,transparent_1px)] [background-size:20px_20px]" />
          </div>

          {/* Top Brand Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="relative z-10">
            <div className="flex items-center gap-3.5 mb-6">
              <div className="w-14 h-14 rounded-2xl p-2 flex items-center justify-center bg-white shadow-md shadow-blue-500/10 ring-1 ring-blue-100 flex-shrink-0">
                <img
                  src="/LogoVitszee.png"
                  alt={`${appName} Logo`}
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                  {appName}
                </h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                  <span className="text-[11px] font-bold text-blue-600 uppercase tracking-widest">
                    Merchant Portal
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-2xl font-black text-slate-900 leading-tight">
                Grow Your Business With Us
              </h3>
              <p className="text-xs text-slate-600 font-medium">
                Manage inventory, fulfill instant orders, and receive seamless payouts.
              </p>
            </div>
          </motion.div>

          {/* Center Features List */}
          <div className="relative z-10 space-y-3.5 my-6">
            {[
              { icon: Store, title: "Online Storefront", desc: "Instant digital shop setup & product catalog" },
              { icon: TrendingUp, title: "Live Revenue Tracking", desc: "Automated daily payouts & sales charts" },
              { icon: Rocket, title: "Instant Order Dispatch", desc: "Direct integration with our delivery fleet" },
            ].map((feat, idx) => {
              const Icon = feat.icon;
              return (
                <div
                  key={idx}
                  className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-white/80 border border-blue-100/90 shadow-sm shadow-blue-500/5 hover:bg-white hover:border-blue-200 transition-all"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/25 flex items-center justify-center flex-shrink-0">
                    <Icon size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 tracking-wide">
                      {feat.title}
                    </h4>
                    <p className="text-[11px] text-slate-500 font-medium">
                      {feat.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Trust Badge */}
          <div className="relative z-10 pt-4 border-t border-blue-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span className="flex items-center gap-1.5 font-semibold text-slate-600">
              <Globe size={15} className="text-blue-600" />
              Verified Merchant Network
            </span>
            <span className="text-blue-700 bg-blue-100/80 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold">
              SELLER v3.2
            </span>
          </div>
        </div>

        {/* Form Content Side */}
        <div
          className="w-full md:w-[55%] min-h-0 p-8 md:p-10 flex flex-col justify-center bg-white overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar relative"
          onWheelCapture={handlePanelWheel}
          style={{ WebkitOverflowScrolling: "touch" }}>
          
          <AnimatePresence mode="wait">
            <motion.div
              key={isLogin ? "login" : `signup-step-${signupStep}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className="space-y-6 py-2">
              
              <div className="space-y-2">
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                  {isLogin ? "Welcome Back!" : "Seller Register"}
                </h1>
                <p className="text-slate-500 font-medium text-xs">
                  {isLogin
                    ? "Seller Login"
                    : `Step ${signupStep} of 3: ${signupStep === 1 ? "Store Information" : signupStep === 2 ? "Location Setup" : "Verify Documents"}`}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* LOGIN OR SIGNUP STEP 1 */}
                {(isLogin || signupStep === 1) && (
                  <>
                    {!isLogin && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 ml-0.5">Owner Name</label>
                          <div className="relative group">
                            <input
                              type="text"
                              name="name"
                              required
                              placeholder="Owner Name"
                              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-[#1A4516] focus:ring-2 focus:ring-[#1A4516]/10 transition-all placeholder:text-slate-300"
                              value={formData.name}
                              onChange={handleChange}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 ml-0.5">Shop Name</label>
                          <div className="relative group">
                            <input
                              type="text"
                              name="shopName"
                              required
                              placeholder="Shop Name"
                              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-[#1A4516] focus:ring-2 focus:ring-[#1A4516]/10 transition-all placeholder:text-slate-300"
                              value={formData.shopName}
                              onChange={handleChange}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 ml-0.5">Email</label>
                      <div className="relative group">
                        <input
                          type="email"
                          name="email"
                          required
                          inputMode="email"
                          autoComplete="email"
                          placeholder="Enter your email"
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all placeholder:text-slate-300"
                          value={formData.email}
                          onChange={handleChange}
                        />
                      </div>
                    </div>

                    {!isLogin && (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 ml-0.5">Contact Number</label>
                        <div className="relative group">
                          <input
                            type="tel"
                            name="phone"
                            required
                            placeholder="Contact Number"
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all placeholder:text-slate-300"
                            value={formData.phone}
                            onChange={handleChange}
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 ml-0.5">Password</label>
                      <div className="relative group">
                        <input
                          type={showPassword ? "text" : "password"}
                          name="password"
                          required
                          minLength={6}
                          autoComplete="current-password"
                          placeholder="Enter your password"
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-[#1A4516] focus:ring-2 focus:ring-[#1A4516]/10 transition-all placeholder:text-slate-300 pr-12"
                          value={formData.password}
                          onChange={handleChange}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors px-2"
                          tabIndex="-1">
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    
                    {!isLogin && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 ml-0.5">Date of Birth</label>
                          <div className="relative group">
                            <input
                              type="date"
                              name="dob"
                              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-[#1A4516] focus:ring-2 focus:ring-[#1A4516]/10 transition-all placeholder:text-slate-300"
                              value={formData.dob}
                              onChange={handleChange}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 ml-0.5">Blood Group</label>
                          <div className="relative group">
                            <select
                              name="bloodGroup"
                              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-[#1A4516] focus:ring-2 focus:ring-[#1A4516]/10 transition-all appearance-none"
                              value={formData.bloodGroup}
                              onChange={handleChange}
                            >
                              <option value="" disabled>Select Blood Group</option>
                              <option value="A+">A+</option>
                              <option value="A-">A-</option>
                              <option value="B+">B+</option>
                              <option value="B-">B-</option>
                              <option value="O+">O+</option>
                              <option value="O-">O-</option>
                              <option value="AB+">AB+</option>
                              <option value="AB-">AB-</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* SIGNUP STEP 2 (Shop address and service area) */}
                {!isLogin && signupStep === 2 && (
                  <div className="space-y-3">
                    <div className="pt-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 ml-0.5">
                        Shop Location & Service Area
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsMapOpen(true)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border border-dashed transition-all cursor-pointer ${formData.lat
                          ? "border-emerald-200 bg-emerald-50/20"
                          : "border-slate-200 bg-slate-50 hover:border-slate-300"
                          }`}>
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`p-1.5 rounded-md ${formData.lat ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-600 shadow-xs"}`}>
                            {formData.lat ? (
                              <CheckCircle className="w-3.5 h-3.5" />
                            ) : (
                              <MapPin className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <div className="text-left">
                            <p
                              className={`text-[11px] font-extrabold ${formData.lat ? "text-emerald-800" : "text-slate-600"}`}>
                              {formData.lat
                                ? "Location Selected"
                                : "Pin Shop on Map"}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium truncate max-w-[200px]">
                              {formData.lat
                                ? `${formData.address} (${formData.radius}km)`
                                : "Precisely mark your shop location"}
                            </p>
                          </div>
                        </div>
                        {formData.lat && (
                          <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full uppercase tracking-tighter">
                            Verified
                          </span>
                        )}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 ml-0.5">Locality</label>
                        <input
                          type="text"
                          name="locality"
                          required
                          placeholder="Locality / Area"
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-[#1A4516] focus:ring-2 focus:ring-[#1A4516]/10 transition-all placeholder:text-slate-300"
                          value={formData.locality}
                          onChange={handleChange}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 ml-0.5">Pincode</label>
                        <input
                          type="text"
                          name="pincode"
                          required
                          placeholder="Pincode"
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-[#1A4516] focus:ring-2 focus:ring-[#1A4516]/10 transition-all placeholder:text-slate-300"
                          value={formData.pincode}
                          onChange={handleChange}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 ml-0.5">City</label>
                        <input
                          type="text"
                          name="city"
                          required
                          placeholder="City"
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-[#1A4516] focus:ring-2 focus:ring-[#1A4516]/10 transition-all placeholder:text-slate-300"
                          value={formData.city}
                          onChange={handleChange}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 ml-0.5">State</label>
                        <input
                          type="text"
                          name="state"
                          required
                          placeholder="State"
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-[#1A4516] focus:ring-2 focus:ring-[#1A4516]/10 transition-all placeholder:text-slate-300"
                          value={formData.state}
                          onChange={handleChange}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 ml-0.5">Full Address</label>
                      <textarea
                        name="address"
                        rows={2}
                        required
                        placeholder="Full address details"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-[#1A4516] focus:ring-2 focus:ring-[#1A4516]/10 transition-all placeholder:text-slate-300 resize-none"
                        value={formData.address}
                        onChange={handleChange}
                      />
                    </div>
                  </div>
                )}

                {/* SIGNUP STEP 3 (Verification documents) */}
                {!isLogin && signupStep === 3 && (
                  <div className="space-y-3">
                    <div className="pt-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 ml-0.5">
                        Verification Documents
                      </p>
                      <div className="space-y-2.5">
                        {REQUIRED_DOCUMENT_CONFIG.map((doc) => (
                          <div key={doc.id} className="relative">
                            <input
                              type="file"
                              id={doc.id}
                              className="hidden"
                              accept="image/*,.pdf"
                              onChange={(e) => handleDocumentChange(e, doc.id)}
                            />
                            <label
                              htmlFor={doc.id}
                              className={`flex items-center justify-between p-3 rounded-lg border border-dashed transition-all cursor-pointer ${documents[doc.id]
                                ? "border-emerald-200 bg-emerald-50/20"
                                : "border-slate-200 bg-slate-50 hover:border-slate-300"
                                }`}>
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`p-1.5 rounded-md ${documents[doc.id] ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-600 shadow-xs"}`}>
                                  {documents[doc.id] ? (
                                    <CheckCircle className="w-3.5 h-3.5" />
                                  ) : (
                                    <Upload className="w-3.5 h-3.5" />
                                  )}
                                </div>
                                <div className="text-left">
                                  <p
                                    className={`text-[11px] font-extrabold ${documents[doc.id] ? "text-emerald-800" : "text-slate-600"}`}>
                                    {doc.label}
                                  </p>
                                  <p className="text-[10px] text-slate-400 font-medium truncate max-w-[150px]">
                                    {documents[doc.id]
                                      ? documents[doc.id].name
                                      : "Upload secure PDF or image"}
                                  </p>
                                </div>
                              </div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Remember Me checkbox & Forgot password */}
                {isLogin && (
                  <div className="flex items-center justify-between px-1 text-xs">
                    <label className="flex items-center gap-1.5 font-semibold text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-[#1A4516] focus:ring-[#1A4516]"
                      />
                      Remember me
                    </label>
                    <button
                      type="button"
                      className="font-bold text-[#1A4516] hover:text-[#133A10] transition-colors"
                      onClick={() => toast.info("Please contact admin to reset your password.")}
                    >
                      Forgot Password?
                    </button>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  {!isLogin && signupStep > 1 && (
                    <button
                      type="button"
                      onClick={() => setSignupStep((prev) => Math.max(1, prev - 1))}
                      className="w-1/3 bg-slate-100 text-slate-600 rounded-lg py-3 text-xs font-black tracking-wider transition-all hover:bg-slate-200">
                      BACK
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className={`${!isLogin && signupStep > 1 ? "w-2/3" : "w-full"} bg-[#1A4516] hover:bg-[#133A10] text-white rounded-lg py-3 text-xs font-black tracking-widest shadow-md transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 group cursor-pointer`}>
                    {isLoading
                      ? "WORKING..."
                      : isLogin
                        ? "Login"
                        : signupStep < 3
                          ? "NEXT STEP"
                          : "SUBMIT APPLICATION"}
                    <ArrowRight
                      className="group-hover:translate-x-1 transition-transform"
                      size={16}
                    />
                  </button>
                </div>
              </form>

              <div className="pt-2.5 border-t border-slate-100 flex flex-col items-center gap-2.5 text-center">
                {!isLogin && (
                  <p className="text-slate-500 font-bold text-xs">
                    Already part of us?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setIsLogin(true);
                        setSignupStep(1);
                        setVerifications({
                          email: createInitialVerificationState(),
                          phone: createInitialVerificationState(),
                        });
                      }}
                      className="text-[#1A4516] hover:text-[#133A10] font-extrabold transition-colors px-1">
                      Sign In
                    </button>
                  </p>
                )}
                
                {isLogin && (
                  <p className="text-slate-400 font-medium text-[10px]">
                    Want to register your store?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setIsLogin(false);
                        setSignupStep(1);
                      }}
                      className="text-[#1A4516] hover:underline font-bold"
                    >
                      Register here
                    </button>
                  </p>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Bottom Tagline */}
      <div className="absolute bottom-6 flex items-center gap-4 text-slate-300 text-[10px] font-black uppercase tracking-[6px] pointer-events-none">
        Empowering Business Digitalization
      </div>

      {isMapOpen && (
        <MapPicker
          isOpen={isMapOpen}
          onClose={() => setIsMapOpen(false)}
          onConfirm={handleLocationSelect}
          preferCurrentLocationOnOpen={true}
          initialLocation={
            formData.lat ? { lat: formData.lat, lng: formData.lng } : null
          }
          initialRadius={formData.radius}
        />
      )}
    </div>
  );
};

export default Auth;
