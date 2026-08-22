import React, { useEffect, useMemo, useState } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import { useToast } from "@shared/components/ui/Toast";
import {
  HiOutlineSparkles,
  HiOutlineCheck,
  HiOutlineTrash,
  HiOutlineMagnifyingGlass,
  HiOutlineArrowPath,
  HiOutlineTag,
  HiOutlineEye,
  HiOutlineShoppingBag,
} from "react-icons/hi2";
import { Save, Tag, Sparkles, ChevronRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminApi } from "../services/adminApi";

const LowestPriceManagement = () => {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    title: "Lowest Price ever",
    subtitle: "Unbeatable Savings • Updated hourly",
    status: "active",
    mode: "curated",
    productIds: [],
    maxDisplayCount: 12,
    backgroundColor: "#E6F3E6",
    accentColor: "#1A4516",
  });

  // Catalog State for selection
  const [allProducts, setAllProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [onlyDiscounted, setOnlyDiscounted] = useState(true);
  const [populatedProductsMap, setPopulatedProductsMap] = useState({});

  // Load existing config & catalog
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [configRes, productsRes, categoriesRes] = await Promise.all([
        adminApi.getLowestPriceConfig(),
        adminApi.getProducts({ limit: 300 }),
        adminApi.getCategories(),
      ]);

      if (configRes.data?.success && configRes.data.result) {
        const c = configRes.data.result;
        const populatedMap = {};
        const pIds = [];

        (c.productIds || []).forEach((prod) => {
          if (typeof prod === "object" && prod !== null) {
            populatedMap[prod._id] = prod;
            pIds.push(prod._id);
          } else if (prod) {
            pIds.push(prod);
          }
        });

        setPopulatedProductsMap(populatedMap);
        setFormData({
          title: c.title || "Lowest Price ever",
          subtitle: c.subtitle || "Unbeatable Savings • Updated hourly",
          status: c.status || "active",
          mode: c.mode || "curated",
          productIds: pIds,
          maxDisplayCount: c.maxDisplayCount || 12,
          backgroundColor: c.backgroundColor || "#E6F3E6",
          accentColor: c.accentColor || "#1A4516",
        });
      }

      if (productsRes.data?.success) {
        const raw = productsRes.data.result;
        const list = Array.isArray(productsRes.data.results)
          ? productsRes.data.results
          : Array.isArray(raw?.items)
          ? raw.items
          : Array.isArray(raw)
          ? raw
          : [];
        setAllProducts(list);
      }

      if (categoriesRes.data?.success) {
        const list = categoriesRes.data.results || categoriesRes.data.result || [];
        setCategories(Array.isArray(list) ? list : []);
      }
    } catch (error) {
      console.error("Error loading Lowest Price data:", error);
      showToast("Failed to load Lowest Price settings", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const res = await adminApi.updateLowestPriceConfig(formData);
      if (res.data?.success) {
        showToast("Lowest Price section updated successfully!", "success");
      }
    } catch (error) {
      console.error("Error saving lowest price config:", error);
      showToast(error.response?.data?.message || "Failed to save settings", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleProductSelection = (product) => {
    const productId = product._id;
    const hasDiscount = product.price && product.salePrice && product.price > product.salePrice;
    
    setFormData((prev) => {
      const isSelected = prev.productIds.includes(productId);
      if (!isSelected && !hasDiscount) {
        showToast("Warning: This product has no discount (Sale Price = MRP). It will only appear if discounted.", "warning");
      }
      const newProductIds = isSelected
        ? prev.productIds.filter((id) => id !== productId)
        : [...prev.productIds, productId];
      return { ...prev, productIds: newProductIds };
    });
  };

  const removeProduct = (productId) => {
    setFormData((prev) => ({
      ...prev,
      productIds: prev.productIds.filter((id) => id !== productId),
    }));
  };

  // Filter products for the table
  const filteredProducts = useMemo(() => {
    let list = allProducts.filter((p) => {
      const matchesSearch =
        !searchQuery ||
        p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.slug?.toLowerCase().includes(searchQuery.toLowerCase());

      const catId = p.categoryId?._id || p.categoryId;
      const matchesCategory =
        selectedCategory === "all" || String(catId) === String(selectedCategory);

      const hasDiscount = p.price && p.salePrice && p.price > p.salePrice;
      const matchesDiscount = onlyDiscounted ? hasDiscount : true;

      return matchesSearch && matchesCategory && matchesDiscount;
    });

    // Sort by percentage discount descending
    return list.sort((a, b) => {
      const discA = a.price && a.salePrice && a.price > a.salePrice ? (a.price - a.salePrice) / a.price : 0;
      const discB = b.price && b.salePrice && b.price > b.salePrice ? (b.price - b.salePrice) / b.price : 0;
      return discB - discA;
    });
  }, [allProducts, searchQuery, selectedCategory, onlyDiscounted]);

  // Selected products array for ordering and quick preview
  const selectedProductItems = useMemo(() => {
    const map = { ...populatedProductsMap };
    allProducts.forEach((p) => {
      map[p._id] = p;
    });

    return formData.productIds
      .map((id) => map[id])
      .filter(Boolean);
  }, [formData.productIds, allProducts, populatedProductsMap]);

  return (
    <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-16">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="ds-h1">Lowest Price Section</h1>
            <Badge
              variant={formData.status === "active" ? "success" : "secondary"}
              className="text-[9px] font-black uppercase tracking-wider"
            >
              {formData.status}
            </Badge>
          </div>
          <p className="ds-description mt-0.5">
            Manage the "Lowest Price Ever" promotional showcase displayed on the customer home page.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-3 bg-white ring-1 ring-slate-200 text-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm active:scale-95"
          >
            <HiOutlineArrowPath className={cn("h-4 w-4", isLoading && "animate-spin")} />
            REFRESH
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl active:scale-95 disabled:opacity-50"
          >
            {isSaving ? (
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? "SAVING..." : "SAVE SETTINGS"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
        {/* Left 2 Columns: Settings & Product Selection */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main Controls Card */}
          <Card className="p-6 border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-2xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <Tag className="h-4 w-4 text-emerald-600" />
                Section Configuration
              </h3>
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, status: "active" }))}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                    formData.status === "active"
                      ? "bg-white text-emerald-700 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, status: "inactive" }))}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                    formData.status === "inactive"
                      ? "bg-white text-rose-600 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  Hidden
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Section Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-800 outline-none ring-1 ring-transparent focus:ring-emerald-500/20 transition-all"
                  placeholder="E.g. Lowest Price ever"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Badge / Subtitle
                </label>
                <input
                  type="text"
                  value={formData.subtitle}
                  onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-800 outline-none ring-1 ring-transparent focus:ring-emerald-500/20 transition-all"
                  placeholder="E.g. Unbeatable Savings • Updated hourly"
                />
              </div>
            </div>

            {/* Mode Selection */}
            <div className="space-y-3 pt-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Product Selection Mode
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  onClick={() => setFormData({ ...formData, mode: "curated" })}
                  className={cn(
                    "p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3",
                    formData.mode === "curated"
                      ? "border-emerald-600 bg-emerald-50/30 ring-1 ring-emerald-600/10"
                      : "border-slate-100 hover:border-slate-200 bg-white"
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0",
                      formData.mode === "curated"
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-slate-300"
                    )}
                  >
                    {formData.mode === "curated" && <HiOutlineCheck className="h-3 w-3" />}
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900">Curated (Hand-picked)</p>
                    <p className="text-[10px] font-medium text-slate-500 mt-0.5">
                      Explicitly choose which products appear in the carousel below.
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => setFormData({ ...formData, mode: "automatic" })}
                  className={cn(
                    "p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3",
                    formData.mode === "automatic"
                      ? "border-emerald-600 bg-emerald-50/30 ring-1 ring-emerald-600/10"
                      : "border-slate-100 hover:border-slate-200 bg-white"
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0",
                      formData.mode === "automatic"
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-slate-300"
                    )}
                  >
                    {formData.mode === "automatic" && <HiOutlineCheck className="h-3 w-3" />}
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900">Automatic (Highest Discount)</p>
                    <p className="text-[10px] font-medium text-slate-500 mt-0.5">
                      Automatically selects catalog items with the highest MRP percentage discount.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Curated Product Picker Table */}
          {formData.mode === "curated" && (
            <Card className="p-6 border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-2xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    <HiOutlineShoppingBag className="h-4 w-4 text-emerald-600" />
                    Select Curated Products ({formData.productIds.length} Selected)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Check the products you want to feature in the "Lowest Price" carousel.
                  </p>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative flex-1 w-full">
                  <HiOutlineMagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search products by title..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-800 outline-none"
                  />
                </div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-4 py-2.5 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none w-full sm:w-auto"
                >
                  <option value="all">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat._id} value={cat._id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 px-3 py-2 bg-emerald-50/60 rounded-xl border border-emerald-100/80 cursor-pointer shrink-0 w-full sm:w-auto">
                  <input
                    type="checkbox"
                    checked={onlyDiscounted}
                    onChange={(e) => setOnlyDiscounted(e.target.checked)}
                    className="h-3.5 w-3.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-[11px] font-bold text-emerald-800">Only Discounted</span>
                </label>
              </div>

              {/* Products Table */}
              <div className="border border-slate-100 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50/80 sticky top-0 z-10 text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="p-3 w-10 text-center">Select</th>
                      <th className="p-3">Product</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Original</th>
                      <th className="p-3">Sale Price</th>
                      <th className="p-3 text-right">Discount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs">
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 font-bold">
                          No matching products found.
                        </td>
                      </tr>
                    ) : (
                      filteredProducts.map((product) => {
                        const isSelected = formData.productIds.includes(product._id);
                        const discount =
                          product.price && product.salePrice && product.price > product.salePrice
                            ? Math.round(((product.price - product.salePrice) / product.price) * 100)
                            : 0;

                        return (
                          <tr
                            key={product._id}
                            onClick={() => toggleProductSelection(product)}
                            className={cn(
                              "cursor-pointer transition-colors hover:bg-slate-50/60",
                              isSelected && "bg-emerald-50/40"
                            )}
                          >
                            <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleProductSelection(product)}
                                className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-3">
                                <img
                                  src={
                                    product.mainImage ||
                                    product.image ||
                                    "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?w=100"
                                  }
                                  alt={product.name}
                                  className="h-10 w-10 rounded-lg object-cover bg-slate-100 shrink-0"
                                />
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-800 truncate max-w-xs">
                                    {product.name}
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    Stock: {product.stock ?? "N/A"} • {product.unit || product.weight || "1 unit"}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-[11px] font-medium text-slate-500">
                              {product.categoryId?.name || "General"}
                            </td>
                            <td className="p-3 font-semibold text-slate-400 line-through">
                              ₹{product.price || product.salePrice}
                            </td>
                            <td className="p-3 font-black text-slate-900">
                              ₹{product.salePrice || product.price}
                            </td>
                            <td className="p-3 text-right">
                              {discount > 0 ? (
                                <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-md">
                                  {discount}% OFF
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-300 font-bold">0%</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Live App Preview & Selected Tray */}
        <div className="space-y-6">
          {/* Live Mobile Preview Card */}
          <Card className="p-5 border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <HiOutlineEye className="h-4 w-4 text-emerald-600" />
                Customer App Preview
              </h3>
              <span className="text-[10px] font-bold text-slate-400">Mobile Mock</span>
            </div>

            {/* Mobile View Container */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-inner bg-slate-50">
              {/* Top Banner simulation */}
              <div className="bg-gradient-to-br from-[#E6F3E6] to-[#F5FBF5] p-3.5 border-b border-[#1A4516]/10">
                <div className="flex justify-between items-end">
                  <div>
                    <h4 className="text-xs font-bold text-[#132018] tracking-tight uppercase leading-none">
                      {formData.title || "Lowest Price ever"}
                    </h4>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="h-1.5 w-1.5 bg-[#1A4516] rounded-full animate-pulse" />
                      <span className="text-[8px] font-medium text-[#1A4516] uppercase tracking-wide opacity-90">
                        {formData.subtitle || "Unbeatable Savings • Updated hourly"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 bg-white px-2 py-0.5 rounded-full text-[#1A4516] font-bold text-[9px] shadow-sm border border-[#1A4516]/10">
                    See all
                    <ChevronRight size={10} strokeWidth={3} />
                  </div>
                </div>

                {/* Simulated product cards */}
                <div className="flex gap-2 overflow-x-hidden mt-3 pt-1">
                  {(selectedProductItems.length > 0 ? selectedProductItems.slice(0, 3) : allProducts.slice(0, 3)).map(
                    (p, idx) => {
                      const disc =
                        p.price && p.salePrice && p.price > p.salePrice
                          ? Math.round(((p.price - p.salePrice) / p.price) * 100)
                          : 25;
                      return (
                        <div
                          key={idx}
                          className="w-24 shrink-0 bg-white rounded-xl p-1.5 shadow-sm border border-slate-100 space-y-1"
                        >
                          <div className="relative h-16 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center">
                            <img
                              src={
                                p.mainImage ||
                                p.image ||
                                "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?w=100"
                              }
                              alt={p.name}
                              className="h-full w-full object-cover"
                            />
                            <span className="absolute top-1 left-1 bg-emerald-600 text-white text-[7px] font-black px-1 rounded">
                              {disc}% OFF
                            </span>
                          </div>
                          <p className="text-[9px] font-bold text-slate-800 truncate">{p.name}</p>
                          <p className="text-[9px] font-black text-slate-900">
                            ₹{p.salePrice || p.price || 199}
                          </p>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Selected Products Queue */}
          {formData.mode === "curated" && (
            <Card className="p-5 border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-2xl space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Active In Carousel ({selectedProductItems.length})
                </h3>
              </div>

              {selectedProductItems.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No products selected yet. Check products from the table on the left.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {selectedProductItems.map((prod, idx) => (
                    <div
                      key={prod._id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 hover:bg-white transition-all group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[10px] font-black text-slate-400 w-4">#{idx + 1}</span>
                        <img
                          src={
                            prod.mainImage ||
                            prod.image ||
                            "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?w=100"
                          }
                          alt={prod.name}
                          className="h-8 w-8 rounded-lg object-cover bg-slate-100 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate max-w-[140px]">
                            {prod.name}
                          </p>
                          <p className="text-[10px] font-black text-emerald-600">
                            ₹{prod.salePrice || prod.price}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeProduct(prod._id)}
                        className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                        title="Remove product"
                      >
                        <HiOutlineTrash className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default LowestPriceManagement;
