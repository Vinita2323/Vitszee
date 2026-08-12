import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Heart, Search, Minus, Plus, LayoutGrid } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '@shared/components/ui/Toast';
import { cn } from '@/lib/utils';
import { applyCloudinaryTransform, handleImageError, DEFAULT_CATEGORY_IMAGE } from '@/core/utils/imageUtils';

import ProductCard from '../components/shared/ProductCard';
import ProductDetailSheet from '../components/shared/ProductDetailSheet';
import { useProductDetail } from '../context/ProductDetailContext';
import { customerApi } from '../services/customerApi';
import MiniCart from '../components/shared/MiniCart';
import SectionRenderer from "../components/experience/SectionRenderer";
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
    const initialSubcategoryId = location.state?.activeSubcategoryId || 'all';
    const { isOpen: isProductDetailOpen } = useProductDetail();
    const [selectedSubCategory, setSelectedSubCategory] = useState(initialSubcategoryId);
    const [category, setCategory] = useState(null);
    const [subCategories, setSubCategories] = useState([]);
    const [topSubCategories, setTopSubCategories] = useState([]);
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

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const hasValidLocation =
                Number.isFinite(currentLocation?.latitude) &&
                Number.isFinite(currentLocation?.longitude);

            // Fetch products and categories in parallel instead of sequentially
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

            if (prodRes.data.success) {
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

            if (catRes.data.success) {
                const dbCats = catRes.data.results || catRes.data.result || [];
                
                const currentCat = dbCats.find(c => c._id === activeCatId);
                if (currentCat) {
                    setCategory(currentCat);
                }
                
                // Sidebar ALWAYS shows main categories
                const allMainCats = dbCats.filter(cat => cat.type === 'category' && cat.status === 'active');
                const formattedSidebarCats = allMainCats.map(cat => ({
                    id: cat._id,
                    name: cat.name,
                    icon: cat.image || 'https://cdn-icons-png.flaticon.com/128/2321/2321831.png'
                }));
                const uniqueSidebarCats = Array.from(new Map(formattedSidebarCats.map(item => [item.id, item])).values());
                setSubCategories([{ id: 'all', name: 'All', icon: 'https://cdn-icons-png.flaticon.com/128/6821/6821002.png' }, ...uniqueSidebarCats]);

                // Horizontal pills show subcategories for the selected category
                if (activeCatId !== 'all') {
                    const subs = dbCats.filter(cat => cat.type === 'subcategory' && cat.parentId === activeCatId && cat.status === 'active');
                    setTopSubCategories([{ id: 'all', name: 'All', icon: null }, ...subs.map(s => ({ id: s._id, name: s.name, icon: s.image || s.icon }))]);
                } else {
                    setTopSubCategories([]);
                }

            }
        } catch (error) {
            console.error("Error fetching category data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        setSelectedSubCategory(location.state?.activeSubcategoryId || 'all');
    }, [activeCatId, location.state?.activeSubcategoryId, currentLocation?.latitude, currentLocation?.longitude]);

    const safeProducts = Array.isArray(products) ? products : [];

    const filteredProducts = safeProducts.filter(p => {
        const matchesSub = selectedSubCategory === 'all' || p.subcategoryId?._id === selectedSubCategory || p.subcategoryId === selectedSubCategory;
        const matchesSearch = !searchQuery.trim() || p.name?.toLowerCase().includes(searchQuery.toLowerCase().trim());
        return matchesSub && matchesSearch;
    });

    return (
        <div className="flex flex-col min-h-screen bg-white max-w-md mx-auto relative font-sans">
            {/* Header */}
            <header className={cn(
                "sticky top-0 z-50 bg-white border-b border-gray-50 px-4 py-4 flex items-center justify-between",
                isProductDetailOpen && "hidden md:flex"
            )}>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-1 hover:bg-gray-50 rounded-full transition-colors"
                    >
                        <ChevronLeft size={24} className="text-gray-900" />
                    </button>
                    <h1 className="text-[18px] font-bold text-gray-800 tracking-tight capitalize">
                        {activeCatId === 'all' ? 'All Categories' : category?.name || 'Category'}
                    </h1>
                </div>

            </header>

            <div className="flex flex-1 relative items-start">
                {/* Sidebar — always visible */}
                <aside className="w-[70px] border-r border-gray-50 flex flex-col bg-white overflow-y-auto hide-scrollbar sticky top-[60px] h-[calc(100vh-60px)] pb-32 flex-shrink-0">
                    {subCategories.map((cat) => {
                        const isActive = cat.id === activeCatId || (activeCatId === 'all' && cat.id === 'all');
                        return (
                        <button
                            key={cat.id}
                            onClick={() => {
                                if (cat.id !== activeCatId) {
                                    setActiveCatId(cat.id);
                                    setSelectedSubCategory('all');
                                }
                            }}
                            className={cn(
                                "flex flex-col items-center py-3 px-1 gap-1.5 transition-all relative border-l-4",
                                isActive
                                    ? "bg-[#F7FCF5] border-primary"
                                    : "border-transparent hover:bg-gray-50"
                            )}
                        >
                            <div className={cn(
                                "w-12 h-12 rounded-lg border border-primary/50 flex items-center justify-center overflow-hidden transition-all duration-300 shadow-sm",
                                isActive ? "scale-110 border-primary border-2 bg-[#F7FCF5]" : "bg-white"
                            )}>
                                {cat.id === 'all' ? (
                                    <LayoutGrid className="w-6 h-6 text-slate-700" strokeWidth={1.5} />
                                ) : (
                                    <img src={applyCloudinaryTransform(cat.icon)} alt={cat.name} loading="lazy" onError={(e) => handleImageError(e, DEFAULT_CATEGORY_IMAGE)} className="w-full h-full object-cover" />
                                )}
                            </div>
                            <span className={cn(
                                "text-[10px] text-center font-bold font-sans leading-tight px-1",
                                isActive ? "text-primary" : "text-gray-600"
                            )}>
                                {cat.name}
                            </span>
                        </button>
                        );
                    })}
                </aside>

                {/* Right content column */}
                <div className="flex-1 flex flex-col overflow-x-hidden">
                    {/* Subcategory pills — shifted right to the top */}
                    {topSubCategories.length > 1 && (
                        <div className="w-full overflow-x-auto hide-scrollbar px-2 py-3 flex gap-3 bg-white border-b border-gray-50">
                            {topSubCategories.map(sub => {
                                const isActive = selectedSubCategory === sub.id;
                                return (
                                    <button
                                        key={sub.id}
                                        onClick={() => setSelectedSubCategory(sub.id)}
                                        className="flex flex-col items-center gap-1 shrink-0 group focus:outline-none"
                                    >
                                        <div className={cn(
                                            "w-12 h-12 rounded-xl border flex items-center justify-center overflow-hidden transition-all shadow-sm",
                                            isActive
                                                ? "border-primary border-2 bg-primary/5 scale-105"
                                                : "border-gray-200 bg-white group-hover:border-primary/40"
                                        )}>
                                            {sub.id === 'all' || !sub.icon ? (
                                                <LayoutGrid className={cn("w-5 h-5", isActive ? "text-primary" : "text-gray-600")} strokeWidth={1.5} />
                                            ) : (
                                                <img
                                                    src={applyCloudinaryTransform(sub.icon)}
                                                    alt={sub.name}
                                                    onError={(e) => handleImageError(e, DEFAULT_CATEGORY_IMAGE)}
                                                    className="w-full h-full object-cover"
                                                />
                                            )}
                                        </div>
                                        <span className={cn(
                                            "text-[11px] font-semibold text-center leading-tight max-w-[64px] line-clamp-2",
                                            isActive ? "text-primary font-bold" : "text-gray-600"
                                        )}>
                                            {sub.name}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Search bar below subcategories */}
                    <div className="px-3 py-2 bg-white border-b border-gray-50">
                        <div className="relative flex items-center">
                            <Search className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={`Search in ${activeCatId === 'all' ? 'All Categories' : category?.name || 'Category'}...`}
                                className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-primary transition-colors text-gray-800 placeholder:text-gray-400"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 text-xs text-gray-400 hover:text-gray-600 font-bold"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Products or empty state */}
                    {(safeProducts.length === 0 && !isLoading) ? (
                        <div className="flex-1 py-16 px-4 flex flex-col items-center justify-center text-center">
                            <div className="w-48 h-48 mb-4">
                                {noServiceData ? (
                                    <Lottie animationData={noServiceData} loop={true} />
                                ) : (
                                    <div className="w-48 h-48" />
                                )}
                            </div>
                            <h3 className="text-xl font-[1000] text-slate-800 tracking-tighter mb-2 uppercase">
                                Coming <span className="text-primary">Soon</span>
                            </h3>
                            <p className="text-slate-500 font-semibold text-xs max-w-[200px] leading-relaxed">
                                We are stocking up this category. Check back soon!
                            </p>
                        </div>
                    ) : (
                        <main className="flex-1 p-2 pb-24 bg-white">
                            <div className="grid grid-cols-2 gap-x-2 gap-y-3">
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

