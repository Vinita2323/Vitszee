import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, ArrowRight } from 'lucide-react';

const SlideToPay = ({
    onSuccess,
    amount = 0,
    isLoading = false,
    disabled = false,
    text = "Proceed to Pay"
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const activeLoading = isLoading || isSubmitting;
    const isInteractable = !activeLoading && !disabled;

    const handleClick = async (e) => {
        e.preventDefault();
        if (!isInteractable) return;

        if (onSuccess) {
            try {
                setIsSubmitting(true);
                await onSuccess();
            } catch (err) {
                console.error("Order placement error:", err);
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    return (
        <motion.button
            type="button"
            onClick={handleClick}
            disabled={!isInteractable}
            whileHover={isInteractable ? { scale: 1.01 } : {}}
            whileTap={isInteractable ? { scale: 0.98 } : {}}
            aria-label={text}
            className={`group relative h-14 sm:h-16 w-full rounded-full overflow-hidden select-none transition-all duration-300 flex items-center justify-center px-6 ${
                disabled
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none border border-slate-300'
                    : 'bg-gradient-to-r from-[#1A4516] via-[#143d11] to-[#1A4516] text-white shadow-[0_12px_32px_rgba(26,69,22,0.35)] hover:shadow-[0_16px_36px_rgba(26,69,22,0.45)] border border-emerald-500/30 cursor-pointer'
            }`}
        >
            {/* Subtle Shimmer Effect */}
            {!disabled && !activeLoading && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <motion.div
                        className="absolute inset-y-0 -inset-x-1 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-20deg]"
                        initial={{ x: "-100%" }}
                        animate={{ x: "100%" }}
                        transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
                    />
                </div>
            )}

            {/* Button Content */}
            <div className="relative z-10 flex items-center justify-center gap-3 sm:gap-4">
                {activeLoading ? (
                    <>
                        <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin text-white" />
                        <span className="font-extrabold text-sm sm:text-base uppercase tracking-wider text-white">
                            Processing Order...
                        </span>
                    </>
                ) : (
                    <>
                        <span className="font-black text-sm sm:text-base tracking-[0.14em] uppercase">
                            {text}
                        </span>

                        {amount > 0 && (
                            <>
                                <span className="text-white/40 font-light text-base sm:text-lg">|</span>
                                <span className="font-black text-base sm:text-lg tracking-tight">
                                    ₹{Number(amount).toLocaleString('en-IN')}
                                </span>
                            </>
                        )}

                        <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all ${
                            disabled ? 'bg-slate-300 text-slate-500' : 'bg-white/20 group-hover:bg-white/30 text-white'
                        }`}>
                            <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
                        </div>
                    </>
                )}
            </div>
        </motion.button>
    );
};

export default SlideToPay;


