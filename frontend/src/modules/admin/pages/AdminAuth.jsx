import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  Zap,
  BarChart3,
  Truck
} from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";

const AdminAuth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const appName = settings?.appName || "Vitszee";
  const primaryColor = settings?.primaryColor || "#1A4516";

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    if (!isLogin) {
      const pwd = (formData.password || "").trim();
      if (pwd.length < 10) {
        toast.error("Password must be at least 10 characters long.");
        setIsLoading(false);
        return;
      }
      if (!/[a-z]/.test(pwd)) {
        toast.error("Password must contain at least one lowercase letter.");
        setIsLoading(false);
        return;
      }
      if (!/[A-Z]/.test(pwd)) {
        toast.error("Password must contain at least one uppercase letter.");
        setIsLoading(false);
        return;
      }
      if (!/[0-9]/.test(pwd)) {
        toast.error("Password must contain at least one number.");
        setIsLoading(false);
        return;
      }
    }

    try {
      const response = isLogin
        ? await adminApi.login({ email: formData.email, password: formData.password })
        : await adminApi.signup({ name: formData.name, email: formData.email, password: formData.password });

      const { token, admin } = response.data.result;

      const authData = {
        ...admin,
        token,
        role: "admin"
      };

      login(authData);

      toast.success(isLogin ? "Welcome back, Administrator." : "Administrator Account Created.");
      navigate("/admin");
    } catch (error) {
      console.error("Login error:", error);
      toast.error(error.response?.data?.message || "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    { icon: Zap, title: "Live Fleet & Order Sync", desc: "Real-time routing & status updates" },
    { icon: BarChart3, title: "Finance & Analytics Hub", desc: "Automated settlements & metrics" },
    { icon: ShieldCheck, title: "Enterprise Security", desc: "Encrypted role-based privileges" },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] p-4 sm:p-6 font-['Outfit',_sans-serif] overflow-hidden relative selection:bg-blue-500 selection:text-white">
      {/* Light Ambient Background with Soft Blue Glows */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full blur-[140px] bg-blue-400/15" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full blur-[140px] bg-sky-400/15" />
        <div className="absolute inset-0 bg-[radial-gradient(#0066ff0a_1px,transparent_1px)] [background-size:24px_24px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[1000px] min-h-[580px] bg-white rounded-3xl shadow-[0_20px_70px_-15px_rgba(0,102,255,0.12)] border border-blue-100 flex flex-col md:flex-row overflow-hidden"
      >
        {/* Left Side: Modern Light Blue Enterprise Panel */}
        <div className="hidden md:flex w-[46%] bg-gradient-to-br from-blue-50/90 via-sky-50/50 to-indigo-50/60 relative flex-col justify-between p-8 lg:p-10 overflow-hidden text-slate-800 border-r border-blue-100">
          {/* Ambient Glows & Grid Pattern */}
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
            className="relative z-10"
          >
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
                    Control Center
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-2xl font-black text-slate-900 leading-tight">
                Enterprise Command & Operations
              </h3>
              <p className="text-xs text-slate-600 font-medium">
                Unified administration for catalog, sellers, logistics & revenue.
              </p>
            </div>
          </motion.div>

          {/* Center Features List */}
          <div className="relative z-10 space-y-3.5 my-6">
            {features.map((feat, idx) => {
              const Icon = feat.icon;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.15 + idx * 0.1 }}
                  className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-white/80 border border-blue-100/90 shadow-sm shadow-blue-500/5 hover:bg-white hover:border-blue-200 hover:shadow-md transition-all"
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
                </motion.div>
              );
            })}
          </div>

          {/* Bottom Security Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="relative z-10 pt-4 border-t border-blue-100 flex items-center justify-between text-[11px] text-slate-500 font-medium"
          >
            <span className="flex items-center gap-1.5 font-semibold text-slate-600">
              <ShieldCheck size={15} className="text-blue-600" />
              256-Bit SSL Encrypted
            </span>
            <span className="text-blue-700 bg-blue-100/80 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold">
              PORTAL v3.2
            </span>
          </motion.div>
        </div>

        {/* Right Side: Login Form */}
        <div className="w-full md:w-[54%] min-h-0 p-8 sm:p-10 lg:p-12 flex flex-col justify-center bg-white overflow-y-auto">
          <div className="max-w-md w-full mx-auto space-y-6">
            {/* Header */}
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-[11px] font-bold uppercase tracking-wider mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                {isLogin ? "Administrator Access" : "Create Administrator"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {isLogin ? "Welcome Back!" : "Register Admin"}
              </h1>
              <p className="text-slate-500 font-medium text-xs">
                {isLogin
                  ? "Enter your verified administrator credentials to continue."
                  : "Fill in the required information to register a new administrator."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <AnimatePresence mode="popLayout">
                {!isLogin && (
                  <motion.div
                    initial={{ height: 0, opacity: 0, y: -10 }}
                    animate={{ height: "auto", opacity: 1, y: 0 }}
                    exit={{ height: 0, opacity: 0, y: -10 }}
                    className="space-y-1.5"
                  >
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block ml-0.5">
                      Full Name
                    </label>
                    <div className="relative group">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
                        <User size={18} />
                      </div>
                      <input
                        type="text"
                        name="name"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Enter your full name"
                        className="w-full pl-11 pr-4 py-3 bg-slate-50/70 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Email Input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block ml-0.5">
                  Email Address
                </label>
                <div className="relative group">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="admin@vitszee.com"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50/70 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block ml-0.5">
                  Password
                </label>
                <div className="relative group">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
                    <Lock size={18} />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    required
                    autoComplete="current-password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Enter your secure password"
                    className="w-full pl-11 pr-11 py-3 bg-slate-50/70 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors focus:outline-none p-1"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Remember & Forgot */}
              <div className="flex items-center justify-between text-xs font-semibold pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-600 select-none">
                  <input
                    type="checkbox"
                    className="rounded-md border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                  />
                  <span>Remember this device</span>
                </label>
                <button
                  type="button"
                  onClick={() => toast.info("Please contact system administrator to reset credentials.")}
                  className="text-blue-600 hover:text-blue-700 font-bold hover:underline"
                >
                  Forgot Password?
                </button>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3.5 text-sm font-bold shadow-lg shadow-blue-600/25 hover:shadow-blue-600/35 hover:scale-[1.005] active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2 group cursor-pointer"
              >
                {isLoading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                  />
                ) : (
                  <>
                    <span>{isLogin ? "Sign In to Admin" : "Create Account"}</span>
                    <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminAuth;
