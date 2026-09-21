import React from "react";
import { Clipboard, Tag, Heart, Wallet } from "lucide-react";
import { motion } from "framer-motion";

/**
 * CheckoutPricingBreakdown
 *
 * Props:
 *   pricingPreview    – breakdown object from the preview API (or null)
 *   isPreviewLoading  – boolean
 *   selectedTip       – number
 *   onSelectTip       – (value) => void
 *   tipAmounts        – array of { value, label }
 *   walletAmountToUse – number
 *   finalAmountToPay  – number
 *   cartTotal         – number (fallback when preview is loading)
 *   selectedCoupon    – coupon object or null
 *   discountAmount    – number
 */
const CheckoutPricingBreakdown = React.memo(function CheckoutPricingBreakdown({
  pricingPreview,
  isPreviewLoading,
  previewError,
  selectedTip,
  onSelectTip,
  tipAmounts,
  walletAmountToUse,
  finalAmountToPay,
  cartTotal,
  selectedCoupon,
  discountAmount,
}) {
  const handlingFee = pricingPreview?.handlingFeeCharged || 0;
  const deliveryFee = pricingPreview?.deliveryFeeCharged || 0;
  const tipAmount = pricingPreview?.tipTotal || selectedTip || 0;

  return (
    <>
      {/* Tip for Partner */}
      <motion.div className="bg-gradient-to-r from-emerald-50/70 via-teal-50/40 to-emerald-50/70 rounded-2xl p-4 border border-emerald-100/80 shadow-sm">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-100/80 text-[#1A4516] flex items-center justify-center">
              <Heart size={15} className="fill-[#1A4516] text-[#1A4516]" />
            </div>
            <h3 className="font-black text-slate-800 text-sm tracking-tight">Tip your delivery partner</h3>
          </div>
          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-full">
            100% to partner
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-3">Thank your delivery partner for their fast service</p>
        <div className="grid grid-cols-4 gap-2">
          {tipAmounts.map((tip) => {
            const isSelected = selectedTip === tip.value;
            return (
              <button
                key={tip.value}
                onClick={() => onSelectTip(tip.value)}
                className={`py-2 px-1 rounded-xl border font-bold text-xs sm:text-sm transition-all active:scale-95 ${
                  isSelected
                    ? "border-[#1A4516] bg-[#1A4516] text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/30"
                }`}>
                {tip.label}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Bill Details */}
      <motion.div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80">
        <div className="flex items-center gap-2.5 mb-5 pb-3 border-b border-slate-100">
          <div className="h-9 w-9 rounded-xl bg-[#F5FBF5] flex items-center justify-center text-[#1A4516]">
            <Clipboard size={18} />
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-base sm:text-lg tracking-tight">
              Order Summary
            </h3>
            <p className="text-[11px] text-slate-400 font-medium">Detailed price breakdown</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <span className="text-slate-500 font-bold text-[13px] uppercase tracking-wider">
              Item Total
            </span>
            <span className="font-black text-slate-800">
              ₹{pricingPreview?.productSubtotal ?? cartTotal}
            </span>
          </div>
          <div className="flex justify-between items-center px-2">
            <span className="text-slate-500 font-bold text-[13px] uppercase tracking-wider">
              Delivery Fee
            </span>
            <span className="font-black text-slate-800">
              {deliveryFee > 0 ? `₹${deliveryFee}` : "FREE"}
            </span>
          </div>
          <div className="flex justify-between items-center px-2">
            <span className="text-slate-500 font-bold text-[13px] uppercase tracking-wider">
              Handling Fee
            </span>
            <span className="font-black text-slate-800">₹{handlingFee}</span>
          </div>

          {selectedCoupon && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex justify-between items-center px-3 py-2 bg-[#F5FBF5] rounded-xl border border-[#1A4516]/10">
              <span className="text-[#1A4516] font-black text-xs flex items-center gap-2 uppercase tracking-wider">
                <Tag size={14} />
                Coupon Reserved
              </span>
              <span className="font-black text-[#1A4516]">-₹{discountAmount}</span>
            </motion.div>
          )}

          {tipAmount > 0 && (
            <div className="flex justify-between items-center px-3 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
              <span className="text-emerald-700 font-bold text-xs flex items-center gap-2">
                <Heart size={14} className="fill-emerald-600 text-emerald-600" />
                Partner Support Tip
              </span>
              <span className="font-black text-emerald-700">₹{tipAmount}</span>
            </div>
          )}

          {walletAmountToUse > 0 && (
            <motion.div
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex justify-between items-center px-3 py-2 bg-[#F5FBF5] rounded-xl border border-[#1A4516]/10 mb-2">
              <span className="text-[#1A4516] font-black text-[11px] flex items-center gap-2 uppercase tracking-tight">
                <Wallet size={14} />
                Wallet Applied
              </span>
              <span className="font-black text-[#1A4516]">-₹{walletAmountToUse}</span>
            </motion.div>
          )}

          <div className="mt-4 pt-6 border-t-2 border-dashed border-slate-100">
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <span className="font-[1000] text-slate-800 text-lg uppercase tracking-tight">
                  {previewError ? "Location Error" : (finalAmountToPay === 0 ? "Fully Covered" : "Total Payable")}
                </span>
                <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${previewError ? "text-red-500" : "text-slate-400"}`}>
                  {previewError ? "Cannot Place Order" : (finalAmountToPay === 0 ? "Paid via Wallet" : "Safe & Secure Payment")}
                </span>
              </div>
              <span className={`font-[1000] text-3xl tracking-tighter italic ${previewError ? "text-red-500" : "text-[#1A4516]"}`}>
                {isPreviewLoading ? "Calculating..." : (previewError ? "N/A" : `₹${Math.ceil(finalAmountToPay)}`)}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
      
      {previewError && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-4 bg-red-50 rounded-2xl border border-red-200">
          <p className="text-red-700 font-bold text-sm leading-tight text-center">
            {previewError}
          </p>
        </motion.div>
      )}
    </>
  );
});

export default CheckoutPricingBreakdown;
