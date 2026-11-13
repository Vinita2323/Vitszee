import { useState } from "react";
import { Star } from "lucide-react";
import { customerApi } from "../../services/customerApi";
import { toast } from "sonner";
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";

export default function DeliveryPartnerRating({ orderId, deliveryBoy }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!deliveryBoy || !deliveryBoy._id) return null;
  if (submitted) return null;

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }
    
    try {
      setIsSubmitting(true);
      await customerApi.submitDeliveryReview({
        orderId,
        deliveryBoyId: deliveryBoy._id || deliveryBoy.id,
        rating,
        comment
      });
      toast.success("Thank you for your feedback!");
      setSubmitted(true);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to submit review");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm border border-slate-100 flex flex-col items-center">
      <h3 className="font-bold text-slate-800 mb-2">How was your delivery?</h3>
      <div className="flex items-center gap-3 mb-4 bg-slate-50 px-4 py-2 rounded-xl">
        <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden shrink-0">
           {deliveryBoy.profileImage ? (
             <img src={applyCloudinaryTransform(deliveryBoy.profileImage, { w: 100, h: 100, c: "fill" })} alt={deliveryBoy.name} className="w-full h-full object-cover" />
           ) : (
             <div className="w-full h-full flex items-center justify-center bg-slate-300 text-slate-600 font-bold">
               {deliveryBoy.name?.charAt(0)?.toUpperCase()}
             </div>
           )}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Rate {deliveryBoy.name}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className="focus:outline-none transition-transform active:scale-90"
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            onClick={() => setRating(star)}
          >
            <Star
              className={`w-8 h-8 ${
                (hoverRating || rating) >= star ? "fill-amber-400 text-amber-400" : "text-slate-300"
              } transition-colors`}
            />
          </button>
        ))}
      </div>

      {rating > 0 && (
        <div className="w-full mt-2 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
          <textarea
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
            placeholder="Any comments? (Optional)"
            rows="2"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={isSubmitting}
          />
          <button
            className="w-full bg-primary text-white font-bold py-3 rounded-xl disabled:opacity-50"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Submit Review"}
          </button>
        </div>
      )}
    </div>
  );
}
