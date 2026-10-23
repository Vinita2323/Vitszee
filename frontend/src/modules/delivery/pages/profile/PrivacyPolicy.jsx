import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, Lock } from "lucide-react";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";

const PREFS_KEY = "delivery_privacy_prefs";

const privacyOptions = [
  {
    key: "shareLocation",
    label: "Share Live Location",
    sub: "Allow customers to track you during delivery",
  },
  {
    key: "profileVisibility",
    label: "Profile Visibility",
    sub: "Show your photo to customers",
  },
];

const loadPrefs = () => {
  const defaults = { shareLocation: true, profileVisibility: true };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return defaults;
  }
};

const PrivacyPolicy = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { settings } = useSettings();
  const appName = settings?.appName || "App";
  const supportEmail = settings?.supportEmail || "";

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(isAuthenticated ? "/delivery/profile" : "/delivery/auth");
    }
  };

  const [prefs, setPrefs] = useState(loadPrefs);

  const togglePref = (key) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — keep in-memory state */
      }
      return next;
    });
  };

  const sections = [
    {
      title: "1. Information We Collect",
      body: "We collect the details you give us when you register as a delivery partner: name, phone number, email, address, date of birth, blood group, vehicle details, bank account details and identity documents (Aadhar, PAN, driving licence). We also collect your profile photo.",
    },
    {
      title: "2. Location Data",
      body: "While you are online, we collect your device location to match you with nearby orders, show routes and let customers and sellers track active deliveries. Location is not collected while you are offline.",
    },
    {
      title: "3. How We Use Your Information",
      body: "We use your information to verify your identity, assign and manage deliveries, calculate and pay your earnings, provide support, keep deliveries safe and meet legal obligations.",
    },
    {
      title: "4. Sharing of Information",
      body: "We never sell your personal data. Customers and sellers see limited details (your name, photo, vehicle and live location) for the orders you handle. We share data with payment and service providers only as needed to operate the service, or where the law requires it.",
    },
    {
      title: "5. Data Security",
      body: "We use industry-standard safeguards to protect your data. No method of storage or transmission is completely secure, so please keep your login details private.",
    },
    {
      title: "6. Your Rights",
      body: "You can view and update your details from Profile > Personal Details. You can also delete your account from the Profile page. For any other request, contact our support team.",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-6">
      <div className="bg-gradient-to-br from-[#09356E] via-[#0057B7] to-[#004494] text-white py-2 px-3 sticky top-0 z-40 shadow-sm flex items-center">
        <button
          onClick={handleBack}
          className="p-1.5 rounded-full hover:bg-white/10 transition-colors mr-1.5 cursor-pointer"
          aria-label="Go Back"
        >
          <ArrowLeft className="text-white" size={16} />
        </button>
        <h1 className="text-sm font-black leading-tight tracking-tight">Privacy Policy</h1>
      </div>

      <div className="p-3 max-w-lg mx-auto space-y-3">
        {/* Privacy Settings */}
        <section>
          <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-1.5 flex items-center px-1">
            <Lock size={13} className="mr-1.5 text-[#0057B7]" /> Privacy Settings
          </h2>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
            {privacyOptions.map((opt) => (
              <div key={opt.key} className="px-3 py-2.5 flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <h4 className="text-[13px] font-semibold text-gray-800 leading-tight">{opt.label}</h4>
                  <p className="text-[11px] text-gray-500 leading-snug">{opt.sub}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs[opt.key]}
                  aria-label={opt.label}
                  onClick={() => togglePref(opt.key)}
                  className={`relative w-11 h-6 shrink-0 rounded-full transition-colors duration-200 ${
                    prefs[opt.key] ? "bg-[#0057B7]" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                      prefs[opt.key] ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-[#0057B7]/10 flex items-center justify-center text-[#0057B7] shrink-0">
              <Shield size={17} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 leading-tight">
                {appName} Delivery Partner Privacy Policy
              </h2>
              <p className="text-[11px] text-gray-400 font-medium">Last updated: Oct 2026</p>
            </div>
          </div>

          <p className="text-[13px] text-gray-600 leading-relaxed">
            At {appName}, we take your privacy seriously. This policy explains how we collect,
            use and protect your information as a delivery partner.
          </p>

          <div className="mt-3 space-y-3">
            {sections.map((s) => (
              <section key={s.title}>
                <h3 className="text-[13px] font-bold text-gray-800">{s.title}</h3>
                <p className="text-[12px] text-gray-500 leading-relaxed mt-0.5">{s.body}</p>
              </section>
            ))}
          </div>

          {supportEmail && (
            <p className="mt-4 text-[12px] text-gray-500">
              Questions? Write to{" "}
              <a href={`mailto:${supportEmail}`} className="text-[#0057B7] font-bold">
                {supportEmail}
              </a>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
