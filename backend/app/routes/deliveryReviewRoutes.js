import express from "express";
import { submitDeliveryReview, getMyReviews, getAllDeliveryReviews } from "../controller/deliveryReviewController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Customer route to submit review
router.post("/submit", verifyToken, allowRoles("customer", "user"), submitDeliveryReview);

// Delivery partner route to see their own reviews
router.get("/me", verifyToken, allowRoles("delivery"), getMyReviews);

// Admin route to see all reviews
router.get("/admin", verifyToken, allowRoles("admin"), getAllDeliveryReviews);

export default router;
