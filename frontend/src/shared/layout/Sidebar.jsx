import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";
import { cn } from "@/lib/utils";
import { HiChevronDown } from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";
import { X, LogOut } from "lucide-react";

const colorMap = {
  indigo:
    "text-brand-600 bg-brand-50 border-brand-100 group-hover:bg-brand-100/50",
  rose: "text-rose-600 bg-rose-50 border-rose-100 group-hover:bg-rose-100/50",
  amber:
    "text-amber-600 bg-amber-50 border-amber-100 group-hover:bg-amber-100/50",
  blue: "text-brand-600 bg-brand-50 border-brand-100 group-hover:bg-brand-100/50",
  emerald:
    "text-brand-600 bg-brand-50 border-brand-100 group-hover:bg-brand-100/50",
  violet:
    "text-violet-600 bg-violet-50 border-violet-100 group-hover:bg-violet-100/50",
  cyan: "text-brand-600 bg-brand-50 border-brand-100 group-hover:bg-brand-100/50",
  orange:
    "text-orange-600 bg-orange-50 border-orange-100 group-hover:bg-orange-100/50",
  green:
    "text-brand-600 bg-brand-50 border-brand-100 group-hover:bg-brand-100/50",
  sky: "text-brand-600 bg-brand-50 border-brand-100 group-hover:bg-brand-100/50",
  pink: "text-pink-600 bg-pink-50 border-pink-100 group-hover:bg-pink-100/50",
  fuchsia:
    "text-fuchsia-600 bg-fuchsia-50 border-fuchsia-100 group-hover:bg-fuchsia-100/50",
  red: "text-red-600 bg-red-50 border-red-100 group-hover:bg-red-100/50",
  slate:
    "text-slate-600 bg-slate-50 border-slate-100 group-hover:bg-slate-100/50",
  dark: "text-gray-800 bg-gray-100 border-gray-200 group-hover:bg-gray-200/50",
};

const SidebarItem = ({
  item,
  isOpen,
  onToggle,
  isHovered,
  onMouseEnter,
  onMouseLeave,
}) => {
  const location = useLocation();
  const { role } = useAuth();
  const isSeller = role === "seller";
  const badgeCount = Number(item?.badgeCount || 0);
  const badgeLabel = badgeCount > 99 ? "99+" : String(badgeCount);

  const hasChildren = item.children && item.children.length > 0;
  const isChildActive =
    hasChildren &&
    item.children.some((child) => location.pathname === child.path);

  if (hasChildren) {
    return (
      <div className="space-y-1">
        <button
          onClick={onToggle}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          className={cn(
            "w-full flex items-center justify-between rounded-lg px-3 pr-12 py-2.5 transition-all duration-300 group relative overflow-hidden",
            isChildActive || isOpen
              ? "bg-[#154D1A] text-white font-bold"
              : "text-emerald-100/60 hover:text-white",
          )}>
          <AnimatePresence>
            {isHovered && !(isChildActive || isOpen) && (
              <motion.div
                layoutId="hover-highlight"
                className="absolute inset-0 bg-white/5 rounded-lg -z-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 30,
                }}
              />
            )}
          </AnimatePresence>

          <div className="flex items-center space-x-2.5 z-10">
            <div
              className={cn(
                "p-1.5 rounded-lg transition-all duration-500 shadow-lg",
                isChildActive || isOpen
                  ? "bg-white/20 text-white"
                  : "bg-white/5 text-emerald-400 group-hover:bg-white/10 group-hover:text-emerald-200",
              )}>
              {item.icon && <item.icon className="h-4 w-4" />}
            </div>
            <span
              className={cn(
                "text-[15px] font-medium tracking-wide transition-all duration-300",
                (isChildActive || isOpen) ? "text-white font-semibold" : "text-emerald-100/70 group-hover:text-white",
              )}>
              {item.label}
            </span>
          </div>
          {badgeCount > 0 && !isOpen && (
            <span className="pointer-events-none absolute top-2 right-3 min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow-lg shadow-rose-500/30 ring-2 ring-[#0a0c10]">
              {badgeLabel}
            </span>
          )}
          <div
            className={cn(
              "transition-all duration-300 z-10",
              isOpen
                ? "rotate-180 text-white"
                : "text-emerald-200/50 group-hover:text-white",
            )}>
            <HiChevronDown className="h-4 w-4" />
          </div>
        </button>

        {isOpen && (
          <div className="pl-9 pr-3 py-1 space-y-1 animate-in slide-in-from-top-2 fade-in duration-500">
            {item.children.map((child) => {
              const showChildBadge =
                badgeCount > 0 && String(child?.path || "") === "/admin/support-tickets";

              return (
                <NavLink
                  key={child.path}
                  to={child.path}
                  end={child.end !== undefined ? child.end : false}
                  className={({ isActive }) =>
                    cn(
                      "block text-xs py-1.5 px-2.5 rounded-lg transition-all duration-300 relative",
                      isActive
                        ? "text-white font-bold bg-white/10 shadow-sm ring-1 ring-white/5"
                        : "text-emerald-200/60 hover:text-white hover:bg-white/5",
                      showChildBadge && "pr-9",
                    )
                  }>
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3 rounded-full bg-emerald-400" />
                      )}
                      {child.label}
                      {showChildBadge && (
                        <span className="pointer-events-none absolute top-1 right-2 min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow-lg shadow-rose-500/30 ring-2 ring-[#0a0c10]">
                          {badgeLabel}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.path}
      end={item.end !== undefined ? item.end : false}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={({ isActive }) =>
        cn(
          "flex items-center space-x-2.5 rounded-lg px-3 py-2.5 transition-all duration-300 group relative overflow-hidden",
          isActive
            ? "bg-[#154D1A] text-white font-bold shadow-md"
            : "text-emerald-100/60 hover:text-white",
        )
      }>
      {({ isActive }) => (
        <>
          <AnimatePresence>
            {isHovered && !isActive && (
              <motion.div
                layoutId="hover-highlight"
                className="absolute inset-0 bg-white/5 rounded-lg -z-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 30,
                }}
              />
            )}
          </AnimatePresence>

          <div
            className={cn(
              "p-1.5 rounded-lg transition-all duration-500 shadow-md z-10",
              isActive
                ? "bg-white/20 text-white"
                : "bg-white/5 text-emerald-400 group-hover:bg-white/10 group-hover:text-emerald-200",
            )}>
            {item.icon && <item.icon className="h-4 w-4" />}
          </div>
          <span
            className={cn(
              "text-[15px] font-medium tracking-wide transition-all duration-300 z-10",
              isActive ? "text-white font-semibold" : "text-emerald-100/70 group-hover:text-white",
            )}>
            {item.label}
          </span>
          {badgeCount > 0 && (
            <span className="pointer-events-none absolute top-2 right-3 min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow-lg shadow-rose-500/30 ring-2 ring-[#0a0c10] z-10">
              {badgeLabel}
            </span>
          )}
          {isActive && (
            <div className="absolute right-0 top-0 bottom-0 w-1 rounded-l-full bg-emerald-400 animate-in slide-in-from-right-1" />
          )}
        </>
      )}
    </NavLink>
  );
};

const SidebarContent = ({ items, title, onClose, openMenu, handleToggle, hoveredIdx, setHoveredIdx }) => {
  const { settings } = useSettings();
  const appName = settings?.appName || "App";
  const { logout } = useAuth();

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Redesigned Brand Header Section matching Vitzee Market reference */}
      <div className="flex-shrink-0 flex h-20 items-center justify-between px-5 z-10 border-b border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="flex items-center space-x-3">
          <div className="h-11 w-11 rounded-full shadow-md ring-1 ring-white/10 flex items-center justify-center bg-white p-1 flex-shrink-0">
            <img src="/Vitszeefinallog-removebg-preview.png" alt="Vitzee Market" className="h-full w-full object-contain" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight text-white leading-none uppercase">
              Vitzee Market
            </h1>
            <span className="text-[9px] font-black text-emerald-200/80 uppercase tracking-wider mt-1.5 block">
              → And Vegetables ←
            </span>
          </div>
        </div>

        {/* Mobile Close Button */}
        <button
          onClick={onClose}
          className="p-2 md:hidden text-gray-400 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav
        data-lenis-prevent
        onMouseLeave={() => setHoveredIdx(null)}
        className="mt-4 px-3 space-y-1.5 flex-1 overflow-y-auto overscroll-contain no-scrollbar min-h-0 pb-6 relative z-20"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <p className="px-3 text-[9px] font-black uppercase tracking-[0.3em] mb-3 text-emerald-200/40">
          Core Management
        </p>
        <AnimatePresence>
          {items.map((item, idx) => (
            <SidebarItem
              key={idx}
              item={item}
              isOpen={openMenu === item.label}
              onToggle={() => handleToggle(item.label)}
              isHovered={hoveredIdx === idx}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseEnterWithClose={() => {
                setHoveredIdx(idx);
              }}
              onMouseLeave={() => { }}
            />
          ))}
        </AnimatePresence>
      </nav>

      {/* Redesigned Bottom Logout Button matching reference */}
      <div className="p-4 border-t border-white/5 flex-shrink-0">
        <button
          onClick={logout}
          className="w-full flex items-center space-x-2.5 rounded-lg px-3 py-2.5 transition-all duration-300 text-emerald-100/60 hover:text-white hover:bg-white/5 group"
        >
          <div className="p-1.5 rounded-lg bg-white/5 text-emerald-400 group-hover:bg-white/10 group-hover:text-emerald-200">
            <LogOut size={16} />
          </div>
          <span className="text-[15px] font-medium tracking-wide">
            Logout
          </span>
        </button>
      </div>
    </div>
  );
};

const Sidebar = ({ items, title, isOpen, onClose }) => {
  const { role } = useAuth();
  const [openMenu, setOpenMenu] = useState(null);
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const handleToggle = (label) => {
    setOpenMenu((prev) => (prev === label ? null : label));
  };

  const commonProps = {
    items,
    title,
    onClose,
    openMenu,
    handleToggle,
    hoveredIdx,
    setHoveredIdx
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className={cn(
        "fixed left-0 inset-y-0 w-72 text-emerald-100/70 border-r border-emerald-950/20 shadow-[20px_0_60px_rgba(0,0,0,0.4)] md:flex flex-col z-50 transition-all duration-300 bg-[#052516]",
        (role === "admin" || role === "seller") ? "hidden md:flex" : "flex",
      )}>
        <SidebarContent {...commonProps} />
      </aside>

      {/* Mobile Sidebar (Drawer) */}
      <AnimatePresence mode="wait">
        {isOpen && (
          <div className="fixed inset-0 z-[100] md:hidden">
            {/* Backdrop Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
            />

            {/* Outer Container */}
            <div className="absolute left-0 inset-y-0 w-72 flex flex-col pointer-events-none">
              {/* Inner Animation Wrapper */}
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
                className="flex-1 shadow-2xl flex flex-col pointer-events-auto min-h-0 bg-[#052516]"
              >
                <SidebarContent {...commonProps} />
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;
