import React from "react";
import { useNavigate } from "react-router-dom";
import ProductCard from "../shared/ProductCard";
import { cn } from "@/lib/utils";
import ExperienceBannerCarousel from "./ExperienceBannerCarousel";
import { setJSON, STORAGE_KEYS } from "@core/utils/storage";
import { handleImageError, DEFAULT_CATEGORY_IMAGE, applyCloudinaryTransform } from "@/core/utils/imageUtils";

const rememberExperienceReturn = (headerId, sectionId) =>
  setJSON(
    STORAGE_KEYS.EXPERIENCE_RETURN,
    { headerId: headerId || null, sectionId: sectionId || null },
    { storage: "session" },
  );

const LAZY_CHUNK_SIZE = 20;
const LAZY_ROOT_MARGIN = "260px 0px";

const LazyLoadTrigger = ({ enabled, onVisible }) => {
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!enabled) return undefined;
    const node = ref.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onVisible();
      },
      { rootMargin: LAZY_ROOT_MARGIN },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, onVisible]);

  return <div ref={ref} className="h-4 w-full" aria-hidden="true" />;
};

const SectionRenderer = ({ sections = [], productsById = {}, categoriesById = {} }) => {
  const navigate = useNavigate();
  const [visibleCounts, setVisibleCounts] = React.useState({});

  const resolveVisibleCount = React.useCallback(
    (key, total) => visibleCounts[key] || Math.min(total, LAZY_CHUNK_SIZE),
    [visibleCounts],
  );

  const loadMoreForSection = React.useCallback(
    (key, total) => {
      setVisibleCounts((prev) => {
        const current = prev[key] || Math.min(total, LAZY_CHUNK_SIZE);
        return {
          ...prev,
          [key]: Math.min(total, current + LAZY_CHUNK_SIZE),
        };
      });
    },
    [],
  );

  if (!sections.length) return null;

  return (
    <div className="space-y-8">
      {sections.map((section, sectionIndex) => {
        const sectionKey = String(
          section?._id || section?.id || `${section?.displayType || "section"}-${sectionIndex}`
        );
        const heading = section.title;

        if (section.displayType === "banners") {
          const items = section.config?.banners?.items || [];
          if (!items.length) return null;
          return (
            <div key={section._id || sectionKey} className="-mt-8 md:-mt-8">
              <ExperienceBannerCarousel section={section} items={items} slideGap={12} />
            </div>
          );
        }

        if (section.displayType === "categories") {
          const ids = section.config?.categories?.categoryIds || [];
          const allItems = ids
            .map((id) => categoriesById[id])
            .filter(Boolean);
          const visibleItems = allItems.slice(
            0,
            resolveVisibleCount(sectionKey, allItems.length)
          );
          const hasMore = visibleItems.length < allItems.length;

          if (!visibleItems.length) return null;

          return (
            <div
              key={section._id || sectionKey}
              id={`section-${section._id}`}
              className="w-full"
            >
              {heading && (
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="text-base md:text-lg font-bold text-[#1A1A1A]">
                    {heading}
                  </h3>
                  <span className="text-[11px] md:text-[12px] font-semibold text-slate-400">
                    {allItems.length} categories
                  </span>
                </div>
              )}
              <div className="rounded-2xl md:rounded-3xl bg-white shadow-sm border border-slate-100 p-3 md:p-5">
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-8 gap-2.5 sm:gap-3.5 md:gap-5">
                  {visibleItems.map((cat) => (
                    <button
                      key={cat._id}
                      className="group flex flex-col items-center gap-1.5 focus:outline-none cursor-pointer"
                      onClick={() => {
                        // Remember the header & section so back navigation can restore context
                        rememberExperienceReturn(section.headerId, section._id);
                        navigate(`/category/${cat._id}`);
                      }}
                    >
                      <div className="relative aspect-square w-full rounded-xl md:rounded-2xl bg-[#F8F9FA] border border-slate-100 flex items-center justify-center overflow-hidden p-1.5 md:p-2 transition-all duration-200 group-hover:border-primary/40 group-hover:bg-white group-hover:shadow-md group-hover:scale-105">
                        {cat.image && typeof cat.image === 'string' && cat.image.trim() ? (
                          <img
                            src={applyCloudinaryTransform(cat.image.trim(), "f_auto,q_auto,w_200") || DEFAULT_CATEGORY_IMAGE}
                            alt={cat.name || "Category"}
                            onError={(e) => handleImageError(e, DEFAULT_CATEGORY_IMAGE)}
                            className="w-full h-full object-cover object-center transition-transform duration-200"
                          />
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-slate-100" />
                        )}
                      </div>
                      <div className="text-[11px] md:text-[12px] font-semibold text-slate-700 text-center leading-snug line-clamp-2 group-hover:text-primary">
                        {cat.name}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <LazyLoadTrigger
                enabled={hasMore}
                onVisible={() => loadMoreForSection(sectionKey, allItems.length)}
              />
            </div>
          );
        }

        if (section.displayType === "products") {
          const productConfig = section.config?.products || {};
          const ids = productConfig.productIds || [];
          const rows = productConfig.rows || 1;
          const columns = productConfig.columns || 2;
          const singleRowScrollable = !!productConfig.singleRowScrollable;
          const hasManualProductSelection = ids.length > 0;

          let allProducts;

          if (ids.length) {
            allProducts = ids.map((id) => productsById[id]).filter(Boolean);
          } else {
            const categoryFilter = productConfig.categoryIds || [];
            const hasCategoryFilter = categoryFilter.length > 0;

            const all = Object.values(productsById);
            allProducts = all.filter((p) => {
              const catId = p.categoryId?._id || p.categoryId;
              const matchesCategory = hasCategoryFilter
                ? categoryFilter.includes(catId)
                : true;
              return matchesCategory;
            });
          }

          if (!allProducts.length) return null;

          if (singleRowScrollable) {
            const visibleCount = resolveVisibleCount(sectionKey, allProducts.length);
            const items = allProducts.slice(0, visibleCount);
            const hasMore = items.length < allProducts.length;

            return (
            <div
              key={section._id || sectionKey}
              id={`section-${section._id}`}
              className="-mx-4 md:-mx-8 lg:-mx-[50px] px-1 sm:px-2 md:px-3 mt-6 mb-2"
            >
                <div className="flex items-center justify-between mb-3 px-3 md:px-5">
                  {heading && (
                    <h3 className="text-base font-black text-[#1A1A1A]">
                      {heading}
                    </h3>
                  )}
                  <span className="text-[11px] font-semibold text-slate-400">
                    {allProducts.length} items
                  </span>
                </div>
                <div
                  className="relative z-10 flex overflow-x-auto gap-1.5 pb-1.5 no-scrollbar"
                  onScroll={(e) => {
                    if (!hasMore) return;
                    const node = e.currentTarget;
                    const distanceToEnd =
                      node.scrollWidth - node.scrollLeft - node.clientWidth;
                    if (distanceToEnd < 220) {
                      loadMoreForSection(sectionKey, allProducts.length);
                    }
                  }}
                >
                  {items.map((product) => (
                    <div
                      key={product._id || product.id}
                      className="w-[138px] sm:w-[150px] md:w-[168px] shrink-0"
                    >
                      <ProductCard product={product} compact={true} neutralBg={true} />
                    </div>
                  ))}
                </div>
                <LazyLoadTrigger
                  enabled={hasMore}
                  onVisible={() => loadMoreForSection(sectionKey, allProducts.length)}
                />
              </div>
            );
          }

          // If admin explicitly selected product IDs, render the full curated list.
          // Keep rows*columns cap only for dynamic filter-driven sections.
          const layoutCount = hasManualProductSelection
            ? allProducts.length
            : rows * columns;
          const cappedItems = allProducts.slice(0, layoutCount);
          const visibleCount = resolveVisibleCount(sectionKey, cappedItems.length);
          const items = cappedItems.slice(0, visibleCount);
          const hasMore = items.length < cappedItems.length;

          return (
            <div
              key={section._id || sectionKey}
              id={`section-${section._id}`}
              className="-mx-4 md:-mx-8 lg:-mx-[50px] px-1 sm:px-2 md:px-3 mt-6"
            >
              <div className="flex items-center justify-between mb-3 px-3 md:px-5">
                {heading && (
                  <h3 className="text-base font-black text-[#1A1A1A]">
                    {heading}
                  </h3>
                )}
                <span className="text-[11px] font-semibold text-slate-400">
                  {cappedItems.length} items
                </span>
              </div>
              <div
                className={cn(
                  "grid gap-1.5 sm:gap-2.5",
                  columns === 1
                    ? "grid-cols-1"
                    : columns === 2
                    ? "grid-cols-2"
                    : columns === 3
                    ? "grid-cols-3"
                    : "grid-cols-2"
                )}
              >
                {items.map((product) => (
                  <div key={product._id || product.id}>
                    <ProductCard product={product} compact={columns >= 2} neutralBg={true} />
                  </div>
                ))}
              </div>
              <LazyLoadTrigger
                enabled={hasMore}
                onVisible={() => loadMoreForSection(sectionKey, cappedItems.length)}
              />
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};

export default SectionRenderer;

