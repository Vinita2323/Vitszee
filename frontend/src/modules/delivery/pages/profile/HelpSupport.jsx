import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MessageCircle,
  Phone,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";

const HelpSupport = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { settings } = useSettings();

  const supportPhone = settings?.supportPhone || "";
  const supportEmail = settings?.supportEmail || "";

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(isAuthenticated ? "/delivery/profile" : "/delivery/auth");
    }
  };

  const faqs = [
    {
      question: "How do I change my bank account details?",
      answer:
        "Go to Profile > Bank Account and tap on 'Request Change'. You will need to upload a cancelled cheque or passbook copy for verification.",
    },
    {
      question: "What if I can't find the customer's location?",
      answer:
        "Use the in-app map navigation. If you're still stuck, you can call the customer directly using the 'Call' button on the order screen.",
    },
    {
      question: "How are my earnings calculated?",
      answer:
        "Earnings are based on base fare + distance pay + surge pricing (if applicable). You can view detailed breakdown in the Earnings tab.",
    },
    {
      question: "I had an accident during delivery. What to do?",
      answer:
        "Use the SOS button immediately in the Safety section. Our emergency response team will contact you and provide assistance.",
    },
  ];

  const [openIndex, setOpenIndex] = useState(null);

  const toggleAccordion = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="bg-white min-h-screen pb-6 relative overflow-hidden font-sans">
      {/* Sticky Brand Blue Header Banner */}
      <div className="bg-gradient-to-br from-[#09356E] via-[#0057B7] to-[#004494] text-white py-3 px-4 sticky top-0 z-40 shadow-sm flex items-center">
        <button
          onClick={handleBack}
          className="p-1.5 rounded-full hover:bg-white/10 transition-colors mr-1.5 cursor-pointer"
          aria-label="Go Back"
        >
          <ArrowLeft className="text-white" size={16} />
        </button>
        <h1 className="text-sm font-black leading-tight tracking-tight">Help & Support</h1>
      </div>

      <div className="pt-4 px-4 space-y-5 relative z-10">
        {/* Support Channels */}
        <section className="space-y-2.5">
          <div
            className="px-4 py-3.5 bg-white border border-gray-100 rounded-2xl shadow-sm flex items-center gap-3 text-left cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => {
              if (supportEmail) {
                window.location.href = `mailto:${supportEmail}`;
              }
            }}
          >
            <div className="w-10 h-10 bg-[#0057B7]/10 rounded-full flex items-center justify-center text-[#0057B7] shrink-0">
              <MessageCircle size={18} />
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-gray-800 text-sm leading-tight">Email Support</h4>
              <p className="text-xs text-gray-400 truncate mt-0.5">
                {supportEmail || "Contact us anytime"}
              </p>
            </div>
          </div>
          <div
            className="px-4 py-3.5 bg-white border border-gray-100 rounded-2xl shadow-sm flex items-center gap-3 text-left cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => {
              if (supportPhone) {
                window.location.href = `tel:${supportPhone}`;
              }
            }}
          >
            <div className="w-10 h-10 bg-[#0057B7]/10 rounded-full flex items-center justify-center text-[#0057B7] shrink-0">
              <Phone size={18} />
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-gray-800 text-sm leading-tight">Call Support</h4>
              <p className="text-xs text-gray-400 truncate mt-0.5">
                {supportPhone || "Available 24/7"}
              </p>
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section>
          <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-3 flex items-center px-1">
            <HelpCircle size={13} className="mr-1.5 text-[#0057B7]" /> Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="overflow-hidden cursor-pointer bg-white border border-gray-100 rounded-2xl shadow-sm"
                onClick={() => toggleAccordion(index)}
              >
                <div className="px-4 py-3.5 flex justify-between items-center bg-white">
                  <h4 className="font-semibold text-gray-800 text-sm leading-snug pr-3">
                    {faq.question}
                  </h4>
                  {openIndex === index ? (
                    <ChevronUp size={14} className="text-gray-400 shrink-0" />
                  ) : (
                    <ChevronDown size={14} className="text-gray-400 shrink-0" />
                  )}
                </div>
                <AnimatePresence>
                  {openIndex === index && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="bg-gray-50/50"
                    >
                      <div className="px-4 py-3 text-[13px] text-gray-500 border-t border-gray-100/50 leading-relaxed font-medium">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </section>

        <div className="text-center pt-2 text-sm text-gray-400">
          Still need help?{" "}
          <button
            type="button"
            className="text-[#0057B7] font-bold hover:underline"
            onClick={() => {
              if (supportEmail) window.location.href = `mailto:${supportEmail}`;
            }}
          >
            Contact Support
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpSupport;
