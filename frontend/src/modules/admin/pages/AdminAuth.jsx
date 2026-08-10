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
  EyeOff
} from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";
import sellerLoginImg from "../../../assets/SellerLogin.png";

const AdminAuth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const appName = settings?.appName || "App";

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fcfaff] p-6 font-['Outfit',_sans-serif] overflow-hidden relative">
      {/* Elegant Ambient Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[60%] h-[60%] bg-[#1A4516]/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-5%] right-[-5%] w-[40%] h-[40%] bg-slate-50/50 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-[950px] min-h-[580px] max-h-[90vh] bg-white rounded-2xl shadow-[0_50px_120px_rgba(0,0,0,0.06)] border border-slate-100 flex flex-col md:flex-row overflow-hidden"
      >
        {/* Left Side: Deep Green Side Panel */}
        <div className="hidden md:flex w-[45%] bg-[#0B3B24] relative flex-col items-center justify-between p-8 pt-10 pb-6 overflow-hidden">
          {/* Light backdrop circles */}
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute top-0 left-0 w-64 h-64 bg-white/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="relative z-10 w-full flex flex-col items-center text-center"
          >
            {/* White Square Logo Wrapper */}
            <div className="w-36 h-28 rounded-2xl p-3 flex items-center justify-center mb-4 bg-white shadow-lg border border-slate-100 flex-shrink-0">
              <img
                src="/Vitszeefinallog-removebg-preview.png"
                alt="Vitzee Market Logo"
                className="w-full h-full object-contain"
              />
            </div>

            <h2 className="text-white text-xl font-extrabold tracking-wide uppercase">
              Vitzee Market
            </h2>
            <p className="text-white/60 text-[10px] font-black tracking-widest mt-1 uppercase font-mono">
              → And Vegetables ←
            </p>
          </motion.div>

          {/* Grocery Basket Image */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative z-10 w-full flex justify-center mt-auto"
          >
            <img
              src={sellerLoginImg}
              alt="Fresh Farm Vegetables Basket"
              className="w-full max-w-[270px] h-auto object-contain rounded-xl drop-shadow-[0_15px_30px_rgba(0,0,0,0.4)]"
            />
          </motion.div>
        </div>

        {/* Right Side: Login Form */}
        <div className="w-full md:w-[55%] min-h-0 p-8 md:p-12 flex flex-col justify-center bg-white overflow-y-auto custom-scrollbar">
          <div className="space-y-6 py-2">
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                Welcome Back!
              </h1>
              <p className="text-slate-500 font-semibold text-xs uppercase tracking-wider">
                {isLogin ? "Admin Login" : "Admin Register"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <AnimatePresence mode="popLayout">
                {!isLogin && (
                  <motion.div
                    initial={{ height: 0, opacity: 0, y: -10 }}
                    animate={{ height: "auto", opacity: 1, y: 0 }}
                    exit={{ height: 0, opacity: 0, y: -10 }}
                    className="space-y-1.5"
                  >
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block ml-0.5">
                      Full Name
                    </label>
                    <div className="relative group">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#1A4516] transition-colors">
                        <User size={16} />
                      </div>
                      <input
                        type="text"
                        name="name"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Enter your name"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-[#1A4516]/20 focus:ring-2 focus:ring-[#1A4516]/10 transition-all"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block ml-0.5">
                  Email
                </label>
                <div className="relative group">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#1A4516] transition-colors">
                    <Mail size={16} />
                  </div>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Enter your email"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-[#1A4516]/20 focus:ring-2 focus:ring-[#1A4516]/10 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block ml-0.5">
                  Password
                </label>
                <div className="relative group">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#1A4516] transition-colors">
                    <Lock size={16} />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    required
                    autoComplete="current-password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-[#1A4516]/20 focus:ring-2 focus:ring-[#1A4516]/10 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#1A4516] transition-colors focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-semibold pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-[#1A4516] focus:ring-[#1A4516]"
                  />
                  <span>Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={() => toast.info("Password reset feature coming soon")}
                  className="text-[#1A4516] hover:underline"
                >
                  Forgot Password?
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 bg-[#1A4516] hover:bg-[#133A10] text-white rounded-lg py-3 text-sm font-bold shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                  />
                ) : (
                  <>
                    <span>Login</span>
                    <ArrowRight size={16} />
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
