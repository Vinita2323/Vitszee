import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Phone,
  ArrowRight,
  CheckCircle,
  ShieldCheck,
  ChevronLeft,
  User,
  Bike,
  ChevronDown,
  Mail,
  MapPin,
  FileText,
  Upload,
  X,
  Camera,
  XCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Lottie from "lottie-react";
import deliveryRiding from "@/assets/Delivery Riding.json";
import { deliveryApi } from "../services/deliveryApi";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";
import { toast } from "sonner";
import Tesseract from "tesseract.js";

const VEHICLE_TYPES = [
  { value: "bike", label: "Bike" },
  { value: "scooter", label: "Scooter" },
  { value: "cycle", label: "Cycle" },
];

const DeliveryAuth = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const appName = settings?.appName || "App";
  const logoUrl = "/LogoVitszee.png";
  const { login, user, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated && user?.role === "delivery") {
      navigate("/delivery/dashboard");
    }
  }, [isAuthenticated, user, navigate]);

  // mode: "login" | "signup"
  const [mode, setMode] = useState("login");
  const [step, setStep] = useState("form"); // "form" | "otp"

  // Login state
  const [loginPhone, setLoginPhone] = useState("");

  // Signup state
  const [signupStep, setSignupStep] = useState(1);
  const [signupName, setSignupName] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupAddress, setSignupAddress] = useState("");
  const [signupVehicle, setSignupVehicle] = useState("bike");
  const [signupVehicleNumber, setSignupVehicleNumber] = useState("");
  const [signupDLNumber, setSignupDLNumber] = useState("");
  const [signupPanNumber, setSignupPanNumber] = useState("");
  const [signupAadharNumber, setSignupAadharNumber] = useState("");
  const [signupAccountNumber, setSignupAccountNumber] = useState("");
  const [signupIfsc, setSignupIfsc] = useState("");
  const [signupAccountHolder, setSignupAccountHolder] = useState("");
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);
  const [profileImageFile, setProfileImageFile] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState("");

  // Document states
  const [aadharFile, setAadharFile] = useState(null);
  const [panFile, setPanFile] = useState(null);
  const [dlFile, setDlFile] = useState(null);

  // OTP state
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(30);

  // OCR States
  const [isScanning, setIsScanning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [dlVerified, setDlVerified] = useState(null);
  const [panVerified, setPanVerified] = useState(null);
  const [aadharVerified, setAadharVerified] = useState(null);

  useEffect(() => {
    let interval;
    if (step === "otp" && timer > 0) {
      interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [step, timer]);

  const handleDLUpload = (file) => {
    setDlFile(file || null);
  };

  const handlePanUpload = (file) => {
    setPanFile(file || null);
  };

  const handleAadharUpload = (file) => {
    setAadharFile(file || null);
  };

  const handleSendOtp = async () => {
    try {
      setLoading(true);
      if (mode === "login") {
        if (!loginPhone || loginPhone.length < 10) {
          toast.error("Please enter a valid 10-digit phone number");
          return;
        }
        const res = await deliveryApi.sendLoginOtp({ phone: loginPhone });
        toast.success(res.data?.message || "OTP sent!");
      } else {
        if (!signupName.trim()) { toast.error("Please enter your name"); return; }
        if (!signupPhone || signupPhone.length < 10) { toast.error("Please enter a valid 10-digit phone number"); return; }
        if (!profileImageFile) { toast.error("Please upload your profile photo"); return; }

        const formData = new FormData();
        formData.append("name", signupName.trim());
        formData.append("phone", signupPhone);
        formData.append("vehicleType", signupVehicle);
        formData.append("email", signupEmail);
        formData.append("address", signupAddress);
        formData.append("vehicleNumber", signupVehicleNumber);
        formData.append("drivingLicenseNumber", signupDLNumber);
        formData.append("accountHolder", signupAccountHolder);
        formData.append("accountNumber", signupAccountNumber);
        formData.append("ifsc", signupIfsc);

        if (profileImageFile) formData.append("profileImage", profileImageFile);
        if (aadharFile) formData.append("aadhar", aadharFile);
        if (panFile) formData.append("pan", panFile);
        if (dlFile) formData.append("dl", dlFile);

        const res = await deliveryApi.sendSignupOtp(formData);
        toast.success(res.data?.message || "OTP sent!");
      }
      setOtp(["", "", "", "", "", ""]);
      setTimer(60);
      setStep("otp");
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.some((d) => d === "") || !agreed) return;
    setLoading(true);
    try {
      const phone = mode === "login" ? loginPhone : signupPhone;
      const otpString = otp.join("");
      const response = await deliveryApi.verifyOtp({ phone, otp: otpString });
      const { token, delivery } = response.data.result;

      login({ ...delivery, token, role: "delivery" });

      toast.success("Welcome! Redirecting to dashboard...");
      navigate("/delivery/dashboard");
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    const cleaned = value.replace(/\D/g, "");
    if (!cleaned) {
      const newOtp = [...otp];
      newOtp[index] = "";
      setOtp(newOtp);
      return;
    }
    if (cleaned.length > 1) {
      const newOtp = [...otp];
      cleaned.slice(0, otp.length).split("").forEach((char, i) => {
        newOtp[i] = char;
      });
      setOtp(newOtp);
      const nextIndex = Math.min(cleaned.length, otp.length - 1);
      document.getElementById(`otp-${nextIndex}`)?.focus();
      return;
    }
    const newOtp = [...otp];
    newOtp[index] = cleaned[0];
    setOtp(newOtp);
    if (index < otp.length - 1) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setStep("form");
    setOtp(["", "", "", "", "", ""]);
    setLoginPhone("");
    setSignupStep(1);
    setSignupName("");
    setSignupPhone("");
    setSignupEmail("");
    setSignupAddress("");
    setSignupVehicle("bike");
    setSignupVehicleNumber("");
    setSignupDLNumber("");
    setSignupAccountNumber("");
    setSignupIfsc("");
    setSignupAccountHolder("");
    setAadharFile(null);
    setPanFile(null);
    setDlFile(null);
    setAgreed(false);
    setProfileImageFile(null);
    setProfileImagePreview("");
  };

  const slideVariants = {
    hidden: { opacity: 0, x: 30 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
    exit: { opacity: 0, x: -30, transition: { duration: 0.2 } },
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] flex flex-col items-center justify-center p-4 sm:p-6 font-['Outfit',_sans-serif] relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(#0057B70a_1px,transparent_1px)] [background-size:24px_24px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[420px] relative z-10"
      >
        {/* Main Card */}
        <div className="bg-white rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(0,87,183,0.12)] border border-slate-100 overflow-hidden pb-6">

          {/* Top Hero Banner matching project's primary blue theme */}
          <div className="relative h-[200px] sm:h-[220px] w-full overflow-hidden bg-gradient-to-br from-[#09356E] via-[#0057B7] to-[#004494]">
            {/* Subtle ambient lighting & pattern */}
            <div className="absolute inset-0 bg-[radial-gradient(#ffffff15_1px,transparent_1px)] [background-size:16px_16px] opacity-70 pointer-events-none" />
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-sky-400/25 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-8 -left-8 w-44 h-44 bg-blue-400/20 rounded-full blur-2xl pointer-events-none" />

            {/* Delivery Partner Badges */}
            <div className="relative z-10 pt-5 px-5 sm:px-6 flex justify-between items-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-white/95 text-[11px] font-bold tracking-wider uppercase">
                <Bike size={13} className="text-sky-300" />
                <span>Delivery Fleet</span>
              </div>
              <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-100/90 bg-black/25 backdrop-blur-sm px-2.5 py-1 rounded-full">
                <ShieldCheck size={12} className="text-sky-300" />
                <span>Partner Portal</span>
              </div>
            </div>

            {/* Smooth S-Curve Wave Divider matching CustomerAuth */}
            <div className="absolute -bottom-1 left-0 right-0 w-full leading-[0] z-10 pointer-events-none">
              <svg
                viewBox="0 0 1440 260"
                preserveAspectRatio="none"
                className="w-full h-14 sm:h-16"
              >
                <path
                  fill="#ffffff"
                  d="M0,128L48,138.7C96,149,192,171,288,160C384,149,480,107,576,106.7C672,107,768,149,864,165.3C960,181,1056,171,1152,149.3C1248,128,1344,96,1392,80L1440,64L1440,260L1392,260C1344,260,1248,260,1152,260C1056,260,960,260,864,260C768,260,672,260,576,260C480,260,384,260,288,260C192,260,96,260,48,260L0,260Z"
                />
              </svg>
            </div>
          </div>

          {/* Floating Centered Logo Card Protruding Down */}
          <div className="relative -mt-10 sm:-mt-12 flex justify-center z-20">
            <div className="w-32 sm:w-36 h-20 sm:h-22 rounded-3xl bg-white border-[3px] border-white shadow-[0_12px_32px_rgba(0,87,183,0.12)] p-2.5 flex items-center justify-center">
              <img
                src={logoUrl}
                alt={`${appName} Logo`}
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.target.style.display = "none";
                  if (e.target.nextSibling) e.target.nextSibling.style.display = "block";
                }}
              />
              <span
                style={{ display: "none" }}
                className="text-2xl font-black text-[#0057B7] tracking-tighter uppercase"
              >
                VITSZEE
              </span>
            </div>
          </div>

          {/* Segmented Pill Switcher: [ LOGIN ] | [ REGISTER ] */}
          {step === "form" && (
            <div className="flex bg-[#F1F5F9] rounded-2xl p-1 border border-slate-200/80 shadow-inner mt-4 mx-6">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={`flex-1 py-2.5 sm:py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                  mode === "login"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                LOGIN
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className={`flex-1 py-2.5 sm:py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                  mode === "signup"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                REGISTER
              </button>
            </div>
          )}

          {/* Headline & Subtitle */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`${mode}-${step}-title`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="text-center mt-4 px-6"
            >
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                {step === "otp"
                  ? "Verify OTP"
                  : mode === "login"
                    ? "Welcome Back!"
                    : "Join Fleet Team"}
              </h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-1 max-w-[280px] mx-auto font-medium">
                {step === "otp"
                  ? `Enter the 6-digit code sent to +91 ${mode === "login" ? loginPhone : signupPhone}`
                  : mode === "login"
                    ? "Login to continue your deliveries"
                    : `Step ${signupStep} of 4: ${signupStep === 1 ? "Personal Info" : signupStep === 2 ? "Vehicle Info" : signupStep === 3 ? "Bank Info" : "Documents"}`}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Multi-step progress bar for registration */}
          {mode === "signup" && step === "form" && (
            <div className="flex items-center justify-between gap-1.5 px-6 pt-3 pb-1">
              {[
                { num: 1, label: "Personal" },
                { num: 2, label: "Vehicle" },
                { num: 3, label: "Bank" },
                { num: 4, label: "Docs" },
              ].map((s) => (
                <div key={s.num} className="flex-1 flex flex-col items-center">
                  <div
                    className={`w-full h-1.5 rounded-full transition-all duration-300 ${
                      signupStep >= s.num ? "bg-[#0057B7]" : "bg-slate-200"
                    }`}
                  />
                  <span
                    className={`text-[9px] font-black mt-1 tracking-wider uppercase ${
                      signupStep === s.num
                        ? "text-[#0057B7]"
                        : signupStep > s.num
                          ? "text-slate-600"
                          : "text-slate-400"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Form Body */}
          <div className="p-6 pt-2">
            <AnimatePresence mode="wait">
              {step === "form" && (
                <motion.div
                  key={`form-${mode}`}
                  variants={slideVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="space-y-4"
                >
                  {/* ────────── SIGNUP MODE ────────── */}
                  {mode === "signup" && (
                    <div className="space-y-4">
                      {/* Step 1: Personal Information */}
                      {signupStep === 1 && (
                        <motion.div
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="space-y-3.5"
                        >
                          {/* Profile Photo Capture */}
                          <div className="flex flex-col items-center justify-center py-1">
                            <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 self-start ml-1">Profile Photo</label>
                            <div className="relative group">
                              <div className="w-24 h-24 rounded-3xl bg-blue-50/60 border-2 border-dashed border-blue-200 flex items-center justify-center overflow-hidden transition-all group-hover:border-[#0057B7]">
                                {profileImagePreview ? (
                                  <img src={profileImagePreview} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                  <User className="w-10 h-10 text-blue-400" />
                                )}
                              </div>
                              <input
                                type="file"
                                accept="image/*"
                                capture="user"
                                id="profile-upload"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files[0];
                                  if (file) {
                                    setProfileImageFile(file);
                                    setProfileImagePreview(URL.createObjectURL(file));
                                  }
                                }}
                              />
                              <label
                                htmlFor="profile-upload"
                                className="absolute -bottom-2 -right-2 p-2.5 bg-[#0057B7] text-white rounded-2xl shadow-md cursor-pointer hover:bg-[#004899] hover:scale-105 active:scale-95 transition-all shadow-blue-500/20"
                              >
                                <Camera className="w-4 h-4" />
                              </label>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold mt-2">Upload a clear photo of your face</p>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 uppercase tracking-wider ml-1">Full Name</label>
                            <div className="relative">
                              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                              <input
                                type="text"
                                value={signupName}
                                onChange={(e) => setSignupName(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 bg-[#F8FAF9] border border-slate-200/90 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0057B7]/15 focus:border-[#0057B7] transition-all placeholder:text-slate-400"
                                placeholder="Enter your full name"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 uppercase tracking-wider ml-1">Phone Number</label>
                            <div className="relative flex items-center bg-[#F8FAF9] border border-slate-200/90 rounded-2xl p-1 focus-within:border-[#0057B7] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#0057B7]/15 transition-all shadow-sm">
                              <div className="pl-3 pr-2 text-slate-400">
                                <Phone size={18} />
                              </div>
                              <div className="flex items-center text-sm font-black text-slate-700 pr-2.5 border-r border-slate-300">
                                +91
                              </div>
                              <input
                                type="tel"
                                inputMode="numeric"
                                value={signupPhone}
                                onChange={(e) => setSignupPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                                maxLength={10}
                                className="w-full bg-transparent border-none text-sm font-bold text-slate-900 outline-none pl-3 pr-3 py-2.5 placeholder:text-slate-400 tracking-wide"
                                placeholder="00000 00000"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 uppercase tracking-wider ml-1">Email Address</label>
                            <div className="relative">
                              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                              <input
                                type="email"
                                value={signupEmail}
                                onChange={(e) => setSignupEmail(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 bg-[#F8FAF9] border border-slate-200/90 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0057B7]/15 focus:border-[#0057B7] transition-all placeholder:text-slate-400"
                                placeholder="example@gmail.com"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 uppercase tracking-wider ml-1">Permanent Address</label>
                            <div className="relative">
                              <MapPin className="absolute left-4 top-3.5 text-slate-400 w-4 h-4" />
                              <textarea
                                value={signupAddress}
                                onChange={(e) => setSignupAddress(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 bg-[#F8FAF9] border border-slate-200/90 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0057B7]/15 focus:border-[#0057B7] transition-all resize-none h-20 placeholder:text-slate-400"
                                placeholder="Complete building address..."
                              />
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              if (!signupName || !signupPhone || !signupEmail || !signupAddress || !profileImageFile) {
                                toast.error("Please fill all personal information fields and upload photo");
                                return;
                              }
                              if (signupPhone.length !== 10) {
                                toast.error("Please enter a valid 10-digit phone number");
                                return;
                              }
                              setSignupStep(2);
                            }}
                            className="w-full py-3.5 bg-[#0057B7] hover:bg-[#004899] text-white rounded-2xl text-xs font-black tracking-widest uppercase shadow-lg shadow-blue-900/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2 mt-2"
                          >
                            Next Step <ArrowRight className="w-4 h-4" />
                          </button>
                        </motion.div>
                      )}

                      {/* Step 2: Vehicle Information */}
                      {signupStep === 2 && (
                        <motion.div
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="space-y-4"
                        >
                          <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 uppercase tracking-wider ml-1">Vehicle Type</label>
                            <div className="relative">
                              <Bike className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                              <button
                                type="button"
                                onClick={() => setShowVehicleDropdown(!showVehicleDropdown)}
                                className="w-full pl-11 pr-10 py-3 bg-[#F8FAF9] border border-slate-200/90 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none text-left"
                              >
                                {VEHICLE_TYPES.find((v) => v.value === signupVehicle)?.label}
                              </button>
                              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                              <AnimatePresence>
                                {showVehicleDropdown && (
                                  <motion.div
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-2xl shadow-xl mt-2 overflow-hidden z-20"
                                  >
                                    {VEHICLE_TYPES.map((v) => (
                                      <button
                                        key={v.value}
                                        onClick={() => { setSignupVehicle(v.value); setShowVehicleDropdown(false); }}
                                        className="w-full px-4 py-3 text-sm font-bold text-left hover:bg-blue-50 transition-colors"
                                      >
                                        {v.label}
                                      </button>
                                    ))}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 uppercase tracking-wider ml-1">Vehicle Plate Number</label>
                            <div className="relative">
                              <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                              <input
                                type="text"
                                value={signupVehicleNumber}
                                onChange={(e) => setSignupVehicleNumber(e.target.value.toUpperCase())}
                                className="w-full pl-11 pr-4 py-3 bg-[#F8FAF9] border border-slate-200/90 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0057B7]/15 focus:border-[#0057B7] transition-all placeholder:text-slate-400"
                                placeholder="KA 05 MN 8921"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 uppercase tracking-wider ml-1">Driving License Number</label>
                            <div className="relative">
                              <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                              <input
                                type="text"
                                value={signupDLNumber}
                                onChange={(e) => setSignupDLNumber(e.target.value.toUpperCase())}
                                className="w-full pl-11 pr-4 py-3 bg-[#F8FAF9] border border-slate-200/90 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0057B7]/15 focus:border-[#0057B7] transition-all placeholder:text-slate-400"
                                placeholder="DL-1420110012345"
                              />
                            </div>
                          </div>

                          <div className="flex gap-3 pt-2">
                            <button
                              onClick={() => setSignupStep(1)}
                              className="flex-1 py-3.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-2xl text-xs font-black uppercase tracking-wider transition-all"
                            >
                              Back
                            </button>
                            <button
                              onClick={() => {
                                if (!signupVehicleNumber) {
                                  toast.error("Please enter your vehicle plate number");
                                  return;
                                }
                                if (!signupDLNumber) {
                                  toast.error("Please enter your driving license number");
                                  return;
                                }
                                setSignupStep(3);
                              }}
                              className="flex-[2] py-3.5 bg-[#0057B7] hover:bg-[#004899] text-white rounded-2xl text-xs font-black tracking-widest uppercase shadow-lg shadow-blue-900/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                            >
                              Next Step <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        </motion.div>
                      )}

                      {/* Step 3: Bank Information */}
                      {signupStep === 3 && (
                        <motion.div
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="space-y-3.5"
                        >
                          <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 uppercase tracking-wider ml-1">Aadhar Number</label>
                            <input
                              type="text"
                              value={signupAadharNumber}
                              onChange={(e) => setSignupAadharNumber(e.target.value.replace(/\D/g, "").slice(0, 12))}
                              className="w-full px-4 py-3 bg-[#F8FAF9] border border-slate-200/90 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0057B7]/15 focus:border-[#0057B7] transition-all font-mono placeholder:text-slate-400"
                              placeholder="0000 0000 0000"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 uppercase tracking-wider ml-1">PAN Card Number</label>
                            <input
                              type="text"
                              value={signupPanNumber}
                              onChange={(e) => setSignupPanNumber(e.target.value.toUpperCase().slice(0, 10))}
                              className="w-full px-4 py-3 bg-[#F8FAF9] border border-slate-200/90 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0057B7]/15 focus:border-[#0057B7] transition-all font-mono placeholder:text-slate-400"
                              placeholder="ABCDE1234F"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 uppercase tracking-wider ml-1">Account Holder Name</label>
                            <input
                              type="text"
                              value={signupAccountHolder}
                              onChange={(e) => setSignupAccountHolder(e.target.value.toUpperCase())}
                              className="w-full px-4 py-3 bg-[#F8FAF9] border border-slate-200/90 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0057B7]/15 focus:border-[#0057B7] transition-all placeholder:text-slate-400"
                              placeholder="AS PER BANK RECORDS"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 uppercase tracking-wider ml-1">Account Number</label>
                            <input
                              type="text"
                              value={signupAccountNumber}
                              onChange={(e) => setSignupAccountNumber(e.target.value.replace(/\D/g, ""))}
                              className="w-full px-4 py-3 bg-[#F8FAF9] border border-slate-200/90 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0057B7]/15 focus:border-[#0057B7] transition-all placeholder:text-slate-400"
                              placeholder="000000000000"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 uppercase tracking-wider ml-1">IFSC Code</label>
                            <input
                              type="text"
                              value={signupIfsc}
                              onChange={(e) => setSignupIfsc(e.target.value.toUpperCase())}
                              className="w-full px-4 py-3 bg-[#F8FAF9] border border-slate-200/90 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0057B7]/15 focus:border-[#0057B7] transition-all placeholder:text-slate-400"
                              placeholder="HDFC0001234"
                            />
                          </div>

                          <div className="flex gap-3 pt-2">
                            <button
                              onClick={() => setSignupStep(2)}
                              className="flex-1 py-3.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-2xl text-xs font-black uppercase tracking-wider transition-all"
                            >
                              Back
                            </button>
                            <button
                              onClick={() => {
                                if (!signupAadharNumber || !signupPanNumber || !signupAccountHolder || !signupAccountNumber || !signupIfsc) {
                                  toast.error("Please fill all bank and identification fields");
                                  return;
                                }
                                if (signupAadharNumber.length !== 12) {
                                  toast.error("Aadhar number must be 12 digits");
                                  return;
                                }
                                if (signupPanNumber.length !== 10) {
                                  toast.error("PAN number must be 10 characters");
                                  return;
                                }
                                setSignupStep(4);
                              }}
                              className="flex-[2] py-3.5 bg-[#0057B7] hover:bg-[#004899] text-white rounded-2xl text-xs font-black tracking-widest uppercase shadow-lg shadow-blue-900/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                            >
                              Next Step <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        </motion.div>
                      )}

                      {/* Step 4: Documents Upload */}
                      {signupStep === 4 && (
                        <motion.div
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="space-y-3.5"
                        >
                          <div className="space-y-3">
                            {[
                              { label: "Aadhar Card (Front/Back)", state: aadharFile, setter: setAadharFile, id: "aadhar" },
                              { label: "PAN Card", state: panFile, setter: setPanFile, id: "pan" },
                              { label: "Driving License", state: dlFile, setter: setDlFile, id: "dl" },
                            ].map((doc) => (
                              <div key={doc.id} className="relative">
                                <input
                                  type="file"
                                  id={doc.id}
                                  className="hidden"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files[0];
                                    if (doc.id === "dl") handleDLUpload(file);
                                    else if (doc.id === "pan") handlePanUpload(file);
                                    else if (doc.id === "aadhar") handleAadharUpload(file);
                                    else doc.setter(file);
                                  }}
                                />
                                <label
                                  htmlFor={doc.id}
                                  className={`flex items-center justify-between p-3.5 rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
                                    doc.state
                                      ? "border-blue-300 bg-blue-50/50"
                                      : "border-slate-200 bg-[#F8FAF9] hover:border-blue-300 hover:bg-blue-50/30"
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-xl ${doc.state ? "bg-blue-100 text-[#0057B7]" : "bg-white text-slate-400 shadow-sm"}`}>
                                      {doc.state ? <CheckCircle className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                                    </div>
                                    <div className="text-left">
                                      <p className={`text-xs font-black uppercase tracking-tight ${doc.state ? "text-[#0057B7]" : "text-slate-700"}`}>
                                        {doc.label}
                                      </p>
                                      <p className="text-[10px] text-slate-400 font-bold truncate max-w-[180px]">
                                        {doc.state ? doc.state.name : "Tap to upload document"}
                                      </p>
                                    </div>
                                  </div>
                                  {doc.state && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        doc.setter(null);
                                      }}
                                      className="p-1.5 hover:bg-blue-100 rounded-lg text-[#0057B7] transition-colors"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </label>
                              </div>
                            ))}
                            <p className="text-[10px] text-slate-400 italic px-1 flex items-center gap-1.5">
                              <ShieldCheck className="w-3.5 h-3.5 text-[#0057B7]" />
                              Documents will be verified by our team after submission.
                            </p>
                          </div>

                          <div className="flex gap-3 pt-1">
                            <button
                              onClick={() => setSignupStep(3)}
                              className="flex-1 py-3.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-2xl text-xs font-black uppercase tracking-wider transition-all"
                            >
                              Back
                            </button>
                            <button
                              onClick={handleSendOtp}
                              disabled={loading || !dlFile || !panFile || !aadharFile}
                              className="flex-[2] py-3.5 bg-[#0057B7] hover:bg-[#004899] text-white rounded-2xl text-xs font-black tracking-widest uppercase shadow-lg shadow-blue-900/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              ) : (
                                <>
                                  Register <ArrowRight className="w-4 h-4" />
                                </>
                              )}
                            </button>
                          </div>
                        </motion.div>
                      )}

                      <p className="text-center text-xs text-slate-400 font-semibold pt-1">
                        By joining, you agree to our{" "}
                        <span className="text-[#0057B7] font-bold cursor-pointer hover:underline">Terms</span>{" "}
                        &amp;{" "}
                        <span className="text-[#0057B7] font-bold cursor-pointer hover:underline">Privacy Policy</span>
                      </p>
                    </div>
                  )}

                  {/* ────────── LOGIN MODE ────────── */}
                  {mode === "login" && (
                    <div className="space-y-4 pt-1">
                      {/* Phone */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 uppercase tracking-wider ml-1">
                          Phone Number
                        </label>
                        <div className="relative flex items-center bg-[#F8FAF9] border border-slate-200/90 rounded-2xl p-1.5 focus-within:border-[#0057B7] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#0057B7]/15 transition-all shadow-sm">
                          <div className="pl-3 pr-2 text-slate-400">
                            <Phone size={18} />
                          </div>
                          <div className="flex items-center text-sm font-black text-slate-700 pr-2.5 border-r border-slate-300">
                            +91
                          </div>
                          <input
                            type="tel"
                            inputMode="numeric"
                            value={loginPhone}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                              setLoginPhone(val);
                            }}
                            maxLength={10}
                            className="w-full bg-transparent border-none text-sm font-bold text-slate-900 outline-none pl-3 pr-3 py-2.5 placeholder:text-slate-400 placeholder:font-medium tracking-wide"
                            placeholder="98765 43210"
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleSendOtp}
                        disabled={loading}
                        className="w-full py-4 bg-[#0057B7] hover:bg-[#004899] text-white font-black text-xs uppercase tracking-[2px] rounded-2xl shadow-lg shadow-blue-900/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                      >
                        {loading ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            Login <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>

                      <p className="text-center text-sm text-slate-500 mt-4 font-medium">
                        Don't have an account?{" "}
                        <button
                          type="button"
                          onClick={() => switchMode("signup")}
                          className="text-[#0057B7] font-bold hover:underline"
                        >
                          Register
                        </button>
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ─── OTP STEP ─── */}
              {step === "otp" && (
                <motion.div
                  key="otp"
                  variants={slideVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="space-y-5 pt-2"
                >
                  {/* OTP Boxes */}
                  <div className="space-y-2 text-center">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                      Enter Security Code
                    </label>
                    <div className="flex justify-center gap-2 pt-1">
                      {otp.map((digit, index) => (
                        <input
                          key={index}
                          id={`otp-${index}`}
                          type="tel"
                          maxLength={1}
                          inputMode="numeric"
                          value={digit}
                          onChange={(e) => handleOtpChange(index, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(index, e)}
                          className="w-11 h-14 text-center text-xl font-black border-2 border-slate-200 rounded-2xl focus:border-[#0057B7] focus:ring-4 focus:ring-blue-500/10 outline-none transition-all bg-[#F8FAF9] text-slate-900"
                        />
                      ))}
                    </div>
                  </div>

                  {/* Timer / Resend */}
                  <div className="text-center">
                    {timer > 0 ? (
                      <p className="text-slate-400 text-sm font-medium">
                        Resend code in <span className="text-[#0057B7] font-bold">{timer}s</span>
                      </p>
                    ) : (
                      <button
                        onClick={handleSendOtp}
                        className="text-[#0057B7] font-black text-xs uppercase tracking-wider hover:underline"
                      >
                        Resend OTP
                      </button>
                    )}
                  </div>

                  {/* Terms checkbox */}
                  <div className="flex items-start gap-3 bg-[#F8FAF9] rounded-2xl p-4 border border-slate-200/80">
                    <input
                      id="terms"
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#0057B7] cursor-pointer"
                    />
                    <label htmlFor="terms" className="text-xs text-slate-600 leading-relaxed cursor-pointer font-medium">
                      I confirm my phone number is correct and I agree to the{" "}
                      <span className="text-[#0057B7] font-bold">Terms of Service</span> &amp;{" "}
                      <span className="text-[#0057B7] font-bold">Privacy Policy</span>.
                    </label>
                  </div>

                  {/* Verify Button */}
                  <button
                    onClick={handleVerifyOtp}
                    disabled={!agreed || otp.some((d) => !d) || loading}
                    className="w-full py-4 bg-[#0057B7] hover:bg-[#004899] text-white font-black text-xs uppercase tracking-[2px] rounded-2xl shadow-lg shadow-blue-900/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        Verify &amp; Login <CheckCircle className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  {/* Back */}
                  <button
                    onClick={() => { setStep("form"); setOtp(["", "", "", "", "", ""]); }}
                    className="w-full flex items-center justify-center gap-1.5 text-slate-400 hover:text-slate-600 text-xs font-bold uppercase tracking-wider transition-colors pt-1"
                  >
                    <ChevronLeft className="w-4 h-4" /> Edit Phone Number
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-center gap-3 opacity-60">
          <span className="h-px w-8 bg-slate-300" />
          <ShieldCheck className="text-[#0057B7] w-4 h-4" />
          <span className="h-px w-8 bg-slate-300" />
        </div>
        <p className="text-center text-[10px] font-black text-slate-400 uppercase tracking-[3px] mt-2">
          {appName} Partner Ecosystem • v1.0
        </p>
      </motion.div>
    </div>
  );
};

export default DeliveryAuth;
