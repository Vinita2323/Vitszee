import React from "react";
import { ChevronRight } from "lucide-react";
import ProductCard from "../shared/ProductCard";

const LowestPriceSection = ({
  products = [],
  title = "Lowest Price ever",
  subtitle = "Unbeatable Savings • Updated hourly",
  onSeeAll,
}) => {
  if (!products || products.length === 0) return null;

  return (
    <div className="w-full mt-2 mb-6">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#E6F3E6] to-[#F5FBF5] pt-4 pb-2 border-y border-[#1A4516]/10 shadow-sm">
        {/* Background Decoration */}
        <div className="absolute -top-10 -right-10 h-40 w-40 bg-[#1A4516]/5 rounded-full blur-2xl opacity-60 pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 h-40 w-40 bg-[#1A4516]/10 rounded-full blur-2xl opacity-60 pointer-events-none" />

        <div className="w-full px-4 relative z-10">
          <div className="flex justify-between items-end mb-4 px-1">
            <div className="flex flex-col">
              <h3 className="text-[18px] sm:text-[20px] font-bold text-[#132018] tracking-tight uppercase leading-none pt-2">
                {title}
              </h3>
              <div className="flex items-center gap-1.5 mt-1.5">
                <div className="h-1.5 w-1.5 bg-[#1A4516] rounded-full animate-pulse shadow-[0_0_8px_rgba(26,69,22,0.5)]" />
                <span className="text-[10px] font-medium text-[#1A4516] uppercase tracking-wide opacity-90">
                  {subtitle}
                </span>
              </div>
            </div>
            {onSeeAll && (
              <button
                onClick={onSeeAll}
                className="flex items-center gap-1 bg-white px-3 py-1.5 rounded-full text-[#1A4516] font-bold text-[11px] cursor-pointer shadow-sm border border-[#1A4516]/10 transition-all whitespace-nowrap active:scale-95 mb-1"
              >
                See all
                <ChevronRight size={14} className="ml-0.5" strokeWidth={3} />
              </button>
            )}
          </div>

          <div className="relative z-10 flex overflow-x-auto gap-3 md:gap-6 pb-2 md:pb-3 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scroll-smooth">
            {products.slice(0, 12).map((product) => (
              <div
                key={product.id || product._id}
                className="w-[126px] sm:w-[136px] md:w-[148px] shrink-0 snap-start smooth-transform"
              >
                <ProductCard
                  product={product}
                  className="bg-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.1)] md:shadow-[0_15px_30px_rgba(0,0,0,0.05)] border-brand-50/50 md:border-slate-100 transition-all"
                  compact={true}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(LowestPriceSection);
