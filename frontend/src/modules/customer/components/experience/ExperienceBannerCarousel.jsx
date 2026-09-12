import React from "react";
import { cn } from "@/lib/utils";
import { motion, useMotionValue } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  applyCloudinaryTransform,
  buildCloudinarySrcSet,
  isCloudinaryUrl,
  handleImageError,
  DEFAULT_BANNER_IMAGE,
} from "@/core/utils/imageUtils";

import { isMobileOrWebView } from "@/core/utils/deviceUtils";

const BANNER_CHUNK_SIZE = 20;

const ExperienceBannerCarousel = ({ section, items, fullWidth = false, slideGap = 0, edgeToEdge = false }) => {
  if (!items.length) return null;

  const [activeIndex, setActiveIndex] = React.useState(0);
  const [visibleCount, setVisibleCount] = React.useState(() =>
    Math.min(items.length, BANNER_CHUNK_SIZE)
  );
  const visibleItems = items.slice(0, visibleCount);
  const totalItems = visibleItems.length;
  const x = useMotionValue(0);
  const containerRef = React.useRef(null);
  const hasMore = visibleCount < items.length;

  const loadMore = React.useCallback(() => {
    setVisibleCount((prev) => Math.min(items.length, prev + BANNER_CHUNK_SIZE));
  }, [items.length]);

  React.useEffect(() => {
    setVisibleCount(Math.min(items.length, BANNER_CHUNK_SIZE));
    setActiveIndex(0);
  }, [items.length]);

  // Auto-play logic
  React.useEffect(() => {
    if (totalItems <= 1) return;

    const intervalId = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % totalItems);
    }, 4500);

    return () => clearInterval(intervalId);
  }, [totalItems]);

  React.useEffect(() => {
    if (!hasMore) return;
    if (activeIndex >= totalItems - 2) {
      loadMore();
    }
  }, [activeIndex, totalItems, hasMore, loadMore]);

  const handleDragEnd = (_, info) => {
    const threshold = 50;
    if (info.offset.x < -threshold) {
      // Swipe left -> Next
      setActiveIndex((prev) => Math.min(prev + 1, totalItems - 1));
    } else if (info.offset.x > threshold) {
      // Swipe right -> Prev
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    }
  };

  const getBannerOptimizedSrc = React.useCallback((url) => {
    if (!url) return url;
    if (!isCloudinaryUrl(url)) return url;
    return applyCloudinaryTransform(url, "f_auto,q_auto,c_scale,w_1200");
  }, []);

  return (
    <div className={cn("relative group overflow-hidden touch-pan-y", fullWidth && "w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw]")}>
      <motion.div
        ref={containerRef}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        animate={{ x: `-${(activeIndex / totalItems) * 100}%` }}
        transition={isMobileOrWebView() ? { type: "tween", ease: "easeInOut", duration: 0.3 } : { type: "spring", stiffness: 300, damping: 30 }}
        className="flex"
        style={{ width: `${totalItems * 100}%` }}
      >
        {visibleItems.map((banner, idx) => (
          <div
            key={idx}
            className={cn(
              "relative shrink-0 overflow-hidden flex items-center justify-center box-border",
              fullWidth
                ? "aspect-[2/1] sm:aspect-[21/9] md:aspect-[3/1] rounded-none px-0"
                : "aspect-[2/1] sm:aspect-[21/9] md:aspect-[24/9] lg:aspect-[28/9] px-4 md:px-8 py-1 md:py-1.5"
            )}
            style={{ width: `${100 / totalItems}%` }}
          >
            {fullWidth ? (
              <img
                src={getBannerOptimizedSrc(banner.imageUrl)}
                srcSet={
                  isCloudinaryUrl(banner.imageUrl)
                    ? buildCloudinarySrcSet(
                        banner.imageUrl,
                        [{ w: 412 }, { w: 824 }, { w: 1248 }, { w: 1600 }],
                        "f_auto,q_auto,c_scale"
                      )
                    : undefined
                }
                sizes="100vw"
                alt={banner.title || section?.title || "Banner"}
                onError={(e) => handleImageError(e, DEFAULT_BANNER_IMAGE)}
                className="w-full h-full object-contain md:object-cover object-center pointer-events-none"
                loading={idx === 0 ? "eager" : "lazy"}
                fetchPriority={idx === 0 ? "high" : "low"}
                decoding="async"
              />
            ) : (
              <div className="h-full w-full max-w-[560px] md:max-w-none overflow-hidden rounded-2xl md:rounded-3xl bg-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.06)] md:shadow-[0_10px_25px_rgba(15,23,42,0.08)] border border-black/5">
                <img
                  src={getBannerOptimizedSrc(banner.imageUrl)}
                  srcSet={
                    isCloudinaryUrl(banner.imageUrl)
                      ? buildCloudinarySrcSet(
                          banner.imageUrl,
                          [{ w: 560 }, { w: 1120 }, { w: 1600 }],
                          "f_auto,q_auto,c_scale"
                        )
                      : undefined
                  }
                  sizes="(max-width: 768px) 100vw, 1280px"
                  alt={banner.title || section?.title || "Banner"}
                  onError={(e) => handleImageError(e, DEFAULT_BANNER_IMAGE)}
                  className="w-full h-full object-cover object-center pointer-events-none"
                  loading={idx === 0 ? "eager" : "lazy"}
                  fetchPriority={idx === 0 ? "high" : "low"}
                  decoding="async"
                />
              </div>
            )}
          </div>
        ))}
      </motion.div>

      {/* Desktop Navigation Arrows */}
      {totalItems > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
            }}
            className="hidden md:flex absolute left-10 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-white/80 hover:bg-white text-slate-700 shadow-md backdrop-blur-sm items-center justify-center transition-all opacity-0 group-hover:opacity-100 active:scale-95"
            aria-label="Previous banner"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveIndex((prev) => (prev + 1) % totalItems);
            }}
            className="hidden md:flex absolute right-10 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-white/80 hover:bg-white text-slate-700 shadow-md backdrop-blur-sm items-center justify-center transition-all opacity-0 group-hover:opacity-100 active:scale-95"
            aria-label="Next banner"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      {/* Indicator dots */}
      {totalItems > 1 && (
        <div className="flex justify-center items-center gap-1.5 mt-2 pb-1">
          {visibleItems.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                activeIndex === i ? "w-6 bg-[#1A4516]" : "w-1.5 bg-slate-300 hover:bg-slate-400"
              )}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ExperienceBannerCarousel;
