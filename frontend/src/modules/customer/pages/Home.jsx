import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useInViewAnimation } from "@/core/hooks/useInViewAnimation";
import { Sparkles, Heart, Snowflake, ChevronLeft, ChevronRight } from "lucide-react";

// MUI Icons (shared with admin & icon selector)
import HomeIcon from "@mui/icons-material/Home";
import DevicesIcon from "@mui/icons-material/Devices";
import LocalGroceryStoreIcon from "@mui/icons-material/LocalGroceryStore";
import KitchenIcon from "@mui/icons-material/Kitchen";
import ChildCareIcon from "@mui/icons-material/ChildCare";
import PetsIcon from "@mui/icons-material/Pets";
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import CardGiftcardIcon from "@mui/icons-material/CardGiftcard";
import VerifiedIcon from "@mui/icons-material/Verified";

import { motion, useScroll, useTransform } from "framer-motion";
import { isMobileOrWebView } from "@/core/utils/deviceUtils";
import { customerApi } from "../services/customerApi";
import { toast } from "sonner";
import ProductCard from "../components/shared/ProductCard";
import MainLocationHeader from "../components/shared/MainLocationHeader";
import { useProductDetail } from "../context/ProductDetailContext";
import { cn } from "@/lib/utils";
import CardBanner from "@/assets/CardBanner.jpg";
import SectionRenderer from "../components/experience/SectionRenderer";
import ExperienceBannerCarousel from "../components/experience/ExperienceBannerCarousel";
import { useLocation } from "../context/LocationContext";
import { useSettings } from "@core/context/SettingsContext";
import Lottie from "lottie-react";
import { applyCloudinaryTransform, DEFAULT_CATEGORY_IMAGE } from "@/core/utils/imageUtils";
import { getJSON, remove as removeStorage, STORAGE_KEYS } from "@core/utils/storage";

import {
  MARQUEE_MESSAGES,
  ICON_COMPONENTS,
} from "../constants/homeConstants";
import PromoMarquee from "../components/home/PromoMarquee";
import QuickCategorySlider from "../components/home/QuickCategorySlider";
import LowestPriceSection from "../components/home/LowestPriceSection";
import OfferSections from "../components/home/OfferSections";

const DEFAULT_CATEGORY_THEME = {
  gradient: "linear-gradient(to bottom, var(--primary), var(--brand-400))",
  shadow: "shadow-brand-500/20",
  accent: "text-[#1A1A1A]",
};

const CATEGORY_METADATA = {
  All: {
    icon: HomeIcon,
    theme: DEFAULT_CATEGORY_THEME,
    banner: {
      title: "HOUSEFULL",
      subtitle: "SALE",
      floatingElements: "sparkles",
    },
  },
  Grocery: {
    icon: LocalGroceryStoreIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #FF9F1C, #FFBF69)",
      shadow: "shadow-orange-500/20",
      accent: "text-orange-900",
    },
    banner: {
      title: "SUPERSAVER",
      subtitle: "FRESH & FAST",
      floatingElements: "leaves",
    },
  },
  Wedding: {
    icon: CardGiftcardIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #FF4D6D, #FF8FA3)",
      shadow: "shadow-rose-500/20",
      accent: "text-rose-900",
    },
    banner: { title: "WEDDING", subtitle: "BLISS", floatingElements: "hearts" },
  },
  "Home & Kitchen": {
    icon: KitchenIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #BC6C25, #DDA15E)",
      shadow: "shadow-amber-500/20",
      accent: "text-amber-900",
    },
    banner: { title: "HOME", subtitle: "KITCHEN", floatingElements: "smoke" },
  },
  Electronics: {
    icon: DevicesIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #7209B7, #B5179E)",
      shadow: "shadow-purple-500/20",
      accent: "text-purple-900",
    },
    banner: {
      title: "TECH FEST",
      subtitle: "GADGETS",
      floatingElements: "tech",
    },
  },
  Kids: {
    icon: ChildCareIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #4CC9F0, #A0E7E5)",
      shadow: "shadow-brand-500/20",
      accent: "text-brand-900",
    },
    banner: {
      title: "LITTLE ONE",
      subtitle: "CARE",
      floatingElements: "bubbles",
    },
  },
  "Pet Supplies": {
    icon: PetsIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #FB8500, #FFB703)",
      shadow: "shadow-yellow-500/20",
      accent: "text-yellow-900",
    },
    banner: { title: "PAWSOME", subtitle: "DEALS", floatingElements: "bones" },
  },
  Sports: {
    icon: SportsSoccerIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #4361EE, #4895EF)",
      shadow: "shadow-brand-500/20",
      accent: "text-brand-900",
    },
    banner: { title: "SPORTS", subtitle: "GEAR", floatingElements: "confetti" },
  },
};

const ALL_CATEGORY = {
  id: "all",
  _id: "all",
  name: "All",
  icon: HomeIcon,
  theme: DEFAULT_CATEGORY_THEME,
  headerColor: "#0e7490",
  headerFontColor: "#111111",
  headerIconColor: "#111111",
  banner: {
    title: "HOUSEFULL",
    subtitle: "SALE",
    floatingElements: "sparkles",
    textColor: "text-white",
  },
};

const EMPTY_HERO_CONFIG = {
  banners: { items: [] },
  categoryIds: [],
};

const homePageDataCache = new Map();
const headerSectionsMemoryCache = {};
const heroConfigMemoryCache = {};
const headerProductsMemoryCache = {};

const getHomePageDataCacheKey = (location) => {
  const lat = Number(location?.latitude);
  const lng = Number(location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "home:no-location";
  return `home:${lat.toFixed(5)}:${lng.toFixed(5)}`;
};

const getCachedHomePageData = (location) =>
  homePageDataCache.get(getHomePageDataCacheKey(location)) || null;

const Home = () => {
  const { scrollY } = useScroll();
  const { isOpen: isProductDetailOpen } = useProductDetail();
  const { currentLocation } = useLocation();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const quickCatsRef = useRef(null);
  const cachedHomePageData = getCachedHomePageData(currentLocation);

  const { ref: particleContainerRef, isVisible: particlesVisible } = useInViewAnimation();
  const heroRef = useRef(null);
  const [heroVisible, setHeroVisible] = useState(true);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setHeroVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting), { rootMargin: "0px" });
    const el = heroRef.current;
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [categories, setCategories] = useState(() => cachedHomePageData?.categories || [ALL_CATEGORY]);
  const [allDbCategories, setAllDbCategories] = useState(() => cachedHomePageData?.allDbCategories || []);
  const [activeCategory, setActiveCategory] = useState(() => cachedHomePageData?.activeCategory || ALL_CATEGORY);
  const [products, setProducts] = useState(() => cachedHomePageData?.products || []);
  const productsRef = useRef(cachedHomePageData?.products || []);
  const [headerProducts, setHeaderProducts] = useState([]);
  const [isHeaderLoading, setIsHeaderLoading] = useState(false);
  const [quickCategories, setQuickCategories] = useState(() => cachedHomePageData?.quickCategories || []);
  const [isLoading, setIsLoading] = useState(() => !cachedHomePageData);
  const [experienceSections, setExperienceSections] = useState(() => cachedHomePageData?.experienceSections || []);
  const [headerSections, setHeaderSections] = useState([]);
  const [heroConfig, setHeroConfig] = useState(() => cachedHomePageData?.heroConfig || heroConfigMemoryCache.__home__ || EMPTY_HERO_CONFIG);
  const [mobileBannerIndex, setMobileBannerIndex] = useState(0);
  const [isInstantBannerJump, setIsInstantBannerJump] = useState(false);
  const [categoryMap, setCategoryMap] = useState(() => cachedHomePageData?.categoryMap || {});
  const [pendingReturn, setPendingReturn] = useState(null);
  const [offerSections, setOfferSections] = useState(() => cachedHomePageData?.offerSections || []);
  const [lowestPriceSection, setLowestPriceSection] = useState(() => cachedHomePageData?.lowestPriceSection || null);
  const [noServiceData, setNoServiceData] = useState(null);

  useEffect(() => {
    productsRef.current = products || [];
  }, [products]);

  useEffect(() => {
    if (products.length === 0 && !isLoading) {
      import("@/assets/lottie/animation.json").then((m) => setNoServiceData(m.default)).catch(() => {});
    }
  }, [products.length, isLoading]);

  const applyHomePageData = (data, { cacheKey, persist = true } = {}) => {
    if (!data) return;
    setCategoryMap(data.categoryMap || {});
    setCategories(data.categories || [ALL_CATEGORY]);
    if (data.allDbCategories) setAllDbCategories(data.allDbCategories);
    setQuickCategories(data.quickCategories || []);
    setProducts(data.products || []);
    setExperienceSections(data.experienceSections || []);
    setOfferSections(data.offerSections || []);
    if (data.lowestPriceSection !== undefined) setLowestPriceSection(data.lowestPriceSection);
    if (data.heroConfig) setHeroConfig(data.heroConfig);
    setActiveCategory((prev) => {
      const parsed = getJSON(STORAGE_KEYS.EXPERIENCE_RETURN, null, { storage: "session" });
      if (parsed?.headerId) {
        const match = (data.formattedHeaders || []).find((h) => h._id === parsed.headerId);
        if (match) return match;
      }
      if (!prev || prev._id === "all") return data.activeCategory || data.categories?.[0] || ALL_CATEGORY;
      return (data.categories || []).find((cat) => cat._id === prev._id) || data.activeCategory || prev;
    });
    if (persist && cacheKey) homePageDataCache.set(cacheKey, data);
  };

  const fetchData = async ({ forceRefresh = false } = {}) => {
    const cacheKey = getHomePageDataCacheKey(currentLocation);
    if (!forceRefresh) {
      const cached = homePageDataCache.get(cacheKey);
      if (cached) {
        applyHomePageData(cached, { cacheKey, persist: false });
        setIsLoading(false);
        return;
      }
    }
    setIsLoading(true);
    try {
      const hasValidLocation = Number.isFinite(currentLocation?.latitude) && Number.isFinite(currentLocation?.longitude);
      const productParams = { limit: 20 };
      if (hasValidLocation) {
        productParams.lat = currentLocation.latitude;
        productParams.lng = currentLocation.longitude;
        productParams.sort = 'nearest';
      }
      const [catRes, prodRes, expRes, sectionsRes, headerCategoriesRes, lowestPriceRes] = await Promise.all([
        customerApi.getCategories(),
        hasValidLocation ? customerApi.getProducts(productParams) : Promise.resolve({ data: { success: true, result: { items: [] } } }),
        customerApi.getExperienceSections({ pageType: "home" }).catch(() => null),
        hasValidLocation ? customerApi.getOfferSections({ lat: currentLocation.latitude, lng: currentLocation.longitude }).catch(() => ({ data: {} })) : Promise.resolve({ data: { results: [] } }),
        customerApi.getHeaderCategories().catch(() => ({ data: { result: [] } })),
        customerApi.getLowestPriceSection(hasValidLocation ? { lat: currentLocation.latitude, lng: currentLocation.longitude } : {}).catch(() => ({ data: {} })),
      ]);
      const nextHomeData = {
        categories: [ALL_CATEGORY],
        activeCategory: ALL_CATEGORY,
        products: [],
        quickCategories: [],
        experienceSections: [],
        offerSections: [],
        lowestPriceSection: lowestPriceRes?.data?.result || null,
        categoryMap: {},
        formattedHeaders: [],
        allDbCategories: [],
        heroConfig: heroConfigMemoryCache.__home__ || EMPTY_HERO_CONFIG,
      };
      if (catRes.data.success) {
        const dbCats = catRes.data.results || catRes.data.result || [];
        nextHomeData.allDbCategories = dbCats;
        const catMap = {};
        dbCats.forEach((c) => { if (c.type === "category") catMap[c._id] = c; });
        nextHomeData.categoryMap = catMap;
        const formattedHeaders = (headerCategoriesRes?.data?.result || []).map((mapping) => {
          const cat = mapping.categoryId || {};
          const catName = mapping.customName || cat.name || "Unknown";
          const meta = CATEGORY_METADATA[catName] || CATEGORY_METADATA[catName.toUpperCase()] || CATEGORY_METADATA[cat.name] || CATEGORY_METADATA[cat.name?.toUpperCase()] || { icon: Sparkles, theme: DEFAULT_CATEGORY_THEME, banner: { title: catName.toUpperCase(), subtitle: "TOP PICKS", floatingElements: "sparkles" } };
          const IconComp = (mapping.iconId && ICON_COMPONENTS[mapping.iconId]) || (cat.iconId && ICON_COMPONENTS[cat.iconId]) || meta.icon || Sparkles;
          
          return { 
            ...cat, 
            id: cat._id, 
            name: catName,
            image: mapping.image || cat.image,
            icon: IconComp, 
            theme: meta.theme, 
            banner: { ...meta.banner, textColor: "text-white" } 
          };
        });
        nextHomeData.formattedHeaders = formattedHeaders;
        const allHeaderFromAdmin = formattedHeaders.find((h) => (h.slug?.toLowerCase() === "all") || (h.name?.toLowerCase() === "all"));
        const mergedAllCategory = allHeaderFromAdmin ? { ...ALL_CATEGORY, headerColor: allHeaderFromAdmin.headerColor || ALL_CATEGORY.headerColor, headerFontColor: allHeaderFromAdmin.headerFontColor || ALL_CATEGORY.headerFontColor, headerIconColor: allHeaderFromAdmin.headerIconColor || ALL_CATEGORY.headerIconColor, icon: allHeaderFromAdmin.icon || ALL_CATEGORY.icon } : ALL_CATEGORY;
        nextHomeData.categories = [mergedAllCategory, ...formattedHeaders.filter((h) => !((h.slug?.toLowerCase() === "all") || (h.name?.toLowerCase() === "all")))];
        nextHomeData.activeCategory = mergedAllCategory;
        nextHomeData.quickCategories = dbCats.filter((cat) => cat.type === "category" && cat.status === "active").map((cat) => ({ id: cat._id, name: cat.name, image: cat.image || DEFAULT_CATEGORY_IMAGE }));
      }
      if (prodRes.data.success) {
        const rawResult = prodRes.data.result;
        const dbProds = Array.isArray(prodRes.data.results) ? prodRes.data.results : Array.isArray(rawResult?.items) ? rawResult.items : Array.isArray(rawResult) ? rawResult : [];
        nextHomeData.products = dbProds.map((p) => ({ ...p, id: p._id, image: p.mainImage || p.image || "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400", price: p.salePrice || p.price, originalPrice: p.price, weight: p.weight || "1 unit", deliveryTime: "8-15 mins" }));
      }
      if (expRes?.data?.success) nextHomeData.experienceSections = Array.isArray(expRes.data.result || expRes.data.results) ? (expRes.data.result || expRes.data.results) : [];
      const sectionsList = sectionsRes?.data?.results || sectionsRes?.data?.result || sectionsRes?.data;
      nextHomeData.offerSections = Array.isArray(sectionsList) ? sectionsList : [];
      applyHomePageData(nextHomeData, { cacheKey });
    } catch (error) { console.error("Error:", error); } finally { setIsLoading(false); }
  };

  const hydrateSelectedSectionProducts = async (sections = []) => {
    const selectedProductIds = Array.from(new Set(sections.flatMap((s) => s?.displayType === "products" ? (s?.config?.products?.productIds || []) : []).map((id) => String(id || "").trim()).filter(Boolean)));
    if (!selectedProductIds.length) return;
    const existingIds = new Set(productsRef.current.map((p) => String(p?._id || p?.id || "").trim()));
    const missingIds = selectedProductIds.filter((id) => !existingIds.has(id));
    if (!missingIds.length) return;
    try {
      const locationParams = Number.isFinite(currentLocation?.latitude) ? { lat: currentLocation.latitude, lng: currentLocation.longitude } : undefined;
      const missingResults = await Promise.allSettled(missingIds.map((id) => customerApi.getProductById(id, locationParams)));
      const fetchedMissing = missingResults.filter((r) => r.status === "fulfilled").flatMap((r) => { const p = r.value?.data?.result || r.value?.data?.results; return Array.isArray(p) ? p : (p ? [p] : []); }).map((p) => ({ ...p, id: p._id, image: p.mainImage || p.image || "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400", price: p.salePrice || p.price, originalPrice: p.price, weight: p.weight || "1 unit", deliveryTime: "8-15 mins" }));
      if (fetchedMissing.length) setProducts((prev) => { const merged = [...prev]; const mergedIds = new Set(merged.map((p) => String(p?._id || p?.id || "").trim())); fetchedMissing.forEach((p) => { const key = String(p?._id || p?.id || "").trim(); if (!mergedIds.has(key)) { merged.push(p); mergedIds.add(key); } }); return merged; });
    } catch (e) {}
  };

  useEffect(() => { fetchData(); }, [currentLocation?.latitude, currentLocation?.longitude]);
  const headerSectionsCache = useRef(headerSectionsMemoryCache);
  const heroConfigCache = useRef(heroConfigMemoryCache);
  const headerProductsCache = useRef(headerProductsMemoryCache);

  // Fetch header-specific experience sections
  useEffect(() => {
    const fetchHeaderSections = async () => {
      if (!activeCategory || activeCategory._id === "all" || activeCategory.id === "all") { setHeaderSections([]); return; }
      const cacheKey = activeCategory._id || activeCategory.id;
      if (headerSectionsCache.current[cacheKey]) { setHeaderSections(headerSectionsCache.current[cacheKey]); return; }
      try {
        const res = await customerApi.getExperienceSections({ pageType: "header", headerId: activeCategory._id || activeCategory.id });
        if (res.data.success) { const sections = Array.isArray(res.data.result || res.data.results) ? (res.data.result || res.data.results) : []; headerSectionsCache.current[cacheKey] = sections; setHeaderSections(sections); await hydrateSelectedSectionProducts(sections); }
        else setHeaderSections([]);
      } catch (e) { setHeaderSections([]); }
    };
    fetchHeaderSections();
  }, [activeCategory]);

  // Fetch header-specific hero banner config
  useEffect(() => {
    const fetchHeroConfig = async () => {
      try {
        const isHeader = activeCategory && activeCategory._id !== "all" && activeCategory.id !== "all";
        const headerKey = activeCategory?._id || activeCategory?.id;
        const cacheKey = isHeader ? headerKey : "__home__";
        if (heroConfigCache.current[cacheKey]) { setHeroConfig(heroConfigCache.current[cacheKey]); return; }
        let payload = null;
        if (isHeader) { const res = await customerApi.getHeroConfig({ pageType: "header", headerId: headerKey }); if (res.data?.success && res.data?.result) payload = res.data.result; }
        if (!payload || (payload.banners?.items?.length === 0 && !payload.categoryIds?.length)) { const homeRes = await customerApi.getHeroConfig({ pageType: "home" }); if (homeRes.data?.success && homeRes.data?.result) payload = homeRes.data.result; }
        const resolved = payload && (payload.banners?.items?.length > 0 || payload.categoryIds?.length > 0) ? { banners: payload.banners || { items: [] }, categoryIds: payload.categoryIds || [] } : { banners: { items: [] }, categoryIds: [] };
        heroConfigCache.current[cacheKey] = resolved;
        if (cacheKey === "__home__") { const homeCacheKey = getHomePageDataCacheKey(currentLocation); const cachedHomeData = homePageDataCache.get(homeCacheKey); if (cachedHomeData) homePageDataCache.set(homeCacheKey, { ...cachedHomeData, heroConfig: resolved }); }
        setHeroConfig(resolved);
      } catch (e) { setHeroConfig(EMPTY_HERO_CONFIG); }
    };
    fetchHeroConfig();
  }, [activeCategory, currentLocation?.latitude, currentLocation?.longitude]);

  // Fetch all products of the specific header category
  useEffect(() => {
    const isHeader = activeCategory && activeCategory._id !== "all" && activeCategory.id !== "all";
    if (!isHeader) {
      setHeaderProducts([]);
      setIsHeaderLoading(false);
      return;
    }

    const fetchHeaderProducts = async () => {
      const headerKey = activeCategory._id || activeCategory.id;
      const cacheKey = `${headerKey}:${currentLocation?.latitude || ""}:${currentLocation?.longitude || ""}`;
      if (headerProductsCache.current[cacheKey]) {
        setHeaderProducts(headerProductsCache.current[cacheKey]);
        setIsHeaderLoading(false);
        return;
      }

      setIsHeaderLoading(true);
      try {
        const hasValidLocation =
          Number.isFinite(currentLocation?.latitude) &&
          Number.isFinite(currentLocation?.longitude);

        const params = {
          headerId: headerKey,
          limit: 100,
        };
        if (hasValidLocation) {
          params.lat = currentLocation.latitude;
          params.lng = currentLocation.longitude;
          params.sort = 'nearest';
        }

        const res = await customerApi.getProducts(params);
        if (res.data?.success) {
          const rawResult = res.data.result;
          const dbProds = Array.isArray(res.data.results)
            ? res.data.results
            : Array.isArray(rawResult?.items)
            ? rawResult.items
            : Array.isArray(rawResult)
            ? rawResult
            : [];

          const formatted = dbProds.map((p) => ({
            ...p,
            id: p._id,
            image:
              p.mainImage ||
              p.image ||
              "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400",
            price: p.salePrice || p.price,
            originalPrice: p.price,
            weight: p.weight || "1 unit",
            deliveryTime: "8-15 mins",
          }));

          headerProductsCache.current[cacheKey] = formatted;
          setHeaderProducts(formatted);
        } else {
          setHeaderProducts([]);
        }
      } catch (err) {
        console.error("Error fetching header products:", err);
        setHeaderProducts([]);
      } finally {
        setIsHeaderLoading(false);
      }
    };

    fetchHeaderProducts();
  }, [activeCategory, currentLocation?.latitude, currentLocation?.longitude]);

  useEffect(() => {
    const firstUrl = heroConfig?.banners?.items?.[0]?.imageUrl;
    if (!firstUrl) return;
    const link = document.createElement("link");
    link.rel = "preload"; link.as = "image"; link.href = applyCloudinaryTransform(firstUrl, "f_auto,q_auto,c_fill,g_auto,w_824,h_380");
    link.setAttribute("fetchpriority", "high"); document.head.appendChild(link);
    return () => { if (link.parentNode) link.parentNode.removeChild(link); };
  }, [heroConfig?.banners?.items?.[0]?.imageUrl]);

  useEffect(() => {
    const totalSlides = 3;
    const intervalId = setInterval(() => { setMobileBannerIndex((prev) => prev >= totalSlides - 1 ? prev : prev + 1); }, 3500);
    return () => clearInterval(intervalId);
  }, []);

  const handleBannerTransitionEnd = () => { if (mobileBannerIndex === 2) { setIsInstantBannerJump(true); setMobileBannerIndex(0); } };
  useEffect(() => { if (!isInstantBannerJump) return; const id = requestAnimationFrame(() => setIsInstantBannerJump(false)); return () => cancelAnimationFrame(id); }, [isInstantBannerJump]);

  const productsById = useMemo(() => {
    const map = {};
    products.forEach((p) => { map[p._id || p.id] = p; });
    headerProducts.forEach((p) => { map[p._id || p.id] = p; });
    return map;
  }, [products, headerProducts]);

  const isAllTab = !activeCategory || activeCategory._id === "all" || activeCategory.id === "all";

  const effectiveQuickCategories = useMemo(() => {
    // 1. If on "ALL" tab: show all active categories across all headers
    if (isAllTab) {
      return (allDbCategories || [])
        .filter((cat) => cat.type === "category" && cat.status === "active")
        .map((cat) => ({
          id: cat._id,
          name: cat.name,
          image: cat.image || DEFAULT_CATEGORY_IMAGE,
        }));
    }

    // 2. If on a specific header category: strictly show ONLY categories belonging to this header
    if (activeCategory) {
      const headerIdStr = String(activeCategory._id || activeCategory.id || "");

      // Check if heroConfig explicitly configured categoryIds for this specific header
      const ids = heroConfig.categoryIds || [];
      if (ids.length > 0) {
        const resolved = ids
          .map((id) => categoryMap[id])
          .filter(Boolean)
          .filter(
            (c) =>
              c.status === "active" &&
              (String(c.parentId) === headerIdStr ||
                String(c.parentId?._id) === headerIdStr ||
                String(c.headerId) === headerIdStr ||
                String(c.headerId?._id) === headerIdStr)
          )
          .map((c) => ({
            id: c._id,
            name: c.name,
            image: c.image || DEFAULT_CATEGORY_IMAGE,
          }));
        if (resolved.length > 0) return resolved;
      }

      // Find all categories belonging strictly to this header
      const childCategories = (allDbCategories || []).filter(
        (cat) =>
          cat.type === "category" &&
          cat.status === "active" &&
          (String(cat.parentId) === headerIdStr ||
            String(cat.parentId?._id) === headerIdStr ||
            String(cat.headerId) === headerIdStr ||
            String(cat.headerId?._id) === headerIdStr)
      );

      return childCategories.map((cat) => ({
        id: cat._id,
        name: cat.name,
        image: cat.image || DEFAULT_CATEGORY_IMAGE,
      }));
    }

    return [];
  }, [heroConfig.categoryIds, categoryMap, isAllTab, activeCategory, allDbCategories]);

  const effectiveLowestPriceProducts = useMemo(() => {
    if (isAllTab) {
      return (
        lowestPriceSection?.products?.length > 0
          ? lowestPriceSection.products
          : products
      );
    }

    const headerIdStr = String(activeCategory?._id || activeCategory?.id || "");
    const lpProducts = lowestPriceSection?.products || [];
    const matched = lpProducts.filter(
      (p) =>
        String(p.headerId?._id || p.headerId) === headerIdStr ||
        String(p.categoryId?.parentId || p.categoryId?.parentId?._id) === headerIdStr
    );
    if (matched.length > 0) return matched;

    if (headerProducts.length > 0) {
      return [...headerProducts]
        .sort((a, b) => {
          const discA = Number(a.originalPrice || a.price || 0) - Number(a.price || 0);
          const discB = Number(b.originalPrice || b.price || 0) - Number(b.price || 0);
          return discB - discA;
        })
        .slice(0, 12);
    }

    return [];
  }, [isAllTab, activeCategory, lowestPriceSection, products, headerProducts]);

  const sectionsForRenderer = headerSections.length ? headerSections : experienceSections;
  const isMobile = useMemo(() => isMobileOrWebView(), []);
  const opacity = useTransform(scrollY, (heroVisible && !isMobile) ? [0, 300] : [0, 0], [1, 0.6]);
  const y = useTransform(scrollY, (heroVisible && !isMobile) ? [0, 300] : [0, 0], [0, 80]);
  const scale = useTransform(scrollY, (heroVisible && !isMobile) ? [0, 300] : [0, 0], [1, 0.95]);
  const pointerEvents = useTransform(scrollY, (heroVisible && !isMobile) ? [0, 100] : [0, 0], ["auto", "none"]);

  useEffect(() => {
    if (!pendingReturn?.sectionId) return;
    const allSections = headerSections.length ? headerSections : experienceSections;
    if (!allSections.length) return;
    if (allSections.some((s) => s._id === pendingReturn.sectionId)) { const el = document.getElementById(`section-${pendingReturn.sectionId}`); if (el) { el.scrollIntoView({ behavior: "instant", block: "start" }); removeStorage(STORAGE_KEYS.EXPERIENCE_RETURN, { storage: "session" }); setPendingReturn(null); } }
  }, [headerSections, experienceSections, pendingReturn]);

  const renderFloatingElements = (type, isVisible = true) => {
    if (isMobile) return null;
    return null;
  };

  return (
    <div className={`min-h-screen pt-[200px] md:pt-[152px] ${products.length === 0 && !isLoading && isAllTab ? "bg-white" : "bg-[#F5F7F8]"}`}>
      <div className={cn("contents", isProductDetailOpen && "hidden md:contents")}>
        <MainLocationHeader categories={categories} activeCategory={activeCategory} onCategorySelect={setActiveCategory} />
      </div>

      {products.length === 0 && !isLoading && isAllTab ? (
        <div className="flex flex-col items-center justify-center pt-24 pb-48">
          <div className="w-64 h-64 md:w-96 md:h-96 mb-8">{noServiceData && <Lottie animationData={noServiceData} loop={true} />}</div>
          <h3 className="text-3xl md:text-5xl font-black text-slate-800 text-center uppercase">Service <span className="text-primary">Unavailable</span></h3>
          <p className="text-slate-500 font-bold max-w-md text-center px-10 text-sm md:text-lg opacity-80">Ah! We haven't reached your neighborhood yet.</p>
          <button onClick={() => window.location.reload()} className="mt-12 px-10 py-4 bg-primary text-white font-black rounded-[24px] uppercase text-[13px] tracking-widest transition-all active:scale-95">Check Again</button>
        </div>
      ) : (
        <>
          {/* Banners */}
          <motion.div ref={heroRef} className="block will-change-transform max-w-7xl mx-auto" style={isMobile ? { opacity: 1 } : { opacity, y, scale, pointerEvents }}>
            {heroConfig?.banners?.items?.length > 0 ? (
              <div className="mt-2 md:mt-1 mb-2">
                <ExperienceBannerCarousel items={heroConfig.banners.items} />
              </div>
            ) : (
              <div className="relative w-full px-4 mt-6 mb-2">
                <div className="w-full h-[155px] bg-gradient-to-r from-[#1A4516] to-[#256121] rounded-lg p-5 relative overflow-hidden flex items-center shadow-xl">
                  <div className="relative z-10 w-3/5 flex flex-col items-start gap-1">
                    <h4 className="text-[19px] sm:text-[21px] leading-[1.1] font-bold text-white">
                      Fresh Vegetables<br/>Big Savings
                    </h4>
                    <button className="bg-white text-[#1A4516] px-5 py-2 rounded-xl font-bold text-[12px] mt-2 shadow-sm active:scale-95 transition-transform">
                      Shop Now
                    </button>
                  </div>
                  <div className="absolute bottom-[-10px] right-[-20px] w-1/2 h-[120%] flex items-end justify-end pointer-events-none">
                    <img src="/vegetable-basket-banner.png" alt="Fresh Vegetables" className="object-contain h-full w-auto drop-shadow-2xl" />
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          {/* Shop by Category */}
          <QuickCategorySlider categories={effectiveQuickCategories} onCategoryClick={(id) => id === "all" ? navigate("/categories") : navigate(`/category/${id}`)} />

          {/* Lowest Price Ever Section */}
          {lowestPriceSection ? (
            lowestPriceSection.isActive !== false && effectiveLowestPriceProducts.length > 0 && (
              <LowestPriceSection
                title={lowestPriceSection.title || "Lowest Price ever"}
                subtitle={lowestPriceSection.subtitle || "Unbeatable Savings • Updated hourly"}
                products={effectiveLowestPriceProducts}
                onSeeAll={() => navigate("/lowest-price")}
              />
            )
          ) : (
            effectiveLowestPriceProducts.length > 0 && (
              <LowestPriceSection products={effectiveLowestPriceProducts} onSeeAll={() => navigate("/lowest-price")} />
            )
          )}

          {/* ALL Tab specific sections */}
          {isAllTab && (
            <>
              <OfferSections sections={offerSections} noServiceData={noServiceData} />
              {sectionsForRenderer.length > 0 && (
                <div className="w-full px-4 md:px-6 lg:px-8 py-6 md:py-10">
                  <SectionRenderer sections={sectionsForRenderer} productsById={productsById} categoriesById={categoryMap} />
                </div>
              )}
            </>
          )}

          {/* Specific Header Category Tab (e.g. Grocery, Beauty, Electronics) */}
          {!isAllTab && (
            <>
              {/* Header Experience Sections (if any configured for this category) */}
              {headerSections.length > 0 && (
                <div className="w-full px-4 md:px-6 lg:px-8 py-4 md:py-6">
                  <SectionRenderer sections={headerSections} productsById={productsById} categoriesById={categoryMap} />
                </div>
              )}

              {/* ALL Products Section for this Header Category */}
              <div className="w-full px-4 md:px-6 lg:px-8 mt-6 mb-16">
                <div className="flex justify-between items-end mb-4 px-1 md:px-0">
                  <div>
                    <h2 className="text-[18px] sm:text-[20px] font-bold tracking-tight text-[#1A4516] leading-none uppercase">
                      All Products
                    </h2>
                    <p className="text-[11px] sm:text-[12px] text-slate-500 font-medium mt-1">
                      Explore all items in {activeCategory?.name || "this category"}
                    </p>
                  </div>
                  {!isHeaderLoading && (
                    <span className="text-[11px] sm:text-[12px] font-bold text-[#1A4516] bg-[#1A4516]/10 px-3 py-1 rounded-full">
                      {headerProducts.length} {headerProducts.length === 1 ? "Product" : "Products"}
                    </span>
                  )}
                </div>

                {isHeaderLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
                    ))}
                  </div>
                ) : headerProducts.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                    {headerProducts.map((product) => (
                      <ProductCard
                        key={product.id || product._id}
                        product={product}
                        className="bg-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.08)] hover:shadow-md transition-shadow"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white rounded-2xl border border-slate-100 shadow-sm my-4">
                    <div className="w-12 h-12 rounded-full bg-[#1A4516]/10 flex items-center justify-center text-[#1A4516] mb-3 font-bold text-lg">
                      🛍️
                    </div>
                    <h4 className="text-base font-bold text-slate-800">No products available</h4>
                    <p className="text-xs text-slate-500 max-w-xs mt-1">
                      We couldn't find any products in {activeCategory?.name || "this category"} right now.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Home;
