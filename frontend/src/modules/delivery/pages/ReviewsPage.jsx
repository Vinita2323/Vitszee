import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deliveryApi } from "../services/deliveryApi";
import { ArrowLeft, Star } from "lucide-react";
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";
import { format } from "date-fns";

export default function ReviewsPage() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState({ averageRating: 0, totalReviews: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const res = await deliveryApi.getMyReviews();
      if (res.data?.success) {
        setReviews(res.data.result.reviews || []);
        setStats(res.data.result.stats || { averageRating: 0, totalReviews: 0 });
      }
    } catch (error) {
      console.error("Failed to fetch reviews:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/delivery/profile");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50 pb-24">
        <div className="bg-[#1A4516] text-white pt-4 pb-5 px-4">
          <div className="flex items-center">
            <button
              type="button"
              onClick={handleBack}
              className="p-2 rounded-full hover:bg-white/10 transition-colors mr-2"
              aria-label="Go back"
            >
              <ArrowLeft size={18} className="text-white" />
            </button>
            <h1 className="text-lg font-black leading-tight tracking-tight">My Reviews</h1>
          </div>
        </div>
        <div className="p-5 flex justify-center mt-10 text-slate-500">Loading reviews...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 pb-24">
      <div className="bg-[#1A4516] text-white pt-4 pb-5 px-4 sticky top-0 z-20">
        <div className="flex items-center">
          <button
            type="button"
            onClick={handleBack}
            className="p-2 rounded-full hover:bg-white/10 transition-colors mr-2"
            aria-label="Go back"
          >
            <ArrowLeft size={18} className="text-white" />
          </button>
          <h1 className="text-lg font-black leading-tight tracking-tight">My Reviews</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col items-center justify-center mb-8">
          <h2 className="text-5xl font-black text-slate-800 mb-2">{stats.averageRating.toFixed(1)}</h2>
          <div className="flex gap-1 mb-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-6 h-6 ${
                  stats.averageRating >= star
                    ? "fill-amber-400 text-amber-400"
                    : stats.averageRating >= star - 0.5
                    ? "fill-amber-400 text-amber-400 opacity-50"
                    : "text-slate-200"
                }`}
              />
            ))}
          </div>
          <p className="text-slate-500 font-medium">Based on {stats.totalReviews} reviews</p>
        </div>

        <div className="flex flex-col gap-4">
          {reviews.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-slate-100">
              <p className="text-slate-500 font-medium">You don't have any reviews yet.</p>
            </div>
          ) : (
            reviews.map((review) => (
              <div key={review._id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden shrink-0">
                      {review.customerId?.profileImage ? (
                        <img
                          src={applyCloudinaryTransform(review.customerId.profileImage, { w: 100, h: 100, c: "fill" })}
                          alt={review.customerId?.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-300 text-slate-600 font-bold">
                          {review.customerId?.name?.charAt(0)?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{review.customerId?.name}</p>
                      <p className="text-xs text-slate-400">{format(new Date(review.createdAt), "MMM d, yyyy")}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 ${
                          review.rating >= star ? "fill-amber-400 text-amber-400" : "text-slate-200"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                {review.comment && <p className="text-slate-600 text-sm">{review.comment}</p>}
                <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-50">
                  Order: #{review.orderId?.orderId || "Unknown"}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
