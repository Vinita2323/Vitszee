import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MessageCircle,
  Phone,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Shield,
} from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
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
    <div className="bg-white min-h-screen pb-28 relative overflow-hidden font-sans">
      {/* Sticky Deep Green Header Banner */}
      <div className="bg-[#1A4516] text-white py-3 px-5 sticky top-0 z-40 shadow-sm flex items-center">
        <button
          onClick={handleBack}
          className="p-1.5 rounded-full hover:bg-white/10 transition-colors mr-2 cursor-pointer"
          aria-label="Go Back"
        >
          <ArrowLeft className="text-white" size={18} />
        </button>
        <h1 className="text-sm font-black leading-tight tracking-tight">Help & Support</h1>
      </div>

      {/* Main Content Area overlapping with rounded corners */}
      <div className="bg-white rounded-t-[32px] -mt-5 pt-4 px-4 space-y-4.5 relative z-10">
        {/* Support Channels */}
        <section className="grid grid-cols-2 gap-3.5 mt-5">
          <Card
            className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm flex flex-col items-center justify-center text-center cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => {
              if (supportEmail) {
                window.location.href = `mailto:${supportEmail}`;
              }
            }}
          >
            <div className="w-10 h-10 bg-[#1A4516]/5 rounded-full flex items-center justify-center text-[#1A4516] mb-2 shrink-0">
              <MessageCircle size={18} />
            </div>
            <h4 className="font-bold text-gray-800 text-xs">Email Support</h4>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {supportEmail || "Contact us anytime"}
            </p>
          </Card>
          <Card
            className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm flex flex-col items-center justify-center text-center cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => {
              if (supportPhone) {
                window.location.href = `tel:${supportPhone}`;
              }
            }}
          >
            <div className="w-10 h-10 bg-[#1A4516]/5 rounded-full flex items-center justify-center text-[#1A4516] mb-2 shrink-0">
              <Phone size={18} />
            </div>
            <h4 className="font-bold text-gray-800 text-xs">Call Support</h4>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {supportPhone || "Available 24/7"}
            </p>
          </Card>
        </section>

        {/* FAQs */}
        <section className="space-y-2.5">
          <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-2.5 flex items-center px-1">
            <HelpCircle size={14} className="mr-1.5 text-[#1A4516]" /> Frequently Asked Questions
          </h2>
          <div className="space-y-2.5">
            {faqs.map((faq, index) => (
              <Card
                key={index}
                className="overflow-hidden cursor-pointer bg-white border border-gray-100 rounded-xl shadow-sm"
                onClick={() => toggleAccordion(index)}
              >
                <div className="p-3 flex justify-between items-center bg-white">
                  <h4 className="font-semibold text-gray-800 text-xs pr-3">
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
                      <div className="p-3 text-[11px] text-gray-500 border-t border-gray-100/50 leading-relaxed font-medium">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            ))}
          </div>
        </section>

        <div className="text-center pt-4 space-y-2">
          <button
            type="button"
            onClick={() => navigate("/delivery/privacy")}
            className="inline-flex items-center gap-1.5 text-[#1A4516] font-bold text-xs hover:underline"
          >
            <Shield size={14} /> Privacy Policy
          </button>
          <p className="text-gray-400 text-xs">Still need help?</p>
          <Button
            variant="link"
            className="text-[#1A4516] font-bold text-xs p-0 h-auto mt-1 hover:underline"
            onClick={() => {
              if (supportEmail) window.location.href = `mailto:${supportEmail}`;
            }}
          >
            Contact Support
          </Button>
        </div>
      </div>
    </div>
  );
};

export default HelpSupport;
