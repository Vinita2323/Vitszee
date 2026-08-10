import React from "react";
import { applyCloudinaryTransform, handleImageError, DEFAULT_CATEGORY_IMAGE } from "@/core/utils/imageUtils";

const QuickCategorySlider = ({ categories, onCategoryClick }) => {
  if (!categories || categories.length === 0) return null;

  // Show up to 6 categories in the grid for a clean 3x2 layout
  const displayCategories = categories.slice(0, 6);

  return (
    <div className="w-full px-4 mt-6 mb-10 z-20 relative">
      <div className="flex justify-between items-end mb-4 px-1">
        <h2 className="text-[18px] sm:text-[20px] font-bold tracking-tight text-[#1A4516] leading-none">
          Shop by Category
        </h2>
        <span 
          onClick={() => onCategoryClick("all")} 
          className="text-[#1A4516] font-bold text-[13px] cursor-pointer active:scale-95 transition-transform pb-[2px]"
        >
          View All
        </span>
      </div>

      <div className="grid grid-cols-3 gap-x-3 gap-y-7 sm:gap-4 pb-4">
        {displayCategories.map((cat) => (
          <div
            key={cat.id}
            onClick={() => onCategoryClick(cat.id)}
            className="flex flex-col items-center cursor-pointer group transition-transform active:scale-95"
          >
            <div className="w-full aspect-square bg-[#FDFBF7] rounded-[12px] shadow-sm shadow-black/5 border border-black/5 overflow-hidden mb-2 transition-all group-hover:shadow-md">
              <img
                src={applyCloudinaryTransform(cat.image, "f_auto,q_auto,w_150")}
                alt={cat.name}
                loading="lazy"
                onError={(e) => handleImageError(e, DEFAULT_CATEGORY_IMAGE)}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
              />
            </div>
            <span className="text-[12px] sm:text-[13px] font-bold text-[#1f2b20] text-center w-full truncate px-1">
              {cat.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(QuickCategorySlider);
