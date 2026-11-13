import React from "react";
import { Link, useNavigate } from "react-router-dom";
import ProductCard from "../components/shared/ProductCard";
import { useWishlist } from "../context/WishlistContext";
import { ChevronLeft, Heart, Trash2 } from "lucide-react";

const WishlistPage = () => {
  const navigate = useNavigate();
  const {
    wishlist,
    clearWishlist,
    fetchFullWishlist,
    isFullDataFetched,
    loading,
  } = useWishlist();

  React.useEffect(() => {
    if (!isFullDataFetched) {
      fetchFullWishlist();
    }
  }, [isFullDataFetched]);

  if (loading && !isFullDataFetched) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1A4516]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-24">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm px-4 pt-5 pb-4 border-b border-slate-100 mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center p-1 -ml-1">
            <ChevronLeft size={24} className="text-[#1A4516]" />
          </button>
          <div>
            <h1 className="text-[19px] font-bold text-[#1A4516] tracking-tight">
              My Wishlist
            </h1>
            <p className="text-xs font-medium text-[#1A4516]/70">
              {wishlist.length} {wishlist.length === 1 ? "item" : "items"} saved
            </p>
          </div>
        </div>
        {wishlist.length > 0 && (
          <button
            onClick={clearWishlist}
            className="flex items-center gap-1.5 text-[#1A4516] text-xs font-bold hover:bg-[#F5FBF5] px-3 py-2 rounded-lg transition-colors">
            <Trash2 size={14} /> Clear
          </button>
        )}
      </div>

      <div className="px-4">
        {wishlist.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {wishlist.map((product) => (
              <ProductCard 
                key={product.id || product._id} 
                product={product} 
                neutralBg={true}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <div className="h-14 w-14 bg-[#F5FBF5] rounded-full flex items-center justify-center mx-auto mb-4">
              <Heart size={26} className="text-[#1A4516]" strokeWidth={2} />
            </div>
            <h2 className="text-lg font-bold text-[#1A4516] mb-1">
              No items in wishlist
            </h2>
            <p className="text-[#1A4516]/80 text-sm mb-6 max-w-xs mx-auto">
              Start saving your favorite items to see them here later.
            </p>
            <Link
              to="/categories"
              className="px-6 py-3 bg-[#1A4516] text-white text-[15px] font-bold rounded-xl shadow-lg hover:bg-[#0a3000] active:scale-[0.98] transition-all">
              Explore Products
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default WishlistPage;
