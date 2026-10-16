import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone, Mail, ChevronDown, ChevronUp, FileText, ChevronLeft } from 'lucide-react';
import { useSettings } from '@core/context/SettingsContext';
import axiosInstance from '@core/api/axios';
import { getJSON, setJSON, STORAGE_KEYS } from '@core/utils/storage';

const FAQ_CACHE_KEY = STORAGE_KEYS.FAQ_CACHE;
const FAQ_CACHE_TTL_MS = 5 * 60 * 1000;

const SupportPage = () => {
    const navigate = useNavigate();
    const { settings } = useSettings();
    const supportEmail = settings?.supportEmail || 'support@orangebasket.com';
    const supportEmailShort = supportEmail ? (supportEmail.length > 12 ? supportEmail.slice(0, 12) + '...' : supportEmail) : 'support@...';
    const supportPhone = settings?.supportPhone || '+919876543210';
    const supportPhoneShort = supportPhone ? (supportPhone.length > 12 ? supportPhone.slice(0, 12) + '...' : supportPhone) : '+91 98765...';
    const [faqs, setFaqs] = useState([]);

    useEffect(() => {
        const fetchFaqs = async () => {
            const cached = getJSON(FAQ_CACHE_KEY, null, { storage: 'session' });
            if (cached && Array.isArray(cached.items)) {
                setFaqs(cached.items);
                return;
            }

            try {
                const response = await axiosInstance.get('/public/faqs', {
                    params: { category: 'Customer', status: 'published' }
                });
                const data = response.data?.result ?? response.data;
                const list = Array.isArray(data?.items) ? data.items : Array.isArray(data?.results) ? data.results : [];
                setFaqs(list);
                setJSON(
                    FAQ_CACHE_KEY,
                    { items: list },
                    { storage: 'session', ttlMs: FAQ_CACHE_TTL_MS },
                );
            } catch (error) {
                console.error('Error fetching FAQs:', error);
            }
        };

        fetchFaqs();
    }, []);

    return (
        <div className="min-h-screen bg-slate-50 pb-24 font-sans">
            <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-slate-200/60 mb-4 flex items-center gap-2">
                <button
                    onClick={() => navigate(-1)}
                    className="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 rounded-full transition-colors -ml-1"
                >
                    <ChevronLeft size={22} className="text-slate-800" />
                </button>
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Help & Support</h1>
            </div>

            <div className="max-w-2xl mx-auto px-4 pt-1 relative z-20 space-y-5">
                {/* Contact Channels */}
                <div className="grid grid-cols-2 gap-3">
                    <ContactCard icon={Phone} label="Call Us" sub={supportPhoneShort} onClick={() => window.location.href = `tel:${supportPhone}`} />
                    <ContactCard icon={Mail} label="Email Us" sub={supportEmailShort} onClick={() => window.location.href = `mailto:${supportEmail}`} />
                </div>

                {/* FAQ Section */}
                <div>
                    <h2 className="text-base font-semibold text-[#1A4516] mb-3 px-1">Frequently Asked Questions</h2>
                    <div className="space-y-3">
                        {faqs.length > 0 ? (
                            faqs.map((faq) => (
                                <FAQItem
                                    key={faq._id}
                                    question={faq.question}
                                    answer={faq.answer}
                                />
                            ))
                        ) : (
                            <div className="bg-white rounded-2xl shadow-[0_4px_10px_rgb(0,0,0,0.02)] border border-slate-100 px-5 py-4 text-sm text-slate-400 text-center">
                                No FAQs available right now.
                            </div>
                        )}
                    </div>
                </div>

                {/* Legal Links */}
                <div className="bg-white rounded-xl p-4 border border-slate-200">
                    <h3 className="text-[11px] font-semibold text-[#1A4516]/70 uppercase tracking-wide mb-3">Legal</h3>
                    <div className="space-y-3">
                        <Link to="/terms" className="flex items-center gap-2.5 text-[#1A4516] hover:text-[#0a3000] font-medium">
                            <FileText size={18} /> Terms & Conditions
                        </Link>
                        <Link to="/privacy" className="flex items-center gap-2.5 text-[#1A4516] hover:text-[#0a3000] font-medium">
                            <FileText size={18} /> Privacy Policy
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ContactCard = ({ icon: Icon, label, sub, to, onClick }) => {
    const CardContent = (
        <div
            onClick={onClick}
            className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col items-center justify-center text-center gap-2 hover:bg-slate-50 transition-colors cursor-pointer group h-full"
        >
            <div className="h-10 w-10 rounded-lg bg-[#F5FBF5] flex items-center justify-center text-[#1A4516] transition-colors">
                <Icon size={20} />
            </div>
            <div>
                <h3 className="font-semibold text-[#1A4516] text-sm whitespace-nowrap">{label}</h3>
                <p className="text-[10px] text-[#1A4516]/60 font-medium">{sub}</p>
            </div>
        </div>
    );

    return to ? <Link to={to} className="block h-full">{CardContent}</Link> : CardContent;
};

const FAQItem = ({ question, answer }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[#F5FBF5] transition-colors"
            >
                <span className="font-semibold text-[#1A4516] text-sm">{question}</span>
                {isOpen ? <ChevronUp size={18} className="text-[#1A4516]" /> : <ChevronDown size={18} className="text-[#1A4516]/60" />}
            </button>
            {isOpen && (
                <div className="px-5 pb-4 text-sm text-[#1A4516]/80 font-medium leading-relaxed bg-[#F5FBF5]/30">
                    {answer}
                </div>
            )}
        </div>
    );
};

export default SupportPage;
