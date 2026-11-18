import DeliveryReview from "../models/deliveryReview.js";
import Delivery from "../models/delivery.js";
import Order from "../models/order.js";
import handleResponse from "../utils/helper.js";

// @desc    Submit a review for a delivery partner (Customer)
export const submitDeliveryReview = async (req, res) => {
    try {
        const { orderId, deliveryBoyId, rating, comment } = req.body;
        const customerId = req.user.id || req.user._id;

        if (!orderId || !deliveryBoyId || !rating) {
            return handleResponse(res, 400, "Order ID, Delivery Boy ID, and Rating are required");
        }

        // Validate rating
        const numRating = Number(rating);
        if (numRating < 1 || numRating > 5) {
            return handleResponse(res, 400, "Rating must be between 1 and 5");
        }

        // Verify the order exists and was delivered by this delivery boy
        const order = await Order.findOne({ 
            $or: [{ _id: orderId.match(/^[0-9a-fA-F]{24}$/) ? orderId : null }, { orderId: orderId }] 
        });
        
        console.log("Submit Review - Check:", {
            orderFound: !!order,
            orderCustomer: order?.customer,
            reqCustomerId: customerId,
            orderDeliveryBoy: order?.deliveryBoy,
            reqDeliveryBoyId: deliveryBoyId,
            orderStatus: order?.orderStatus,
            status: order?.status
        });

        if (!order) {
            return handleResponse(res, 404, "Order not found");
        }

        const orderDeliveryBoyStr = order.deliveryBoy?._id ? order.deliveryBoy._id.toString() : order.deliveryBoy?.toString();
        if (orderDeliveryBoyStr !== deliveryBoyId.toString()) {
            return handleResponse(res, 400, "This delivery partner did not deliver this order");
        }

        const orderCustomerStr = order.customer?._id ? order.customer._id.toString() : order.customer?.toString();
        if (orderCustomerStr !== customerId.toString()) {
             return handleResponse(res, 403, `You can only review your own orders. (Order Customer: ${orderCustomerStr}, Your ID: ${customerId.toString()})`);
        }

        if (order.orderStatus?.toLowerCase() !== "delivered" && order.status?.toLowerCase() !== "delivered") {
            return handleResponse(res, 400, "You can only review after the order is delivered");
        }

        // Upsert the review
        await DeliveryReview.findOneAndUpdate(
            { orderId: order._id, customerId },
            { orderId: order._id, customerId, deliveryBoyId, rating: numRating, comment },
            { new: true, upsert: true }
        );

        // Recalculate average rating
        const allReviews = await DeliveryReview.find({ deliveryBoyId });
        const totalReviews = allReviews.length;
        const sum = allReviews.reduce((acc, r) => acc + r.rating, 0);
        const averageRating = totalReviews > 0 ? sum / totalReviews : 0;

        await Delivery.findByIdAndUpdate(deliveryBoyId, {
            averageRating: parseFloat(averageRating.toFixed(1)),
            totalReviews
        });

        return handleResponse(res, 200, "Review submitted successfully");
    } catch (error) {
        console.error("submitDeliveryReview error:", error);
        if (error.code === 11000) {
            return handleResponse(res, 400, "You have already reviewed this delivery");
        }
        return handleResponse(res, 500, "Error: " + error.message);
    }
};

// @desc    Get reviews for logged in delivery partner
export const getMyReviews = async (req, res) => {
    try {
        const deliveryBoyId = req.user.id || req.user._id;
        
        const reviews = await DeliveryReview.find({ deliveryBoyId })
            .populate("customerId", "name profileImage")
            .populate("orderId", "orderId")
            .sort({ createdAt: -1 })
            .limit(50);

        const delivery = await Delivery.findById(deliveryBoyId).select("averageRating totalReviews");

        return handleResponse(res, 200, "Reviews fetched successfully", {
            reviews,
            stats: {
                averageRating: delivery?.averageRating || 0,
                totalReviews: delivery?.totalReviews || 0
            }
        });
    } catch (error) {
        console.error("Error submitting delivery review:", error);
        return handleResponse(res, 500, "Server error: " + error.message);
    }
};

// @desc    Get all delivery reviews (Admin)
export const getAllDeliveryReviews = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const reviews = await DeliveryReview.find()
            .populate("customerId", "name phone")
            .populate("deliveryBoyId", "name phone")
            .populate("orderId", "orderId")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await DeliveryReview.countDocuments();

        return handleResponse(res, 200, "All reviews fetched", {
            reviews,
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("getAllDeliveryReviews error:", error);
        return handleResponse(res, 500, "Server error while fetching all reviews");
    }
};
