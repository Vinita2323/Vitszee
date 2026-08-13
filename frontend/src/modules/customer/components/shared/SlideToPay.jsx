import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { motion, useAnimation, useMotionValue, useTransform } from 'framer-motion';
import { ChevronRight, Check, ChevronsRight } from 'lucide-react';

const SlideToPay = ({
    onSuccess,
    amount = 0,
    isLoading = false,
    disabled = false,
    text = "Slide to Pay"
}) => {
    const [isCompleted, setIsCompleted] = useState(false);
    const controls = useAnimation();
    const x = useMotionValue(0);
    const containerRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const sliderWidth = 56; // Width of the sliding circle (w-14)

    // Measure container width dynamically
    const updateWidth = () => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const w = rect.width || containerRef.current.offsetWidth || 0;
            if (w > 0) {
                setContainerWidth(w);
            }
        }
    };

    useLayoutEffect(() => {
        updateWidth();

        let observer;
        if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
            observer = new ResizeObserver(() => {
                updateWidth();
            });
            observer.observe(containerRef.current);
        }

        window.addEventListener('resize', updateWidth);
        return () => {
            if (observer) observer.disconnect();
            window.removeEventListener('resize', updateWidth);
        };
    }, []);

    // Fallback effective width if initial measurement is 0
    const measuredWidth = containerWidth > 0 ? containerWidth : (containerRef.current?.offsetWidth || 340);
    const maxDrag = Math.max(80, measuredWidth - sliderWidth - 12);

    // Dynamic transforms based on drag position
    const textOpacity = useTransform(x, [0, maxDrag * 0.5], [1, 0]);
    const shimmerOpacity = useTransform(x, [0, maxDrag * 0.3], [1, 0]);
    const rotate = useTransform(x, [0, maxDrag], [0, 360]);
    const arrowsOpacity = useTransform(x, [0, maxDrag * 0.8], [1, 0]);
    const checkOpacity = useTransform(x, [maxDrag * 0.5, maxDrag], [0, 1]);
    const fillWidth = useTransform(x, [0, maxDrag], [0, measuredWidth]);

    const handleDragStart = () => {
        updateWidth();
    };

    const handleDragEnd = async () => {
        const currentX = x.get();
        if (currentX >= maxDrag * 0.75) {
            setIsCompleted(true);
            controls.start({ x: maxDrag });
            if (onSuccess) {
                try {
                    await onSuccess();
                } catch (err) {
                    console.error("Slide order placement error:", err);
                } finally {
                    setIsCompleted(false);
                    controls.start({ x: 0 });
                }
            } else {
                setIsCompleted(false);
                controls.start({ x: 0 });
            }
        } else {
            controls.start({ x: 0 });
        }
    };

    useEffect(() => {
        if (!isLoading && !isCompleted) {
            controls.start({ x: 0 });
        }
    }, [isLoading, isCompleted, controls]);

    const isInteractable = !isCompleted && !isLoading && !disabled;

    return (
        <div
            ref={containerRef}
            className={`relative h-16 w-full rounded-full overflow-hidden select-none touch-none bg-gradient-to-r from-[#1A4516] via-[#1A4516] to-[#1A4516] shadow-[0_18px_45px_rgba(4,120,87,0.35)] border border-white/10 transition-opacity duration-200 ${
                disabled ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''
            }`}
        >
            {/* Progress Fill */}
            <motion.div
                className="absolute inset-y-0 left-0 bg-white/15 pointer-events-none"
                style={{ width: fillWidth }}
            />

            {/* Shimmer Effect Background */}
            <motion.div
                className="absolute inset-0 overflow-hidden pointer-events-none"
                style={{ opacity: shimmerOpacity }}
            >
                <motion.div
                    className="absolute inset-y-0 -inset-x-1 bg-gradient-to-r from-transparent via-white/35 to-transparent skew-x-[-20deg]"
                    initial={{ x: "-100%" }}
                    animate={{ x: "100%" }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
                />
            </motion.div>

            {/* Text Label */}
            <motion.div
                className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none px-16 text-center"
                style={{ opacity: textOpacity }}
            >
                <span className="text-white font-black text-xs sm:text-sm tracking-[0.2em] uppercase flex items-center justify-center gap-2 truncate">
                    <span>{text}</span>
                    <span className="text-white/40">|</span>
                    <span className="text-white font-extrabold">₹{amount}</span>
                </span>

                <div className="absolute right-4 animate-pulse text-white/70">
                    <ChevronsRight size={20} />
                </div>
            </motion.div>

            {/* Success / Processing State Text */}
            {isCompleted && (
                <motion.div
                    className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
                >
                    <span className="text-white font-black text-base md:text-lg tracking-wide uppercase flex items-center gap-2">
                        Processing <span className="animate-pulse">...</span>
                    </span>
                </motion.div>
            )}

            {/* Draggable Circle Knob */}
            <motion.div
                className={`absolute left-1 top-1 bottom-1 w-14 h-14 bg-white rounded-full flex items-center justify-center z-20 shadow-[0_6px_18px_rgba(15,118,110,0.35)] border border-[#1A4516]/10 ${
                    isInteractable ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed'
                }`}
                drag={isInteractable ? "x" : false}
                dragConstraints={{ left: 0, right: maxDrag }}
                dragElastic={0.05}
                dragMomentum={false}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                animate={controls}
                style={{ x }}
                whileTap={isInteractable ? { scale: 0.95 } : undefined}
                whileHover={isInteractable ? { scale: 1.05 } : undefined}
            >
                {isLoading || isCompleted ? (
                    <motion.div
                        className="h-6 w-6 border-2 border-[#1A4516] border-t-transparent rounded-full animate-spin"
                    />
                ) : (
                    <motion.div
                        className="relative w-full h-full flex items-center justify-center"
                        style={{ rotate }}
                    >
                        <motion.div className="text-[#1A4516]" style={{ opacity: arrowsOpacity }}>
                            <ChevronRight size={28} strokeWidth={3} />
                        </motion.div>
                        <motion.div
                            className="absolute inset-0 flex items-center justify-center text-[#1A4516]"
                            style={{ opacity: checkOpacity }}
                        >
                            <Check size={24} strokeWidth={3} />
                        </motion.div>
                    </motion.div>
                )}
            </motion.div>
        </div>
    );
};

export default SlideToPay;


