import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";
import {
  Phone,
  ShieldCheck,
  User,
  ShoppingBag,
  ChevronLeft,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { customerApi } from "../services/customerApi";
import HeroFood from "@/assets/auth-hero-food.jpg";

const CustomerAuth = () => {
  const location = useLocation();
  const [isLogin, setIsLogin] = useState(location.pathname !== "/signup");
  const [isLoading, setIsLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [timer, setTimer] = useState(0);
  const { login } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const otpInputsRef = useRef([]);

  const [formData, setFormData] = useState({
    phone: "",
    otp: "",
    name: "",
    dob: "",
    bloodGroup: "",
  });

  useEffect(() => {
    setIsLogin(location.pathname !== "/signup");
  }, [location.pathname]);

  useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => setTimer((t) => t - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleSendOtp = async (e) => {
    e?.preventDefault();
    if (!formData.phone || formData.phone.length !== 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }

    if (!isLogin && !formData.name?.trim()) {
      toast.error("Please enter your full name");
      return;
    }

    setIsLoading(true);
    try {
      if (isLogin) {
        await customerApi.sendLoginOtp({ phone: formData.phone });
      } else {
        await customerApi.sendSignupOtp({
          name: formData.name.trim(),
          phone: formData.phone,
          dob: formData.dob || undefined,
          bloodGroup: formData.bloodGroup || undefined,
        });
      }
      setShowOtp(true);
      setTimer(60);
      toast.success(`OTP sent to +91 ${formData.phone}`);
    } catch (error) {
      const apiMessage = error?.response?.data?.message || "";
      const match = apiMessage.match(/wait (\d+)s/);
      if (match && match[1]) {
        setTimer(parseInt(match[1], 10));
      }
      toast.error(apiMessage || "Failed to send OTP. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    if (!formData.otp || formData.otp.length !== 4) {
      toast.error("Please enter the complete 4-digit OTP code");
      return;
    }
    setIsLoading(true);
    try {
      const response = await customerApi.verifyOtp({
        phone: formData.phone,
        otp: formData.otp,
      });
      const { token, customer } = response.data.result;
      login({ ...customer, token, role: "customer" });
      toast.success("Welcome to Vitszee!");
      navigate("/");
    } catch (error) {
      const apiMessage = error?.response?.data?.message;
      toast.error(apiMessage || "Invalid OTP. Please check and re-enter.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-white flex flex-col justify-between font-['Outfit',_sans-serif] overflow-x-hidden">
      {/* Centered App Container - Flush Full Width on Mobile, Max Width on Large Screens with No Outer Radius */}
      <div className="w-full max-w-md mx-auto min-h-screen bg-white flex flex-col justify-between">
        {/* Top Content Section */}
        <div className="w-full">
          {/* Top Hero Banner with Food Image & S-Curve Wave */}
          <div className="relative h-[240px] sm:h-[260px] w-full overflow-hidden bg-slate-900">
            <img
              src={HeroFood}
              alt="Food Inside"
              className="w-full h-full object-cover object-center scale-105"
            />
            {/* Dark Vignette Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/35 to-black/75" />

            {/* Top Bar: Bag Icon & "VITZEE MARKET" */}
            <div className="absolute top-5 left-5 right-5 flex items-center gap-2.5 z-10">
              <div className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-sm">
                <ShoppingBag size={18} strokeWidth={2.2} />
              </div>
              <span className="text-white font-black tracking-tight text-base sm:text-lg uppercase drop-shadow-md">
                VITZEE MARKET
              </span>
            </div>

            {/* Centered Big Hero Text: "FOOD INSIDE" */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pt-2 z-10 pointer-events-none">
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight uppercase leading-none drop-shadow-lg">
                FOOD INSIDE
              </h2>
              <p className="text-[10px] sm:text-[11px] font-bold text-white/90 uppercase tracking-[3px] mt-2 drop-shadow-sm">
                EVERYTHING DELIVERED FAST
              </p>
            </div>

            {/* Smooth S-Curve Wave Divider */}
            <div className="absolute -bottom-1 left-0 right-0 w-full leading-[0] z-10 pointer-events-none">
              <svg
                viewBox="0 0 1440 260"
                preserveAspectRatio="none"
                className="w-full h-16 sm:h-20"
              >
                <path
                  fill="#ffffff"
                  d="M0,128L48,138.7C96,149,192,171,288,160C384,149,480,107,576,106.7C672,107,768,149,864,165.3C960,181,1056,171,1152,149.3C1248,128,1344,96,1392,80L1440,64L1440,260L1392,260C1344,260,1248,260,1152,260C1056,260,960,260,864,260C768,260,672,260,576,260C480,260,384,260,288,260C192,260,96,260,48,260L0,260Z"
                />
              </svg>
            </div>
          </div>

          {/* Floating Centered Logo Card Protruding Down */}
          <div className="relative -mt-11 sm:-mt-12 flex justify-center z-20">
            <div className="w-32 sm:w-36 h-20 sm:h-24 rounded-3xl bg-white border-[3px] border-white shadow-[0_12px_32px_rgba(0,0,0,0.12)] p-2 flex items-center justify-center">
              <img
                src="/LogoVitszee.png"
                alt="Vitszee Logo"
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.target.style.display = "none";
                  e.target.nextSibling.style.display = "block";
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

          {/* Form Content Area */}
          <div className="px-6 pt-5 pb-6">
            <AnimatePresence mode="wait">
              {!showOtp ? (
                <motion.div
                  key="phone-form"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  {/* Segmented Pill Switcher: [ LOGIN ] | [ SIGN UP ] */}
                  <div className="flex bg-[#F1F5F3] rounded-2xl p-1 border border-slate-100/80 shadow-inner">
                    <button
                      type="button"
                      onClick={() => {
                        setIsLogin(true);
                        navigate("/login", { replace: true });
                      }}
                      className={`flex-1 py-2.5 sm:py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                        isLogin
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      LOGIN
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsLogin(false);
                        navigate("/signup", { replace: true });
                      }}
                      className={`flex-1 py-2.5 sm:py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                        !isLogin
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      SIGN UP
                    </button>
                  </div>

                  {/* Headline & Subtitle */}
                  <div className="text-center pt-1 pb-1">
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                      {isLogin ? "Welcome Back!" : "Create Account"}
                    </h3>
                    <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                      OTP WILL BE SENT FOR VERIFICATION
                    </p>
                  </div>

                  {/* Input Form */}
                  <form onSubmit={handleSendOtp} className="space-y-3.5 pt-1">
                    {/* Sign Up Additional Fields */}
                    {!isLogin && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-3"
                      >
                        {/* Name Input */}
                        <div className="relative flex items-center bg-[#F8FAF9] border border-slate-200/80 rounded-2xl p-1.5 focus-within:border-emerald-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-600/10 transition-all shadow-sm">
                          <div className="pl-3 pr-2 text-slate-400">
                            <User size={18} />
                          </div>
                          <input
                            required
                            type="text"
                            placeholder="Full Name"
                            value={formData.name}
                            onChange={(e) =>
                              setFormData({ ...formData, name: e.target.value })
                            }
                            className="w-full bg-transparent border-none text-sm font-bold text-slate-800 outline-none pr-3 py-2 placeholder:text-slate-400 placeholder:font-medium"
                          />
                        </div>
                      </motion.div>
                    )}

                    {/* Mobile Number Input Container */}
                    <div className="relative flex items-center bg-[#F8FAF9] border border-slate-200/80 rounded-2xl p-1.5 focus-within:border-emerald-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-600/10 transition-all shadow-sm">
                      <div className="pl-3 pr-2 text-slate-400">
                        <Phone size={18} />
                      </div>
                      <div className="flex items-center text-sm font-black text-slate-700 pr-2.5 border-r border-slate-300">
                        +91
                      </div>
                      <input
                        required
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={10}
                        placeholder="Mobile Number"
                        value={formData.phone}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            phone: e.target.value.replace(/\D/g, ""),
                          })
                        }
                        className="w-full bg-transparent border-none text-sm font-bold text-slate-900 outline-none pl-3 pr-3 py-2.5 placeholder:text-slate-400 placeholder:font-medium tracking-wide"
                      />
                    </div>

                    {/* Primary Action Button */}
                    <button
                      type="submit"
                      disabled={isLoading || timer > 0}
                      className="w-full py-4 rounded-2xl bg-[#2E7D32] hover:bg-[#256828] text-white font-black text-xs uppercase tracking-[2px] shadow-lg shadow-emerald-900/15 active:scale-98 transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                    >
                      {isLoading ? (
                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : timer > 0 ? (
                        `Wait ${timer}s`
                      ) : isLogin ? (
                        "GET OTP"
                      ) : (
                        "GET OTP & CONTINUE"
                      )}
                      {!isLoading && timer === 0 && (
                        <ArrowRight size={16} strokeWidth={2.5} />
                      )}
                    </button>

                    {/* Trust Notice with Shield */}
                    <div className="flex items-center justify-center gap-2 pt-2 text-center">
                      <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                      <p className="text-[10px] font-medium text-slate-500">
                        We'll send you a One Time Password on your mobile number
                      </p>
                    </div>
                  </form>
                </motion.div>
              ) : (
                /* OTP Verification View */
                <motion.div
                  key="otp-form"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6 pt-2"
                >
                  {/* Top Bar with Back Button */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowOtp(false)}
                      className="h-10 w-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-all"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <div>
                      <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none">
                        Verify OTP
                      </h3>
                      <p className="text-xs font-bold text-slate-400 mt-1">
                        Code sent to +91 {formData.phone}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleVerifyOtp} className="space-y-6">
                    {/* 4-Box OTP Input */}
                    <div className="flex justify-center gap-3 py-2">
                      {[0, 1, 2, 3].map((index) => (
                        <input
                          key={index}
                          ref={(el) => (otpInputsRef.current[index] = el)}
                          type="tel"
                          maxLength={1}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={formData.otp[index] || ""}
                          onKeyDown={(e) => {
                            if (e.key === "Backspace" && !formData.otp[index] && index > 0) {
                              otpInputsRef.current[index - 1]?.focus();
                            }
                          }}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "");
                            const currentOtp = formData.otp.split("");
                            currentOtp[index] = val;
                            const newOtp = currentOtp.join("").slice(0, 4);
                            setFormData({ ...formData, otp: newOtp });

                            if (val && index < 3) {
                              otpInputsRef.current[index + 1]?.focus();
                            }
                          }}
                          className="h-16 w-14 rounded-2xl bg-slate-50 border-2 border-slate-200 text-center text-2xl font-black text-slate-900 outline-none focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-600/10 shadow-sm transition-all"
                        />
                      ))}
                    </div>

                    {/* Verify & Enter Button */}
                    <button
                      type="submit"
                      disabled={isLoading || formData.otp.length !== 4}
                      className="w-full py-4 rounded-2xl bg-[#2E7D32] hover:bg-[#256828] text-white font-black text-xs uppercase tracking-[2px] shadow-lg shadow-emerald-900/15 active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isLoading ? (
                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        "VERIFY & ENTER"
                      )}
                    </button>

                    {/* Resend OTP Timer */}
                    <div className="text-center">
                      <button
                        type="button"
                        disabled={timer > 0 || isLoading}
                        onClick={handleSendOtp}
                        className={`text-xs font-bold uppercase tracking-wider ${
                          timer > 0
                            ? "text-slate-400 cursor-not-allowed"
                            : "text-emerald-700 hover:text-emerald-800 underline"
                        }`}
                      >
                        {timer > 0 ? `Resend code in ${timer}s` : "Resend OTP"}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Bottom Terms & Conditions Footer */}
        <div className="px-6 pb-6 pt-3 text-center border-t border-slate-50">
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
            By continuing, you agree to our
          </p>
          <div className="flex items-center justify-center gap-2 mt-0.5">
            <button
              onClick={() => navigate("/terms")}
              className="text-[10px] font-black text-emerald-800 uppercase tracking-wider hover:underline"
            >
              Terms & Conditions
            </button>
            <span className="text-[8px] text-slate-300">•</span>
            <button
              onClick={() => navigate("/privacy")}
              className="text-[10px] font-black text-emerald-800 uppercase tracking-wider hover:underline"
            >
              Privacy Policy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerAuth;
