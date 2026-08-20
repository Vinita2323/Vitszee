import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import Lottie from "lottie-react";
import LocationDrawer from "./LocationDrawer";
import { useLocation } from "../../context/LocationContext";
import { useProductDetail } from "../../context/ProductDetailContext";
import { useSettings } from "@core/context/SettingsContext";
import { cn } from "@/lib/utils";
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";
import {
  buildHeaderGradient,
  buildMiniCartColor,
  buildSearchBarBackgroundColor,
  shiftHex,
} from "../../utils/headerTheme";
import LogoImage from "../../../../assets/LogoVitszee.png";

// MUI Icons
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import SearchIcon from "@mui/icons-material/Search";
import MicIcon from "@mui/icons-material/Mic";
import ChevronDownIcon from "@mui/icons-material/KeyboardArrowDown";
import FavoriteBorderOutlinedIcon from "@mui/icons-material/FavoriteBorderOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";

function CategoryNavColumn({
  cat,
  isActive,
  onCategorySelect,
}) {
  return (
    <motion.div
      layout
      whileTap={{ scale: 0.96 }}
      onClick={() => onCategorySelect && onCategorySelect(cat)}
      className="relative flex flex-col items-center shrink-0 cursor-pointer snap-start"
    >
      <div 
        className={cn(
          "flex flex-col items-center justify-center rounded-[14px] py-1.5 px-2 transition-colors duration-200",
          isActive ? "bg-[#F3F9F1]" : "bg-transparent"
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center md:h-10 md:w-10">
          {typeof cat.icon === "function" ||
          (typeof cat.icon === "object" && cat.icon.$$typeof) ? (
            <cat.icon
              sx={{
                fontSize: { xs: 22, md: 26 },
                color: isActive ? "#1A5C16" : "#475569",
                transition: "color 0.2s",
              }}
            />
          ) : (
            <img
              src={applyCloudinaryTransform(cat.icon, "f_auto,q_auto,w_100")}
              alt={cat.name}
              loading="lazy"
              className="h-6 w-6 object-contain md:h-8 md:w-8"
              style={{ filter: isActive ? "none" : "grayscale(30%)" }}
            />
          )}
        </div>
        <span
          className={cn(
            "mt-1 block max-w-full truncate text-center text-[10px] uppercase tracking-wide",
            isActive ? "font-bold text-[#1A5C16]" : "font-medium text-slate-600",
          )}
        >
          {cat.name}
        </span>
      </div>
      {isActive && (
        <motion.div
          layoutId="active-category-underline"
          className="h-[3px] w-10 bg-[#1A5C16] rounded-full mt-1.5"
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      )}
      {!isActive && (
        <div className="h-[3px] mt-1.5 opacity-0" />
      )}
    </motion.div>
  );
}

const MainLocationHeader = ({
  categories = [],
  activeCategory,
  onCategorySelect,
}) => {
  const { scrollY } = useScroll();
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const { currentLocation, refreshLocation, isFetchingLocation } =
    useLocation();
  const { isOpen: isProductDetailOpen } = useProductDetail();
  const { settings } = useSettings();
  const appName = settings?.appName || "App";
  const logoUrl = "/LogoVitszee.png";
  const navigate = useNavigate();

  // Search Logic
  const handleSearchClick = () => {
    navigate("/search");
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      navigate("/search", { state: { query: e.target.value } });
    }
  };

  // Search placeholder animation (removed for static text in new design)
  const searchPlaceholder = "Search for vegetables, fruits, grocery...";

  // Smooth scroll interpolations
  const headerTopPadding = useTransform(scrollY, [0, 160], [16, 12]);
  const headerBottomPadding = useTransform(scrollY, [0, 160], [4, 3]);
  const headerRoundness = useTransform(scrollY, [0, 160], [24, 24]);
  const bgOpacity = useTransform(scrollY, [0, 160], [1, 0.98]);

  // Content animations
  const contentHeight = useTransform(scrollY, [0, 160], ["76px", "0px"]);
  const contentOpacity = useTransform(scrollY, [0, 160], [1, 0]);
  const navHeight = useTransform(scrollY, [0, 200], ["60px", "0px"]);
  const navOpacity = useTransform(scrollY, [0, 200], [1, 0]);
  const navMargin = useTransform(scrollY, [0, 200], [4, 0]);
  const categorySpacing = useTransform(scrollY, [0, 200], [3, 0]);
  const cartOpacity = useTransform(scrollY, [0, 110, 150], [1, 0.7, 0]);
  const cartScale = useTransform(scrollY, [0, 110, 150], [1, 0.9, 0.75]);

  // Helper to hide elements completely when collapsed to prevent clicks
  const displayContent = useTransform(scrollY, (value) =>
    value > 160 ? "none" : "block",
  );
  const displayNav = useTransform(scrollY, (value) =>
    value > 200 ? "none" : "flex",
  );
  const displayCart = useTransform(scrollY, (value) =>
    value > 150 ? "none" : "block",
  );

  const baseHeaderColor = "#FFFFFF";
  const headerFontColor = "#111111";
  const headerIconColor = "#1A4516";
  
  const headerGradient = "none";
  const searchBarBg = "#F3F4F6";
  const categoryAccent = headerIconColor;

  useEffect(() => {
    const c = buildMiniCartColor(baseHeaderColor);
    document.documentElement.style.setProperty("--customer-mini-cart-color", c);
    return () => {
      document.documentElement.style.removeProperty(
        "--customer-mini-cart-color",
      );
    };
  }, [baseHeaderColor]);

  return (
    <>
      <div
        className={cn(
          "fixed top-0 left-0 right-0 z-200",
          isProductDetailOpen && "hidden md:block",
        )}>
        <motion.div
          initial={false}
          style={{
            paddingTop: headerTopPadding,
            paddingBottom: headerBottomPadding,
            borderBottomLeftRadius: headerRoundness,
            borderBottomRightRadius: headerRoundness,
            opacity: bgOpacity,
            backgroundColor: baseHeaderColor,
          }}
          className="px-4 shadow-[0_4px_20px_rgba(0,0,0,0.15)] overflow-hidden transform-gpu will-change-transform">
          {/* Subtle Glow Overlay */}
          <div className="absolute inset-0 bg-white/8 pointer-events-none" />

          {/* Corner Cart */}
          <motion.button
            initial={{ opacity: 0, scale: 0.9, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
            style={{
              opacity: cartOpacity,
              scale: cartScale,
              display: displayCart,
            }}
            type="button"
            aria-label="Open cart"
            onClick={() => navigate("/checkout")}
            className="absolute top-2 right-3 z-20 w-9 h-9 bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-slate-100 flex items-center justify-center cursor-pointer group hover:shadow-md transition-shadow">
            <ShoppingCartOutlinedIcon sx={{ color: "#1A5C16", fontSize: 20 }} className="group-hover:scale-110 transition-transform" />
            <div className="absolute -top-1.5 -right-1.5 bg-[#0F52BA] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm border border-white">
              2
            </div>
          </motion.button>

          {/* Desktop/Tablet Header Layout (md and above) */}
          <div className="hidden md:flex items-center justify-between relative z-20 px-2 lg:px-6 mb-4 mt-1">
            {/* Left Section: Logo + Location row */}
            <div className="flex items-center gap-4 lg:gap-8">
              <div
                onClick={() => navigate("/")}
                className="flex items-center gap-3 cursor-pointer group shrink-0">
                <div className="group-hover:scale-110 transition-all duration-300 drop-shadow-[0_2px_8px_rgba(255,255,255,0.2)]">
                  <img
                    src={logoUrl}
                    alt={`${appName} Logo`}
                    loading="lazy"
                    className="h-10 w-auto object-contain"
                  />
                </div>
              </div>

              {/* Location Block (Desktop inline row) */}
              <div className="flex items-center pl-4 lg:pl-8 justify-center">
                <button
                  type="button"
                  data-lenis-prevent
                  data-lenis-prevent-touch
                  onClick={() => {
                    setIsLocationOpen(true);
                  }}
                  style={{ backgroundColor: searchBarBg }}
                  className="flex items-center gap-2 rounded-full px-4 h-11 shadow-sm border border-slate-200 hover:border-slate-300 text-slate-800 cursor-pointer group active:scale-95 transition-all w-[240px] lg:w-[280px]">
                  <LocationOnIcon sx={{ fontSize: 18, color: headerIconColor }} />
                  <div 
                    className="text-[13px] font-semibold flex-1 text-left truncate"
                    style={{ color: headerFontColor }}
                  >
                    {isFetchingLocation
                      ? "Detecting location..."
                      : currentLocation.name}
                  </div>
                  <ChevronDownIcon
                    sx={{ fontSize: 16, opacity: 0.6, color: headerFontColor }}
                  />
                </button>
              </div>
            </div>

            {/* Center Section: Search Bar */}
            <div className="flex-1 max-w-[450px] lg:max-w-2xl px-6">
              <motion.div
                onClick={handleSearchClick}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                style={{ backgroundColor: searchBarBg }}
                className="rounded-full px-4 h-11 shadow-sm flex items-center border border-slate-200 transition-all duration-200 focus-within:ring-2 focus-within:ring-brand-400/60 cursor-pointer">
                <SearchIcon sx={{ color: "#000000", fontSize: 20 }} />
                <input
                  type="text"
                  placeholder={searchPlaceholder || "Search Products..."}
                  readOnly
                  className="flex-1 bg-transparent border-none outline-none pl-2 text-slate-800 font-semibold placeholder:text-black text-[15px] cursor-pointer"
                />
                <div className="flex items-center gap-2 border-l border-slate-100 pl-3">
                  <MicIcon sx={{ color: "#000000", fontSize: 20 }} />
                </div>
              </motion.div>
            </div>

            {/* Right Section: Action Icons */}
            <div className="flex items-center gap-5 lg:gap-8 shrink-0">
              <motion.button
                whileHover={{ scale: 1.15, rotate: 5 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => navigate("/wishlist")}
                className="transition-all hover:text-red-500"
                style={{ color: headerFontColor }}
              >
                <FavoriteBorderOutlinedIcon sx={{ fontSize: 24 }} />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.15, rotate: -5 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => navigate("/checkout")}
                className="transition-all hover:text-slate-700 relative group"
                style={{ color: headerFontColor }}
              >
                <ShoppingCartOutlinedIcon sx={{ fontSize: 24 }} />
                <span className="absolute -top-1.5 -right-1.5 bg-yellow-400 text-brand-900 text-[9px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-brand-800 shadow-sm transition-transform group-hover:-translate-y-0.5">
                  0
                </span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => navigate("/profile")}
                className="lg:bg-white/30 p-1.5 lg:rounded-full hover:bg-white transition-all"
                style={{ color: headerFontColor }}
              >
                <AccountCircleOutlinedIcon sx={{ fontSize: 28 }} />
              </motion.button>
            </div>
          </div>

          {/* Collapsible Delivery Info & Location (MOBILE ONLY) */}
          <div className="md:hidden">
            <motion.div
              style={{
                height: contentHeight,
                opacity: contentOpacity,
                marginBottom: navMargin,
                display: displayContent,
                overflow: "hidden",
              }}
              className="relative z-10">
              <div className="flex items-center">
                <img
                  src={logoUrl}
                  alt={`${appName} Logo`}
                  loading="lazy"
                  className="h-7 w-auto object-contain ml-0.5"
                />
              </div>
              <div className="flex justify-between items-start mt-2">
                <div className="flex w-full min-w-0">
                  <button
                    type="button"
                    data-lenis-prevent
                    data-lenis-prevent-touch
                    onClick={() => setIsLocationOpen(true)}
                    className="flex items-center flex-1 rounded-[10px] px-2.5 min-h-[36px] bg-[#F2F8F1] border border-[#DCECD8] text-slate-800 cursor-pointer group active:scale-95 transition-transform min-w-0"
                  >
                    <LocationOnIcon sx={{ fontSize: 16, color: "#1A5C16", mr: 1 }} className="shrink-0" />
                    <div className="text-[11px] font-semibold flex-1 text-left truncate text-slate-700">
                      {isFetchingLocation ? "Detecting location..." : currentLocation.name}
                    </div>
                    <ChevronDownIcon sx={{ fontSize: 16, color: "#1A5C16", ml: 0.5 }} className="shrink-0" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Search Bar (MOBILE ONLY) */}
          <div className="relative z-10 mt-2 mb-1 flex items-center gap-2 md:hidden">
              <motion.div
                onClick={handleSearchClick}
                whileTap={{ scale: 0.98 }}
                className="flex-1 min-w-0 rounded-[12px] px-2.5 h-[38px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex items-center border border-slate-200 bg-white transition-all duration-200 focus-within:ring-2 focus-within:ring-brand-400/60 cursor-pointer">
              <SearchIcon sx={{ color: "#1e293b", fontSize: 18 }} />
              <input
                type="text"
                placeholder="Search for vegetables, fruits, groceries..."
                readOnly
                className="flex-1 bg-transparent border-none outline-none pl-2 text-slate-700 font-medium placeholder:text-slate-500 text-[12px] cursor-pointer"
              />
              <div className="flex items-center justify-center">
                <MicIcon sx={{ color: "#1A5C16", fontSize: 20 }} />
              </div>
            </motion.div>
          </div>

          {/* Categories Navigation - Smooth Collapse */}
          {categories && categories.length > 0 && (
            <motion.div
              layout
              style={{
                height: navHeight,
                opacity: navOpacity,
                display: displayNav,
              }}
              transition={{
                layout: {
                  type: "spring",
                  stiffness: 420,
                  damping: 34,
                  mass: 0.6,
                },
              }}
              className="relative flex items-end md:justify-center gap-1.5 md:gap-4 overflow-x-auto no-scrollbar -mx-2 px-2 md:mx-0 md:px-0 z-10 snap-x pt-0 min-h-[58px] md:min-h-[76px] pb-0 mt-1">
              {categories.map((cat) => {
                const isActive = activeCategory?._id === cat._id || activeCategory?.id === cat.id;
                return (
                  <CategoryNavColumn
                    key={cat._id || cat.id}
                    cat={cat}
                    isActive={isActive}
                    categoryAccent={categoryAccent}
                    onCategorySelect={onCategorySelect}
                    headerFontColor={headerFontColor}
                    headerIconColor={headerIconColor}
                  />
                );
              })}
            </motion.div>
          )}

          {/* Background Decorative patterns */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none" />
        </motion.div>
      </div>

      <LocationDrawer
        isOpen={isLocationOpen}
        onClose={() => setIsLocationOpen(false)}
      />
    </>
  );
};

export default MainLocationHeader;

