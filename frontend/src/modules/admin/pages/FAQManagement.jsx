// Ultimate FAQ Management System - Functional Version
import React, { useState, useMemo } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Modal from '@shared/components/ui/Modal';
import {
    HelpCircle,
    Plus,
    Edit3,
    Trash2,
    Eye,
    EyeOff,
    ChevronDown,
    ChevronUp,
    MessageSquare,
    Layers,
    TrendingUp,
    ArrowUpRight,
    Save,
    CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from '../services/adminApi';
import { useEffect } from 'react';

const FAQManagement = () => {
    const { showToast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');
    const [expandedId, setExpandedId] = useState(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [sortBy, setSortBy] = useState('Most Viewed');
    const [editingFaqId, setEditingFaqId] = useState(null);

    // Form States
    const [newFaq, setNewFaq] = useState({
        question: '',
        answer: '',
        category: 'Customer',
        status: 'published'
    });

    const [isLoading, setIsLoading] = useState(true);
    const [newCategoryName, setNewCategoryName] = useState('');

    // Categories State
    const [categories, setCategories] = useState([
        { id: 1, name: 'Customer', color: 'sky' },
        { id: 2, name: 'Seller', color: 'indigo' },
        { id: 3, name: 'Delivery', color: 'amber' },
        { id: 4, name: 'Orders', color: 'emerald' },
    ]);

    const [faqs, setFaqs] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchFaqs(1);
        }, 500);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageSize, searchTerm, activeCategory]);

    const fetchFaqs = async (requestedPage = 1) => {
        setIsLoading(true);
        try {
            const params = { 
                page: requestedPage, 
                limit: pageSize,
                search: searchTerm.trim() || undefined,
                category: activeCategory !== 'All' ? activeCategory : undefined
            };
            const response = await adminApi.getFAQs(params);
            const payload = response.data.result || {};
            const data = Array.isArray(payload.items) ? payload.items : (response.data.results || []);
            setFaqs(data);
            setTotal(typeof payload.total === 'number' ? payload.total : data.length);
            setPage(typeof payload.page === 'number' ? payload.page : requestedPage);
        } catch (error) {
            showToast('Failed to fetch FAQs', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // Computed Categories with Counts
    const categoriesWithCounts = useMemo(() => {
        return categories.map(cat => ({
            ...cat,
            count: faqs.filter(f => f.category === cat.name).length
        }));
    }, [categories, faqs]);

    // Core Filtering and Sorting Logic
    const filteredAndSortedFaqs = useMemo(() => {
        let result = [...faqs];

        // Sorting Logic
        switch (sortBy) {
            case 'Most Viewed':
                result.sort((a, b) => b.views - a.views);
                break;
            case 'Newest First':
                result.sort((a, b) => b.createdAt - a.createdAt);
                break;
            case 'Alphabetical':
                result.sort((a, b) => a.question.localeCompare(b.question));
                break;
            default:
                break;
        }

        return result;
    }, [faqs, searchTerm, activeCategory, sortBy]);

    // Actions
    const handleSaveFaq = async (e) => {
        e.preventDefault();

        try {
            if (editingFaqId) {
                await adminApi.updateFAQ(editingFaqId, newFaq);
                showToast(`FAQ updated successfully`, 'success');
            } else {
                await adminApi.createFAQ(newFaq);
                showToast(`FAQ created successfully`, 'success');
            }
            fetchFaqs(page);
            setIsAddModalOpen(false);
            setEditingFaqId(null);
            setNewFaq({ question: '', answer: '', category: 'Customer', status: 'published' });
        } catch (error) {
            showToast('Failed to save FAQ', 'error');
        }
    };

    const handleEditClick = (faq) => {
        setNewFaq({
            question: faq.question,
            answer: faq.answer,
            category: faq.category,
            status: faq.status
        });
        setEditingFaqId(faq._id);
        setIsAddModalOpen(true);
    };

    const handleDeleteFaq = async (id) => {
        try {
            await adminApi.deleteFAQ(id);
            fetchFaqs(page);
            showToast('FAQ deleted successfully', 'warning');
        } catch (error) {
            showToast('Failed to delete FAQ', 'error');
        }
    };

    const handleToggleStatus = async (faq) => {
        try {
            const newStatus = faq.status === 'published' ? 'draft' : 'published';
            await adminApi.updateFAQ(faq._id, { status: newStatus });
            fetchFaqs(page);
            showToast('Visibility state updated', 'info');
        } catch (error) {
            showToast('Failed to update status', 'error');
        }
    };

    const handleAddCategory = () => {
        if (!newCategoryName.trim()) return;
        const colors = ['sky', 'emerald', 'amber', 'rose', 'indigo', 'pink', 'violet'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        setCategories([...categories, { id: Date.now(), name: newCategoryName, color: randomColor }]);
        setNewCategoryName('');
        showToast('New taxonomy node generated', 'success');
    };

    const handleDeleteCategory = (name) => {
        setCategories(categories.filter(c => c.name !== name));
        showToast('Category node removed', 'warning');
    };

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-16 space-y-6">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 flex items-center gap-3">
                        FAQ Management
                        <div className="p-1.5 bg-pink-100 rounded-xl">
                            <HelpCircle className="h-5 w-5 text-pink-600" />
                        </div>
                    </h1>
                    <p className="text-sm font-medium text-slate-500 mt-1">Manage categories and help customers with common questions.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsCategoryModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white ring-1 ring-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-xs cursor-pointer"
                    >
                        <Layers className="h-4 w-4 text-brand-500" />
                        CATEGORIES
                    </button>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-pink-600 text-white rounded-xl text-xs font-bold hover:bg-pink-700 transition-all shadow-sm cursor-pointer"
                    >
                        <Plus className="h-4 w-4" />
                        ADD FAQ
                    </button>
                </div>
            </div>

            {/* Quick Stats - Compacted */}
            <div className="flex flex-wrap gap-3 items-center">
                {[
                    { label: 'Total FAQs', value: faqs.length, icon: MessageSquare, bg: 'bg-pink-50', iconColor: 'text-pink-600' },
                    { label: 'Total Views', value: faqs.reduce((acc, f) => acc + f.views, 0).toLocaleString(), icon: TrendingUp, bg: 'bg-brand-50', iconColor: 'text-brand-600' },
                    { label: 'Published', value: faqs.filter(f => f.status === 'published').length, icon: CheckCircle2, bg: 'bg-brand-50', iconColor: 'text-brand-600' },
                    { label: 'Drafts', value: faqs.filter(f => f.status === 'draft').length, icon: Edit3, bg: 'bg-amber-50', iconColor: 'text-amber-600' },
                ].map((stat, i) => (
                    <Card key={i} className="border-none shadow-xs ring-1 ring-slate-200/80 px-4 py-2.5 bg-white rounded-lg w-full sm:w-56 md:w-60 shrink-0 text-left">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 whitespace-nowrap">{stat.label}</p>
                                <h3 className="text-2xl font-black text-slate-900 mt-0.5">{stat.value}</h3>
                            </div>
                            <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", stat.bg)}>
                                <stat.icon className={cn("h-5 w-5", stat.iconColor)} />
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
                {/* Left Sidebar: Categories */}
                <div className="lg:col-span-1 space-y-4">
                    <Card className="p-4 border-none shadow-xs ring-1 ring-slate-200/80 bg-white rounded-xl text-left">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-1">FAQ Categories</h4>
                        <div className="space-y-1.5">
                            <button
                                onClick={() => setActiveCategory('All')}
                                className={cn(
                                    "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                                    activeCategory === 'All' ? "bg-slate-900 text-white shadow-sm" : "text-slate-700 hover:bg-slate-50"
                                )}
                            >
                                <span className="flex items-center gap-2.5">
                                    <Layers className="h-4 w-4 opacity-70" />
                                    All Topics
                                </span>
                                <span className={cn("text-xs font-bold px-2 py-0.5 rounded-md", activeCategory === 'All' ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600")}>
                                    {faqs.length}
                                </span>
                            </button>
                            {categoriesWithCounts.map((cat) => (
                                <button
                                    key={cat.id}
                                    onClick={() => setActiveCategory(cat.name)}
                                    className={cn(
                                        "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                                        activeCategory === cat.name ? "bg-pink-600 text-white shadow-sm" : "text-slate-700 hover:bg-slate-50"
                                    )}
                                >
                                    <span className="flex items-center gap-2.5">
                                        <div className={cn("h-2 w-2 rounded-full", activeCategory === cat.name ? "bg-white" : `bg-${cat.color}-500`)} />
                                        {cat.name}
                                    </span>
                                    <span className={cn("text-xs font-bold px-2 py-0.5 rounded-md", activeCategory === cat.name ? "bg-pink-700 text-white" : "bg-slate-100 text-slate-600")}>
                                        {cat.count}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </Card>
                </div>

                {/* Main Content: FAQ List */}
                <div className="lg:col-span-3">
                    <Card className="border-none shadow-xs ring-1 ring-slate-200 bg-white rounded-2xl overflow-hidden text-left">
                        {filteredAndSortedFaqs.length === 0 ? (
                            <div className="p-12 text-center text-slate-400 font-bold text-sm">
                                No FAQs found in this category
                            </div>
                        ) : (
                            filteredAndSortedFaqs.map((faq) => (
                                <div
                                    key={faq.id || faq._id}
                                    className="p-5 sm:p-6 border-b border-slate-200 last:border-b-0 hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                                >
                                    {/* Left: Question, Answer & Category Tag */}
                                    <div className="space-y-2.5 flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 font-bold text-xs rounded-lg ring-1 ring-blue-100">
                                                {faq.category || "General"}
                                            </span>
                                            <button
                                                onClick={() => handleToggleStatus(faq)}
                                                className={cn(
                                                    "px-2.5 py-0.5 text-xs font-bold rounded-lg cursor-pointer transition-all",
                                                    faq.status === 'published'
                                                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                                                        : "bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200"
                                                )}
                                                title="Click to toggle status"
                                            >
                                                {faq.status === 'published' ? '● Published' : '○ Draft'}
                                            </button>
                                            {faq.views > 0 && (
                                                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                                                    <Eye className="h-3.5 w-3.5" /> {faq.views.toLocaleString()} views
                                                </span>
                                            )}
                                        </div>

                                        <h3 className="text-base font-bold text-slate-900 leading-snug">
                                            {faq.question}
                                        </h3>

                                        <p className="text-sm font-medium text-slate-600 leading-relaxed">
                                            {faq.answer}
                                        </p>
                                    </div>

                                    {/* Right: Actions */}
                                    <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                                        <button
                                            onClick={() => handleEditClick(faq)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-brand-50 hover:text-brand-600 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                            title="Edit FAQ"
                                        >
                                            <Edit3 className="h-3.5 w-3.5" />
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDeleteFaq(faq._id)}
                                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                                            title="Delete FAQ"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </Card>
                </div>
            </div>

            <div className="mt-6 flex justify-center">
                <Pagination
                    page={page}
                    totalPages={Math.ceil(total / pageSize) || 1}
                    total={total}
                    pageSize={pageSize}
                    onPageChange={(p) => fetchFaqs(p)}
                    onPageSizeChange={(newSize) => {
                        setPageSize(newSize);
                        setPage(1);
                    }}
                    loading={isLoading}
                />
            </div>

            {/* Modals */}
            <Modal
                isOpen={isAddModalOpen}
                onClose={() => {
                    setIsAddModalOpen(false);
                    setEditingFaqId(null);
                    setNewFaq({ question: '', answer: '', category: 'Customer', status: 'published' });
                }}
                title={editingFaqId ? `Edit Question: ${editingFaqId}` : "Create New FAQ"}
                size="lg"
            >
                <form onSubmit={handleSaveFaq} className="space-y-4 text-left p-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Category</label>
                            <select
                                value={newFaq.category}
                                onChange={(e) => setNewFaq({ ...newFaq, category: e.target.value })}
                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-pink-500/20 focus:bg-white transition-all cursor-pointer"
                            >
                                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Visibility State</label>
                            <div className="flex bg-slate-100 p-1 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => setNewFaq({ ...newFaq, status: 'published' })}
                                    className={cn("flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer", newFaq.status === 'published' ? "bg-white text-pink-600 shadow-sm" : "text-slate-500")}
                                >PUBLISHED</button>
                                <button
                                    type="button"
                                    onClick={() => setNewFaq({ ...newFaq, status: 'draft' })}
                                    className={cn("flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer", newFaq.status === 'draft' ? "bg-white text-pink-600 shadow-sm" : "text-slate-500")}
                                >DRAFT</button>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Question *</label>
                        <input
                            type="text"
                            required
                            value={newFaq.question}
                            onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                            placeholder="Enter the question..."
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-pink-500/20 focus:bg-white transition-all"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Answer *</label>
                        <textarea
                            rows={4}
                            required
                            value={newFaq.answer}
                            onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
                            placeholder="Type the answer here..."
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-pink-500/20 focus:bg-white transition-all resize-none"
                        />
                    </div>
                    <div className="flex gap-3 pt-3 border-t border-slate-100">
                        <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-200 transition-all cursor-pointer">CANCEL</button>
                        <button type="submit" className="flex-[2] py-2.5 bg-pink-600 text-white rounded-xl font-bold text-xs hover:bg-pink-700 shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer">
                            <Save className="h-4 w-4" /> SAVE FAQ
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={isCategoryModalOpen}
                onClose={() => setIsCategoryModalOpen(false)}
                title="Manage Categories"
            >
                <div className="space-y-4 text-left p-1">
                    <div className="space-y-2">
                        {categories.map((cat) => (
                            <div key={cat.id} className="flex items-center justify-between p-3 px-4 bg-slate-50 rounded-xl border border-slate-200">
                                <div className="flex items-center gap-3">
                                    <div className={cn("h-3 w-3 rounded-full shadow-xs", `bg-${cat.color}-500`)} />
                                    <span className="text-sm font-bold text-slate-900">{cat.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => handleDeleteCategory(cat.name)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-white rounded-lg transition-all cursor-pointer"><Trash2 className="h-4 w-4" /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="relative group">
                        <Plus className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-brand-500" />
                        <input
                            type="text"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
                            placeholder="New Category Label..."
                            className="w-full pl-10 pr-4 py-2.5 bg-white ring-1 ring-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-brand-500/20 transition-all"
                        />
                    </div>
                    <button onClick={handleAddCategory} className="w-full py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition-all cursor-pointer">ADD NEW CATEGORY</button>
                </div>
            </Modal>
        </div>
    );
};

export default FAQManagement;
