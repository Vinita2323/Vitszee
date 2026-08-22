import React, { useEffect, useState, useMemo } from "react";
import { Sparkles, ArrowLeft, Tag, Search, ArrowUpDown } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { customerApi } from "../services/customerApi";
import ProductCard from "../components/shared/ProductCard";
import { useLocation as useAppLocation } from "../context/LocationContext";

const LowestPricePage = () => {
  const navigate = useNavigate();
  const { currentLocation } = useAppLocation();
  const [lowestPriceData, setLowestPriceData] = useState(null);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("discount_desc"); // 'discount_desc', 'price_asc', 'price_desc'

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const hasValidLocation =
          Number.isFinite(currentLocation?.latitude) &&
          Number.isFinite(currentLocation?.longitude);

        const params = {};
        if (hasValidLocation) {
          params.lat = currentLocation.latitude;
          params.lng = currentLocation.longitude;
        }

        const [res, allProdRes] = await Promise.all([
          customerApi.getLowestPriceSection(params).catch(() => null),
          customerApi.getProducts({ limit: 100, ...params }).catch(() => ({ data: {} })),
        ]);

        if (res?.data?.success && res.data.result) {
          setLowestPriceData(res.data.result);
          if (res.data.result.products?.length > 0) {
            setProducts(res.data.result.products);
          } else {
            // Fallback to all products
            const raw = allProdRes?.data?.result;
            const list = Array.isArray(allProdRes?.data?.results)
              ? allProdRes.data.results
              : Array.isArray(raw?.items)
              ? raw.items
              : Array.isArray(raw)
              ? raw
              : [];
            setProducts(
              list.map((p) => ({
                ...p,
                id: p._id,
                image: p.mainImage || p.image,
                price: p.salePrice || p.price,
                originalPrice: p.price || p.salePrice,
              }))
            );
          }
        }
      } catch (e) {
        console.error("Failed to load lowest price page data", e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [currentLocation]);

  const filteredAndSortedProducts = useMemo(() => {
    let result = products.filter(
      (p) => (p.originalPrice && p.price && p.originalPrice > p.price) || (p.price && p.salePrice && p.price > p.salePrice)
    );

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.category?.name?.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      const discA =
        a.originalPrice && a.price && a.originalPrice > a.price
          ? (a.originalPrice - a.price) / a.originalPrice
          : 0;
      const discB =
        b.originalPrice && b.price && b.originalPrice > b.price
          ? (b.originalPrice - b.price) / b.originalPrice
          : 0;

      if (sortBy === "discount_desc") return discB - discA;
      if (sortBy === "price_asc") return (a.price || 0) - (b.price || 0);
      if (sortBy === "price_desc") return (b.price || 0) - (a.price || 0);
      return 0;
    });

    return result;
  }, [products, searchQuery, sortBy]);

  const title = lowestPriceData?.title || "Lowest Price ever";
  const subtitle = lowestPriceData?.subtitle || "Unbeatable Savings • Updated hourly";

  return (
    <div className="relative z-10 py-6 w-full max-w-[1920px] mx-auto px-4 md:px-[50px] mt-24 md:mt-20 min-h-screen">
      {/* Back Button & Banner */}
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all mb-4"
        >
          <ArrowLeft size={14} />
          Back
        </button>

        {/* Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#E6F3E6] via-[#EDF7ED] to-[#F5FBF5] p-6 md:p-10 border border-[#1A4516]/10 shadow-sm"
        >
          <div className="absolute -top-12 -right-12 h-56 w-56 bg-[#1A4516]/10 rounded-full blur-3xl" />
          <div className="relative z-10 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1A4516]/10 text-[#1A4516] text-xs font-black uppercase tracking-wider mb-3">
              <Tag size={13} />
              {subtitle}
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-[#132018] tracking-tight uppercase leading-tight mb-2">
              {title}
            </h1>
            <p className="text-sm md:text-base font-medium text-[#1A4516]/80">
              Discover top-rated groceries and household essentials at guaranteed lowest prices.
            </p>
          </div>
        </motion.div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 bg-white p-3 md:p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search lowest price items..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-800 outline-none"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <span className="text-xs font-black text-slate-400 uppercase tracking-wider hidden sm:inline">
            Sort by:
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none border-none cursor-pointer"
          >
            <option value="discount_desc">Biggest Discount</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
        </div>
      </div>

      {/* Product Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredAndSortedProducts.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
          <Sparkles className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">No products found</h3>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-5">
          {filteredAndSortedProducts.map((product) => (
            <div key={product.id || product._id} className="w-full">
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LowestPricePage;
