import React from "react";
import { applyCloudinaryTransform, handleImageError, DEFAULT_CATEGORY_IMAGE } from "@/core/utils/imageUtils";

const QuickCategorySlider = ({ categories, onCategoryClick }) => {
  if (!categories || categories.length === 0) return null;

  // Show up to 12 categories in the grid (e.g. 4x3 on mobile, 2x6 on desktop)
  const displayCategories = categories.length > 12 ? categories.slice(0, 12) : categories;

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 mt-6 mb-10 z-20 relative">
      <div className="flex justify-between items-end mb-4 px-1 md:px-0">
        <h2 className="text-[18px] sm:text-[20px] md:text-[22px] font-bold tracking-tight text-[#1A4516] leading-none">
          Shop by Category
        </h2>
        <span 
          onClick={() => onCategoryClick("all")} 
          className="text-[#1A4516] font-bold text-[13px] md:text-[14px] cursor-pointer hover:underline active:scale-95 transition-transform pb-[2px]"
        >
          View All
        </span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-x-3 gap-y-7 sm:gap-4 md:gap-6 pb-4">
        {displayCategories.map((cat) => (
          <div
            key={cat.id}
            onClick={() => onCategoryClick(cat.id)}
            className="flex flex-col items-center cursor-pointer group transition-transform active:scale-95"
          >
            <div className="w-full aspect-square bg-[#FDFBF7] rounded-[12px] md:rounded-[16px] shadow-sm shadow-black/5 border border-black/5 overflow-hidden mb-2 transition-all group-hover:shadow-md group-hover:scale-105">
              <img
                src={applyCloudinaryTransform(cat.image, "f_auto,q_auto,w_250")}
                alt={cat.name}
                loading="lazy"
                onError={(e) => handleImageError(e, DEFAULT_CATEGORY_IMAGE)}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
              />
            </div>
            <span className="text-[12px] sm:text-[13px] md:text-[14px] font-bold text-[#1f2b20] text-center w-full truncate px-1">
              {cat.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(QuickCategorySlider);
