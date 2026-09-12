import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Search, LayoutGrid, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { applyCloudinaryTransform, handleImageError, DEFAULT_CATEGORY_IMAGE } from '@/core/utils/imageUtils';

import ProductCard from '../components/shared/ProductCard';
import ProductDetailSheet from '../components/shared/ProductDetailSheet';
import { useProductDetail } from '../context/ProductDetailContext';
import { customerApi } from '../services/customerApi';
import MiniCart from '../components/shared/MiniCart';
import { useLocation as useAppLocation } from '../context/LocationContext';
import { useSettings } from '@core/context/SettingsContext';
import Lottie from 'lottie-react';

const CategoryProductsPage = () => {
    const { categoryName: catId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { currentLocation } = useAppLocation();
    const { settings } = useSettings();
    const [activeCatId, setActiveCatId] = useState(catId || 'all');
    const { isOpen: isProductDetailOpen } = useProductDetail();
    const [category, setCategory] = useState(null);
    const [sidebarCategories, setSidebarCategories] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [noServiceData, setNoServiceData] = useState(null);

    // Dynamically load no-service Lottie on mount
    useEffect(() => {
        import('@/assets/lottie/animation.json')
            .then((m) => setNoServiceData(m.default))
            .catch(() => {});
    }, []);

    // Sync route param changes
    useEffect(() => {
        if (catId) {
            setActiveCatId(catId);
        }
    }, [catId]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const hasValidLocation =
                Number.isFinite(currentLocation?.latitude) &&
                Number.isFinite(currentLocation?.longitude);

            // Fetch products and categories in parallel
            const [prodRes, catRes] = await Promise.all([
                hasValidLocation
                    ? customerApi.getProducts({
                        categoryId: activeCatId,
                        lat: currentLocation.latitude,
                        lng: currentLocation.longitude,
                    })
                    : Promise.resolve({ data: { success: true, result: { items: [] } } }),
                customerApi.getCategories(),
            ]);

            if (prodRes.data?.success) {
                const rawResult = prodRes.data.result;
                const dbProds = Array.isArray(prodRes.data.results)
                    ? prodRes.data.results
                    : Array.isArray(rawResult?.items)
                    ? rawResult.items
                    : Array.isArray(rawResult)
                    ? rawResult
                    : [];

                const formattedProds = dbProds.map(p => ({
                    ...p,
                    id: p._id,
                    image:
                      p.mainImage ||
                      p.image ||
                      "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400",
                    price: p.salePrice || p.price,
                    originalPrice: p.price,
                    weight: p.weight || "1 unit",
                    deliveryTime: "8-15 mins"
                }));
                setProducts(Array.isArray(formattedProds) ? formattedProds : []);
            } else {
                setProducts([]);
            }

            if (catRes.data?.success) {
                const dbCats = catRes.data.results || catRes.data.result || [];
                
                const currentCat = dbCats.find(c => c._id === activeCatId);
                if (currentCat) {
                    setCategory(currentCat);
                } else if (activeCatId === 'all') {
                    setCategory(null);
                }
                
                // Sidebar ALWAYS shows active main categories
                const allMainCats = dbCats.filter(cat => cat.type === 'category' && cat.status === 'active');
                const formattedSidebarCats = allMainCats.map(cat => ({
                    id: cat._id,
                    name: cat.name,
                    icon: cat.image || 'https://cdn-icons-png.flaticon.com/128/2321/2321831.png'
                }));
                const uniqueSidebarCats = Array.from(new Map(formattedSidebarCats.map(item => [item.id, item])).values());
                setSidebarCategories([{ id: 'all', name: 'All Categories', icon: 'https://cdn-icons-png.flaticon.com/128/6821/6821002.png' }, ...uniqueSidebarCats]);
            }
        } catch (error) {
            console.error("Error fetching category data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [activeCatId, currentLocation?.latitude, currentLocation?.longitude]);

    const safeProducts = Array.isArray(products) ? products : [];

    const filteredProducts = safeProducts.filter(p => {
        const matchesSearch = !searchQuery.trim() || p.name?.toLowerCase().includes(searchQuery.toLowerCase().trim());
        return matchesSearch;
    });

    const activeCategoryTitle = activeCatId === 'all' 
        ? 'All Categories' 
        : category?.name || sidebarCategories.find(c => c.id === activeCatId)?.name || 'Category';

    return (
        <div className="flex flex-col min-h-screen bg-[#F8FAF8] w-full font-sans">
            {/* Top Compact Header */}
            <header className={cn(
                "sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 px-3 md:px-6 py-2.5 flex items-center justify-between gap-3 shadow-xs",
                isProductDetailOpen && "hidden md:flex"
            )}>
                <div className="flex items-center gap-2 md:gap-3 min-w-0">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-1.5 hover:bg-slate-100 text-slate-700 rounded-full transition-colors shrink-0"
                        title="Go back"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="flex items-center gap-2 min-w-0">
                        <h1 className="text-sm md:text-base font-bold text-slate-800 tracking-tight capitalize truncate">
                            {activeCategoryTitle}
                        </h1>
                        {!isLoading && (
                            <span className="text-[10px] md:text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2 py-0.5 rounded-full shrink-0">
                                {filteredProducts.length} items
                            </span>
                        )}
                    </div>
                </div>

                {/* Desktop Header Search */}
                <div className="hidden md:flex items-center relative w-64 lg:w-80">
                    <Search className="absolute left-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={`Search in ${activeCategoryTitle}...`}
                        className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors text-slate-800 placeholder:text-slate-400"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 text-xs text-slate-400 hover:text-slate-600 font-bold"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </header>

            <div className="flex flex-1 relative items-start w-full">
                {/* Responsive Left Sidebar */}
                <aside className="w-[72px] sm:w-20 md:w-56 lg:w-64 border-r border-slate-200/70 flex flex-col bg-white overflow-y-auto hide-scrollbar sticky top-[45px] md:top-[49px] h-[calc(100vh-45px)] md:h-[calc(100vh-49px)] pb-28 flex-shrink-0 transition-all">
                    <div className="p-1 md:p-2 space-y-1">
                        {sidebarCategories.map((cat) => {
                            const isActive = cat.id === activeCatId || (activeCatId === 'all' && cat.id === 'all');
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => {
                                        if (cat.id !== activeCatId) {
                                            setActiveCatId(cat.id);
                                            window.history.replaceState(null, '', `/category/${cat.id}`);
                                        }
                                    }}
                                    className={cn(
                                        "w-full transition-all relative rounded-lg md:rounded-xl",
                                        // Mobile stacked layout
                                        "flex flex-col md:flex-row items-center py-2.5 px-1 md:px-3 md:py-2 gap-1 md:gap-3 text-center md:text-left",
                                        isActive
                                            ? "bg-emerald-50/80 text-emerald-800 font-bold shadow-xs border-l-3 md:border-l-0 md:border-r-3 border-emerald-600"
                                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                    )}
                                >
                                    <div className={cn(
                                        "w-10 h-10 md:w-8 md:h-8 rounded-lg flex items-center justify-center overflow-hidden transition-all duration-200 shrink-0",
                                        isActive
                                            ? "bg-white border-2 border-emerald-500 shadow-xs scale-105"
                                            : "bg-slate-50 border border-slate-200/80"
                                    )}>
                                        {cat.id === 'all' ? (
                                            <LayoutGrid className={cn("w-5 h-5 md:w-4 md:h-4", isActive ? "text-emerald-700" : "text-slate-600")} />
                                        ) : (
                                            <img
                                                src={applyCloudinaryTransform(cat.icon)}
                                                alt={cat.name}
                                                loading="lazy"
                                                onError={(e) => handleImageError(e, DEFAULT_CATEGORY_IMAGE)}
                                                className="w-full h-full object-cover"
                                            />
                                        )}
                                    </div>
                                    <span className={cn(
                                        "text-[10px] md:text-xs leading-tight line-clamp-2 md:line-clamp-1 break-words",
                                        isActive ? "text-emerald-800 font-bold" : "font-medium"
                                    )}>
                                        {cat.name}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </aside>

                {/* Right Product Grid Column */}
                <div className="flex-1 flex flex-col min-w-0 bg-[#F8FAF8]">
                    {/* Mobile Search Bar (hidden on md+) */}
                    <div className="md:hidden px-3 py-2 bg-white border-b border-slate-100">
                        <div className="relative flex items-center">
                            <Search className="absolute left-3 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={`Search in ${activeCategoryTitle}...`}
                                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-emerald-600 transition-colors text-slate-800 placeholder:text-slate-400"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2.5 text-xs text-slate-400 hover:text-slate-600 font-bold"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Products Grid or States */}
                    {isLoading ? (
                        /* Skeleton Loading Cards */
                        <div className="p-2 md:p-3.5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 md:gap-3">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="bg-white rounded-xl p-2.5 border border-slate-100 shadow-2xs space-y-2 animate-pulse">
                                    <div className="w-full h-28 bg-slate-100 rounded-lg" />
                                    <div className="h-3 bg-slate-100 rounded-sm w-4/5" />
                                    <div className="h-3 bg-slate-100 rounded-sm w-1/2" />
                                    <div className="flex justify-between items-center pt-2">
                                        <div className="h-4 bg-slate-100 rounded-sm w-12" />
                                        <div className="h-6 bg-slate-100 rounded-md w-14" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        /* Compact Empty State */
                        <div className="flex-1 py-14 px-4 flex flex-col items-center justify-center text-center">
                            <div className="w-36 h-36 md:w-44 md:h-44 mb-3">
                                {noServiceData ? (
                                    <Lottie animationData={noServiceData} loop={true} />
                                ) : (
                                    <div className="w-36 h-36 bg-emerald-50/60 rounded-full flex items-center justify-center text-emerald-600">
                                        <Sparkles size={36} />
                                    </div>
                                )}
                            </div>
                            <h3 className="text-base md:text-lg font-bold text-slate-800 tracking-tight mb-1">
                                {searchQuery ? "No matching products found" : "No products available"}
                            </h3>
                            <p className="text-slate-500 font-medium text-xs max-w-[260px] leading-relaxed mb-4">
                                {searchQuery ? `We couldn't find anything matching "${searchQuery}" in this category.` : "We are restocking this category with fresh items soon!"}
                            </p>
                            {activeCatId !== 'all' && (
                                <button
                                    onClick={() => {
                                        setActiveCatId('all');
                                        setSearchQuery('');
                                    }}
                                    className="bg-[#1A4516] hover:bg-[#0a3000] text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all shadow-xs"
                                >
                                    Browse All Categories
                                </button>
                            )}
                        </div>
                    ) : (
                        /* Responsive Compact Product Grid */
                        <main className="flex-1 p-2 md:p-3.5 pb-28">
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 md:gap-3">
                                {filteredProducts.map((product) => (
                                    <ProductCard key={product.id} product={product} compact={true} />
                                ))}
                            </div>
                        </main>
                    )}
                </div>
            </div>

            <MiniCart />
            <ProductDetailSheet />

            <style dangerouslySetInnerHTML={{
                __html: `
                    .hide-scrollbar::-webkit-scrollbar {
                        display: none;
                    }
                    .hide-scrollbar {
                        -ms-overflow-style: none;
                        scrollbar-width: none;
                    }
                `}} />
        </div>
    );
};

export default CategoryProductsPage;
