import React from "react";
import ProductCard from "../../../components/shared/ProductCard";

/**
 * CheckoutRecommendedProducts
 *
 * Props:
 *   products      – array of recommended product objects
 *   cart          – current cart (passed through to ProductCard if needed)
 *   onAddToCart   – (product) => void
 *   onGetCartItem – (productId) => cartItem | undefined
 */
const CheckoutRecommendedProducts = React.memo(function CheckoutRecommendedProducts({
  products,
}) {
  if (!products || products.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200/80">
      <h3 className="font-black text-slate-800 text-sm sm:text-base mb-3">
        You might also like
      </h3>
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4 snap-x">
        {products.map((product) => (
          <div key={product.id} className="flex-shrink-0 w-[126px] sm:w-[136px] md:w-[160px] snap-start">
            <ProductCard product={product} compact={true} />
          </div>
        ))}
      </div>
    </div>
  );
});

export default CheckoutRecommendedProducts;
