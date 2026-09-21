import React from "react";
import { Plus, Minus, Trash2, Heart, ShoppingBag } from "lucide-react";
import { Link } from "react-router-dom";
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";

/**
 * CheckoutCartSummary
 *
 * Props:
 *   cart              – array of cart items
 *   onUpdateQuantity  – (id, delta, variantSku) => void
 *   onRemoveFromCart  – (id, variantSku) => void
 *   onMoveToWishlist  – (item) => void
 *   showAll           – boolean (currently unused — all items shown)
 *   onToggleShowAll   – () => void
 */
const CheckoutCartSummary = React.memo(function CheckoutCartSummary({
  cart,
  onUpdateQuantity,
  onRemoveFromCart,
  onMoveToWishlist,
}) {
  if (!cart || cart.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200/80">
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#1A4516] flex items-center justify-center font-bold">
            <ShoppingBag size={17} />
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-sm sm:text-base tracking-tight">
              Review Cart Items
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              {cart.length} {cart.length === 1 ? "item" : "items"} in your basket
            </p>
          </div>
        </div>
        <Link
          to="/"
          className="text-xs font-bold text-[#1A4516] hover:text-emerald-700 hover:underline flex items-center gap-1 transition-colors">
          + Add More Items
        </Link>
      </div>

      {/* Items list */}
      <div className="space-y-4 divide-y divide-slate-100">
        {cart.map((item, index) => {
          const mrp = Number(item.price || 0);
          const sale = Number(item.salePrice || 0);
          const qty = Math.max(0, Number(item.quantity || 0));
          const hasDiscount =
            Number.isFinite(mrp) &&
            Number.isFinite(sale) &&
            sale > 0 &&
            sale < mrp;
          const unit = hasDiscount ? sale : mrp;
          const total = Math.round(unit * qty);
          const totalMrp = Math.round(mrp * qty);
          const productId = item.id || item._id;

          return (
            <div
              key={`${productId}::${String(item.variantSku || "").trim()}::${index}`}
              className={`flex gap-3 sm:gap-4 items-start ${index > 0 ? "pt-4" : ""}`}>
              {/* Product Thumbnail */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex-shrink-0 relative group p-1 flex items-center justify-center">
                <img
                  src={applyCloudinaryTransform(item.image)}
                  alt={item.name}
                  loading="lazy"
                  className="h-full w-full object-contain"
                />
              </div>

              {/* Details & Controls */}
              <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
                <div>
                  <h4
                    className="font-bold text-slate-800 text-xs sm:text-sm leading-snug line-clamp-2"
                    title={item.name}>
                    {item.name}
                  </h4>

                  {(item.variantName || item.variantSku) && (
                    <div className="mt-1">
                      <span className="inline-block text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                        {item.variantName || item.variantSku}
                      </span>
                    </div>
                  )}
                </div>

                {/* Bottom row: Price & Quantity Controls */}
                <div className="flex items-center justify-between gap-2 mt-2 pt-1">
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm sm:text-base font-black text-slate-900">
                        ₹{total}
                      </span>
                      {hasDiscount && (
                        <span className="text-[11px] font-semibold text-slate-400 line-through">
                          ₹{totalMrp}
                        </span>
                      )}
                    </div>
                    {qty > 1 && (
                      <span className="text-[10px] text-slate-400 font-medium">
                        ₹{unit} each
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => onMoveToWishlist(item)}
                      className="hidden xs:flex sm:flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-[#1A4516] transition-colors py-1 px-1.5 rounded-lg hover:bg-slate-50">
                      <Heart size={13} className="text-slate-400 hover:text-[#1A4516]" />
                      <span>Wishlist</span>
                    </button>

                    {/* Quantity Stepper */}
                    <div className="flex items-center bg-[#1A4516] text-white rounded-lg shadow-sm overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          qty > 1
                            ? onUpdateQuantity(productId, -1, item.variantSku)
                            : onRemoveFromCart(productId, item.variantSku)
                        }
                        aria-label={qty === 1 ? "Remove item" : "Decrease quantity"}
                        className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center hover:bg-white/20 active:scale-90 transition-all">
                        {qty === 1 ? (
                          <Trash2 size={13} strokeWidth={2.5} className="text-white" />
                        ) : (
                          <Minus size={13} strokeWidth={3} className="text-white" />
                        )}
                      </button>
                      <span className="text-xs sm:text-sm font-bold min-w-[22px] text-center select-none px-1">
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(productId, 1, item.variantSku)}
                        aria-label="Increase quantity"
                        className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center hover:bg-white/20 active:scale-90 transition-all">
                        <Plus size={13} strokeWidth={3} className="text-white" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Mobile-only Wishlist link */}
                <div className="xs:hidden sm:hidden mt-1.5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onMoveToWishlist(item)}
                    className="text-[11px] font-medium text-slate-500 hover:text-[#1A4516] underline">
                    Move to wishlist
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default CheckoutCartSummary;
