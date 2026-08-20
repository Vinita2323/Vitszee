import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";
import { cn } from "@/lib/utils";
import { HiChevronDown } from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";
import { X, LogOut } from "lucide-react";

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
            "w-full flex items-center justify-between rounded-md px-3 pr-12 py-2.5 transition-all duration-200 group relative overflow-hidden",
            isChildActive || isOpen
              ? "bg-white text-[#1A8CFF] font-black shadow-sm"
              : "text-white hover:text-white hover:bg-white/15",
          )}>
          <AnimatePresence>
            {isHovered && !(isChildActive || isOpen) && (
              <motion.div
                layoutId="hover-highlight"
                className="absolute inset-0 bg-white/15 rounded-md -z-10"
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

          <div className="flex items-center space-x-3 z-10">
            <div
              className={cn(
                "p-1.5 rounded-md transition-all duration-300 shadow-sm",
                isChildActive || isOpen
                  ? "bg-blue-50 text-[#1A8CFF]"
                  : "bg-white/15 text-white group-hover:bg-white/25",
              )}>
              {item.icon && <item.icon className="h-4.5 w-4.5" />}
            </div>
            <span
              className={cn(
                "text-[16px] font-bold tracking-wide transition-all duration-200",
                (isChildActive || isOpen) ? "text-[#1A8CFF] font-black" : "text-white group-hover:text-white",
              )}>
              {item.label}
            </span>
          </div>
          {badgeCount > 0 && !isOpen && (
            <span className="pointer-events-none absolute top-2 right-3 min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow-md">
              {badgeLabel}
            </span>
          )}
          <div
            className={cn(
              "transition-all duration-200 z-10",
              isOpen ? "rotate-180" : "",
              isChildActive || isOpen ? "text-[#1A8CFF]" : "text-white/80 group-hover:text-white",
            )}>
            <HiChevronDown className="h-4 w-4" />
          </div>
        </button>

        {isOpen && (
          <div className="pl-9 pr-3 py-1 space-y-1 animate-in slide-in-from-top-2 fade-in duration-300">
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
                      "block text-[14px] py-2 px-3 rounded-md transition-all duration-200 relative",
                      isActive
                        ? "text-[#1A8CFF] font-black bg-white shadow-sm"
                        : "text-white hover:text-white hover:bg-white/15 font-semibold",
                      showChildBadge && "pr-9",
                    )
                  }>
                  {({ isActive }) => (
                    <>
                      {child.label}
                      {showChildBadge && (
                        <span className="pointer-events-none absolute top-1 right-2 min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow-md">
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
          "flex items-center space-x-3 rounded-md px-3 py-2.5 transition-all duration-200 group relative overflow-hidden",
          isActive
            ? "bg-white text-[#1A8CFF] font-black shadow-sm"
            : "text-white hover:text-white hover:bg-white/15",
        )
      }>
      {({ isActive }) => (
        <>
          <AnimatePresence>
            {isHovered && !isActive && (
              <motion.div
                layoutId="hover-highlight"
                className="absolute inset-0 bg-white/15 rounded-md -z-10"
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
              "p-1.5 rounded-md transition-all duration-300 shadow-sm z-10",
              isActive
                ? "bg-blue-50 text-[#1A8CFF]"
                : "bg-white/15 text-white group-hover:bg-white/25",
            )}>
            {item.icon && <item.icon className="h-4.5 w-4.5" />}
          </div>
          <span
            className={cn(
              "text-[16px] font-bold tracking-wide transition-all duration-200 z-10",
              isActive ? "text-[#1A8CFF] font-black" : "text-white group-hover:text-white",
            )}>
            {item.label}
          </span>
          {badgeCount > 0 && (
            <span className="pointer-events-none absolute top-2 right-3 min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow-md z-10">
              {badgeLabel}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
};

const SidebarContent = ({ items, title, onClose, openMenu, handleToggle, hoveredIdx, setHoveredIdx }) => {
  const { settings } = useSettings();
  const appName = settings?.appName || "VITSZEE";
  const { logout } = useAuth();

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#1A8CFF] text-white">
      {/* Brand Header Section */}
      <div className="flex-shrink-0 flex h-20 items-center justify-between px-4 z-10 border-b border-white/20">
        <div className="flex items-center justify-center bg-white rounded-lg px-4 py-2 shadow-sm w-full max-w-[210px] h-12">
          <img
            src="/LogoVitszee.png"
            alt={appName}
            className="h-full w-full object-contain"
          />
        </div>

        {/* Mobile Close Button */}
        <button
          onClick={onClose}
          className="p-2 md:hidden text-white/80 hover:text-white transition-colors ml-2"
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
        <p className="px-3 text-[11px] font-black uppercase tracking-[0.25em] mb-3 text-white/80">
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

      {/* Bottom Logout Button */}
      <div className="p-4 border-t border-white/20 flex-shrink-0">
        <button
          onClick={logout}
          className="w-full flex items-center space-x-3 rounded-md px-3 py-2.5 transition-all duration-200 text-white font-bold hover:bg-white/15 group cursor-pointer"
        >
          <div className="p-1.5 rounded-md bg-white/15 text-white group-hover:bg-white/25 transition-colors shadow-sm">
            <LogOut size={18} />
          </div>
          <span className="text-[16px] font-bold tracking-wide">
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
      {/* Desktop Sidebar with Lighter Plain Blue */}
      <aside className={cn(
        "fixed left-0 inset-y-0 w-72 text-white border-r border-blue-400/40 shadow-xl md:flex flex-col z-50 transition-all duration-300 bg-[#1A8CFF]",
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
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm pointer-events-auto"
            />

            {/* Outer Container */}
            <div className="absolute left-0 inset-y-0 w-72 flex flex-col pointer-events-none">
              {/* Inner Animation Wrapper */}
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
                className="flex-1 shadow-2xl flex flex-col pointer-events-auto min-h-0 bg-[#1A8CFF]"
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
