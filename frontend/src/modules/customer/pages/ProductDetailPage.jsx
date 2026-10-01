import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Heart, Plus, Minus, Star, ShieldCheck, MessageSquare, Share2, ShoppingCart, ChevronLeft, BadgeCheck, Package, Sparkles } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '@shared/components/ui/Toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { customerApi } from '../services/customerApi';
import { buildDisplaySku } from '../utils/productSku';
import { useLocation as useAppLocation } from '../context/LocationContext';
import { applyCloudinaryTransform } from '@/core/utils/imageUtils';
import Lottie from 'lottie-react';

function toReadableParagraphs(raw) {
    if (!raw) return [];
    let text = String(raw).replace(/\r/g, " ").trim();
    if (text.startsWith("{\\rtf") || text.includes("\\par")) {
        text = text
            .replace(/\{\\[^}]*\}/g, "")
            .replace(/\\[a-z]+\d*\s?/gi, "")
            .replace(/[{}]/g, "")
            .replace(/\\'/g, "'")
            .replace(/\s+/g, " ")
            .trim();
    }
    const keywordStart = text.search(/(?:^|\s)(?:[a-z][a-z0-9'+/-]*)(?:\s+[a-z][a-z0-9'+/-]*){18,}\s*$/);
    if (keywordStart > 40) text = text.slice(0, keywordStart).trim();

    const sentences = text
        .replace(/\s+/g, " ")
        .split(/(?<=[.!?])\s+/)
        .map((part) => part.trim())
        .filter(Boolean);

    const paragraphs = [];
    let current = "";
    sentences.forEach((sentence) => {
        current = current ? `${current} ${sentence}` : sentence;
        if (current.length > 220) {
            paragraphs.push(current);
            current = "";
        }
    });
    if (current) paragraphs.push(current);
    return paragraphs;
}

const ProductDetailPage = () => {
    const { id, sku: skuParam } = useParams();
    const navigate = useNavigate();
    const { cartCount, addToCart } = useCart();
    const { toggleWishlist: toggleWishlistGlobal, isInWishlist } = useWishlist();
    const { showToast } = useToast();
    const { currentLocation } = useAppLocation();

    const [product, setProduct] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeImage, setActiveImage] = useState('');
    const [reviews, setReviews] = useState([]);
    const [reviewLoading, setReviewLoading] = useState(false);
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const [newReview, setNewReview] = useState({ rating: 5, comment: '' });
    const [localHasReviewed, setLocalHasReviewed] = useState(false);
    const [noServiceData, setNoServiceData] = useState(null);
    const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
    const [showFullDescription, setShowFullDescription] = useState(false);
    const [orderQty, setOrderQty] = useState(1);

    // Dynamically load no-service Lottie on mount
    useEffect(() => {
        import('@/assets/lottie/animation.json')
            .then((m) => setNoServiceData(m.default))
            .catch(() => {});
    }, []);

    const fetchData = async (showLoader = true) => {
        if (showLoader) setIsLoading(true);
        setError(null);
        try {
            const hasValidLocation =
                Number.isFinite(currentLocation?.latitude) &&
                Number.isFinite(currentLocation?.longitude);

            const params = hasValidLocation ? {
                lat: currentLocation.latitude,
                lng: currentLocation.longitude
            } : {};

            const res = skuParam
                ? await customerApi.getProductBySku(skuParam, params)
                : await customerApi.getProductById(id, params);
            if (res.data.success) {
                const p = res.data.result;
                const formatted = {
                    ...p,
                    id: p._id,
                    images: [p.mainImage, ...(p.galleryImages || [])].filter(Boolean)
                };
                setProduct(formatted);
                setSelectedVariantIndex(0);
                setShowFullDescription(false);
                setOrderQty(1);
                setActiveImage(formatted.images[0] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=600&auto=format&fit=crop');
                fetchReviews(p._id);
            }
        } catch (err) {
            console.error("Fetch product error:", err);
            setError(err.response?.data?.message || "Failed to load product");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchReviews = async (productId) => {
        try {
            setReviewLoading(true);
            const res = await customerApi.getProductReviews(productId);
            if (res.data.success) {
                setReviews(res.data.results || []);
            }
        } catch (error) {
            console.error("Fetch reviews error:", error);
        } finally {
            setReviewLoading(false);
        }
    };

    useEffect(() => {
        setNewReview({ rating: 5, comment: '' });
        setLocalHasReviewed(false);
        setReviews([]);
        if (skuParam || id) {
            fetchData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [skuParam, id]);

    useEffect(() => {
        if ((skuParam || id) && product) {
            fetchData(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentLocation?.latitude, currentLocation?.longitude]);

    const handleReviewSubmit = async (e) => {
        e.preventDefault();
        if (!newReview.comment.trim()) return;

        try {
            setIsSubmittingReview(true);
            const res = await customerApi.submitReview({
                productId: product?.id || id,
                rating: newReview.rating,
                comment: newReview.comment
            });
            if (res.data.success) {
                showToast("Review submitted successfully", "success");
                setNewReview({ rating: 5, comment: '' });
                setLocalHasReviewed(true);
                setReviews(prev => [{
                    _id: 'temp-' + Date.now(),
                    rating: newReview.rating,
                    comment: newReview.comment,
                    createdAt: new Date().toISOString(),
                    userId: { name: 'You' },
                    status: 'pending'
                }, ...prev]);
            }
        } catch (error) {
            showToast(error.response?.data?.message || "Failed to submit review", "error");
        } finally {
            setIsSubmittingReview(false);
        }
    };

    const handleToggleWishlist = () => {
        if (!product) return;
        toggleWishlistGlobal(product);
        const isWishlisted = isInWishlist(product.id);
        showToast(
            isWishlisted ? `${product.name} removed from wishlist` : `${product.name} added to wishlist`,
            isWishlisted ? 'info' : 'success'
        );
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !product) {
        return (
            <div className="min-h-screen bg-white py-20 px-8 flex flex-col items-center justify-center text-center">
                <div className="w-64 h-64 mb-6">
                    {noServiceData ? (
                        <Lottie animationData={noServiceData} loop={true} />
                    ) : (
                        <div className="w-64 h-64" />
                    )}
                </div>
                <h3 className="text-3xl font-[1000] text-slate-800 tracking-tighter mb-4 uppercase">
                    Item <span className="text-primary">Unavailable</span>
                </h3>
                <p className="text-slate-500 font-bold text-sm max-w-[280px] mb-8 leading-relaxed">
                    {error === "Product not available in your area" 
                        ? "This item is not available at your current location yet." 
                        : "We couldn't load this product details. Try again later!"}
                </p>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                    <button 
                        onClick={() => navigate('/')}
                        className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 active:scale-95 transition-all shadow-xl shadow-black/10"
                    >
                        Go to Home
                    </button>
                    <button 
                        onClick={() => navigate(-1)}
                        className="px-10 py-4 bg-white text-slate-900 border border-slate-200 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const selectedVariant = variants[selectedVariantIndex] || null;
    const variantKey = String(selectedVariant?.sku || selectedVariant?.name || "").trim();
    const isWishlisted = isInWishlist(product.id);
    const displayPrice = selectedVariant
        ? (Number(selectedVariant.salePrice) > 0 && Number(selectedVariant.salePrice) < Number(selectedVariant.price)
            ? Number(selectedVariant.salePrice)
            : Number(selectedVariant.price))
        : Number(product.salePrice || product.price);
    const displayMrp = selectedVariant ? Number(selectedVariant.price) : Number(product.price);
    const hasDiscount = displayMrp > displayPrice;
    const displayStock = selectedVariant?.stock !== undefined ? selectedVariant.stock : product.stock;
    const paragraphs = toReadableParagraphs(product.description);
    const summary = paragraphs[0] || "Fresh and premium quality product sourced directly from local vendors.";
    const averageRating = reviews.length
        ? (reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1)
        : null;

    const imageIndex = Math.max(0, product.images.indexOf(activeImage));
    const discountPercent = hasDiscount ? Math.round(((displayMrp - displayPrice) / displayMrp) * 100) : 0;
    const unavailable = product.isAvailableInLocation === false;
    const outOfStock = displayStock <= 0;
    const highlights = [
        { icon: ShieldCheck, title: "Quality", text: "Guaranteed" },
        { icon: BadgeCheck, title: product.brand || "Original", text: "Brand" },
        { icon: Package, title: product.weight || "1 unit", text: "Pack size" },
        { icon: Sparkles, title: outOfStock ? "Sold out" : "In stock", text: "Availability" },
    ];

    const shareProduct = async () => {
        const url = window.location.href;
        try {
            if (navigator.share) {
                await navigator.share({ title: product.name, url });
                return;
            }
            await navigator.clipboard.writeText(url);
            showToast("Product link copied", "success");
        } catch (err) {
            if (err?.name !== "AbortError") showToast("Couldn't share this product", "error");
        }
    };

    const addCurrentProduct = async () => {
        if (unavailable) {
            showToast("This item is not available in your area", "error");
            return false;
        }
        if (outOfStock) {
            showToast("This item is currently out of stock", "error");
            return false;
        }
        const times = Math.min(orderQty, displayStock);
        const payload = {
            ...product,
            price: displayPrice,
            salePrice: hasDiscount ? displayPrice : product.salePrice,
            stock: displayStock,
            variantSku: variantKey,
            variantName: selectedVariant?.name || "",
            image: product.mainImage || product.images?.[0],
        };
        for (let step = 0; step < times; step += 1) {
            await addToCart(payload);
        }
        showToast(`${product.name} added to cart`, "success");
        return true;
    };

    const buyNow = async () => {
        const added = await addCurrentProduct();
        if (added) navigate("/checkout");
    };

    return (
        <div className="min-h-screen bg-white text-slate-900 pb-28 md:pb-16">
            <div className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur">
                <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-slate-700"
                        aria-label="Back"
                    >
                        <ChevronLeft size={22} />
                    </button>
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-800">{currentLocation?.time || "Delivery"}</p>
                        <p className="truncate text-xs text-slate-500">{currentLocation?.name || "Set your location"}</p>
                    </div>
                    <Link to="/checkout" className="relative flex h-9 w-9 items-center justify-center text-slate-800">
                        <ShoppingCart size={20} />
                        {cartCount > 0 && (
                            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold text-white">
                                {cartCount}
                            </span>
                        )}
                    </Link>
                </div>
            </div>

            <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 md:gap-10 md:px-8 md:pt-6">
                <div className="px-3 pt-3 md:px-0">
                    <div className="flex gap-3">
                        {product.images.length > 1 && (
                            <div className="flex max-h-[360px] w-14 shrink-0 flex-col gap-2 overflow-y-auto md:max-h-[520px] md:w-16">
                                {product.images.map((img, idx) => (
                                    <button
                                        key={`${img}-${idx}`}
                                        type="button"
                                        onClick={() => setActiveImage(img)}
                                        className={cn(
                                            "h-14 w-14 shrink-0 overflow-hidden rounded-xl border bg-slate-50 md:h-16 md:w-16",
                                            activeImage === img ? "border-[#1A4516]" : "border-slate-200"
                                        )}
                                    >
                                        <img src={applyCloudinaryTransform(img, "f_auto,q_auto,w_120")} alt="" className="h-full w-full object-contain p-1" />
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-2xl bg-[#f4f6f3] md:min-h-[480px]">
                            <img
                                src={applyCloudinaryTransform(activeImage, "f_auto,q_auto,w_900")}
                                alt={product.name}
                                className="h-full w-full object-contain p-6"
                            />
                            <div className="absolute right-3 top-3 flex gap-2">
                                <button type="button" onClick={shareProduct} className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm" aria-label="Share">
                                    <Share2 size={16} />
                                </button>
                                <button type="button" onClick={handleToggleWishlist} className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm" aria-label="Wishlist">
                                    <Heart size={16} className={cn(isWishlisted ? "fill-red-500 text-red-500" : "text-slate-600")} />
                                </button>
                            </div>
                            {product.images.length > 1 && (
                                <span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                    {imageIndex + 1}/{product.images.length}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-4 md:px-0">
                    {product.brand && (
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1A4516]">{product.brand}</p>
                    )}
                    <h1 className="mt-1 text-[26px] font-semibold leading-tight text-slate-900">{product.name}</h1>
                    {(selectedVariant?.name || product.weight) && (
                        <p className="mt-1 text-sm text-slate-500">{selectedVariant?.name || product.weight}</p>
                    )}
                    <p className="mt-2 inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tracking-wider text-slate-600">
                        SKU {buildDisplaySku(product)}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        {averageRating && (
                            <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                                <Star size={14} className="fill-amber-400 text-amber-400" />
                                {averageRating}
                                <span className="text-slate-400">({reviews.length} reviews)</span>
                            </span>
                        )}
                        {product.isFeatured && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Bestseller</span>
                        )}
                    </div>

                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-3xl font-semibold text-slate-900">₹{displayPrice}</span>
                        {hasDiscount && <span className="text-base text-slate-400 line-through">₹{displayMrp}</span>}
                        {hasDiscount && <span className="text-sm font-semibold text-emerald-600">{discountPercent}% OFF</span>}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Inclusive of all taxes</p>

                    <div className="mt-4 flex items-center gap-3 rounded-2xl bg-emerald-50 px-3 py-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-emerald-700">
                            <ShieldCheck size={18} />
                        </span>
                        <span>
                            <span className="block text-sm font-semibold text-emerald-800">Quality Guaranteed</span>
                            <span className="block text-xs text-emerald-700/80">Checked before it reaches you</span>
                        </span>
                    </div>

                    {unavailable && (
                        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            Not available for delivery to {currentLocation?.city || "your area"}.
                        </p>
                    )}

                    {variants.length > 0 && (
                        <div className="mt-5">
                            <p className="text-sm font-semibold text-slate-800">Choose Option</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {variants.map((variant, index) => (
                                    <button
                                        key={variant._id || variant.sku || index}
                                        type="button"
                                        onClick={() => {
                                            setSelectedVariantIndex(index);
                                            setOrderQty(1);
                                        }}
                                        className={cn(
                                            "rounded-full border px-4 py-2 text-sm",
                                            index === selectedVariantIndex
                                                ? "border-[#1A4516] bg-[#1A4516] text-white"
                                                : "border-slate-200 bg-white text-slate-700"
                                        )}
                                    >
                                        {variant.name || variant.sku}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="mt-5 flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-800">Quantity</p>
                        <div className="flex items-center gap-4 rounded-full border border-slate-200 px-3 py-1.5">
                            <button
                                type="button"
                                onClick={() => setOrderQty((qty) => Math.max(1, qty - 1))}
                                className="text-slate-600"
                                aria-label="Decrease quantity"
                            >
                                <Minus size={16} />
                            </button>
                            <span className="w-4 text-center text-sm font-semibold">{orderQty}</span>
                            <button
                                type="button"
                                onClick={() => setOrderQty((qty) => Math.min(displayStock || 1, qty + 1))}
                                className="text-slate-600"
                                aria-label="Increase quantity"
                                disabled={outOfStock || orderQty >= displayStock}
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="mt-5 grid grid-cols-4 gap-2 border-y border-slate-100 py-4">
                        {highlights.map((item) => (
                            <div key={item.text} className="flex flex-col items-center text-center">
                                <item.icon size={18} className="text-emerald-700" />
                                <p className="mt-1 text-[11px] font-semibold leading-tight text-slate-800">{item.title}</p>
                                <p className="text-[10px] text-slate-400">{item.text}</p>
                            </div>
                        ))}
                    </div>

                    <div className="fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t border-slate-100 bg-white px-4 py-3 md:static md:mt-5 md:border-0 md:px-0 md:py-0">
                        <button
                            type="button"
                            onClick={addCurrentProduct}
                            disabled={unavailable || outOfStock}
                            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border-2 border-[#1A4516] text-sm font-semibold text-[#1A4516] disabled:opacity-40"
                        >
                            <ShoppingCart size={16} /> Add to Cart
                        </button>
                        <button
                            type="button"
                            onClick={buyNow}
                            disabled={unavailable || outOfStock}
                            className="h-12 flex-1 rounded-full bg-[#1A4516] text-sm font-semibold text-white disabled:opacity-40"
                        >
                            {outOfStock ? "Out of stock" : "Buy Now"}
                        </button>
                    </div>

                    <div className="mt-6">
                        <p className={cn("text-sm leading-6 text-slate-600", !showFullDescription && "line-clamp-4")}>{summary}</p>
                        {paragraphs.length > 1 && (
                            <button type="button" onClick={() => setShowFullDescription((open) => !open)} className="mt-2 text-sm font-semibold text-[#1A4516]">
                                {showFullDescription ? "Show less" : "Read more"}
                            </button>
                        )}
                        {showFullDescription && paragraphs.slice(1).map((paragraph) => (
                            <p key={paragraph.slice(0, 40)} className="mt-3 text-sm leading-6 text-slate-600">{paragraph}</p>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mx-auto mt-8 max-w-6xl border-t border-slate-100 px-4 pt-8 md:px-8">
                <div className="grid gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                    <div className="rounded-2xl border border-slate-100 p-5">
                        <h3 className="text-lg font-semibold">Write a Review</h3>
                        <p className="mt-1 text-sm text-slate-500">Share your experience with this product</p>
                        {product?.hasReviewed || localHasReviewed ? (
                            <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-800">You have already reviewed this product. Thank you!</p>
                        ) : product?.hasPurchased ? (
                            <form onSubmit={handleReviewSubmit} className="mt-4 space-y-4">
                                <div className="flex gap-2">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <button
                                            key={star}
                                            type="button"
                                            onClick={() => setNewReview({ ...newReview, rating: star })}
                                            className={cn("flex h-10 w-10 items-center justify-center rounded-xl", newReview.rating >= star ? "bg-amber-50 text-amber-500" : "bg-slate-50 text-slate-300")}
                                        >
                                            <Star className={cn("h-5 w-5", newReview.rating >= star && "fill-current")} />
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    value={newReview.comment}
                                    onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
                                    placeholder="What did you like or dislike?"
                                    className="min-h-[100px] w-full rounded-xl bg-slate-50 p-3 text-sm outline-none"
                                />
                                <Button type="submit" disabled={isSubmittingReview} className="h-11 w-full rounded-xl bg-[#1A4516] text-white">
                                    {isSubmittingReview ? "Submitting..." : "Post Review"}
                                </Button>
                            </form>
                        ) : (
                            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">You must purchase and receive this product before you can write a review.</p>
                        )}
                    </div>

                    <div>
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-lg font-semibold">Customer Reviews</h3>
                            <span className="inline-flex items-center gap-1 text-sm text-[#1A4516]">
                                <MessageSquare size={16} /> {reviews.length}
                            </span>
                        </div>
                        {reviewLoading ? (
                            <div className="flex justify-center py-10">
                                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1A4516] border-t-transparent" />
                            </div>
                        ) : reviews.length > 0 ? (
                            <div className="space-y-3">
                                {reviews.map((review) => (
                                    <div key={review._id} className="rounded-2xl border border-slate-100 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="font-medium text-slate-800">
                                                {review.userId?.name || "Anonymous"}
                                                {review.status === "pending" && <span className="ml-2 text-[10px] font-semibold uppercase text-amber-500">Pending</span>}
                                            </p>
                                            <span className="text-[11px] text-slate-400">{new Date(review.createdAt).toLocaleDateString("en-GB")}</span>
                                        </div>
                                        <div className="mt-1 flex gap-0.5">
                                            {[...Array(5)].map((_, i) => (
                                                <Star key={i} size={12} className={cn(i < review.rating ? "fill-amber-400 text-amber-400" : "text-slate-200")} />
                                            ))}
                                        </div>
                                        <p className="mt-2 text-sm text-slate-600">{review.comment}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">No reviews yet. Be the first!</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductDetailPage;
