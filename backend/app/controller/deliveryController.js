import Order from "../models/order.js";
import { orderMatchQueryFromRouteParam } from "../utils/orderLookup.js";
import Transaction from "../models/transaction.js";
import Delivery from "../models/delivery.js";
import DeliveryAssignment from "../models/deliveryAssignment.js";
import Wallet from "../models/wallet.js";
import handleResponse from "../utils/helper.js";
import mongoose from "mongoose";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import {
  writeDeliveryLocation,
  appendTrailPoint,
  clearOrderTracking,
  clearRiderPresence,
} from "../services/firebaseService.js";
import { applyDeliveredSettlement } from "../services/orderSettlement.js";
import { roundCurrency } from "../utils/money.js";
import logger from "../services/logger.js";
import { shouldThrottle as throttleLocationUpdate } from "../services/delivery/locationThrottleService.js";
import {
  getDeliveryStats as getDeliveryStatsFromService,
  getDeliveryEarnings as getDeliveryEarningsFromService,
  getDeliveryCodCashSummary as getDeliveryCodCashSummaryFromService,
} from "../services/delivery/deliveryEarningsService.js";
import { reconcileCodCash } from "../services/finance/orderFinanceService.js";
import crypto from "crypto";
import Razorpay from "razorpay";
/* ===============================
   GET DELIVERY DASHBOARD STATS
================================ */
export const getDeliveryStats = async (req, res) => {
    try {
        const result = await getDeliveryStatsFromService(req.user.id);
        return handleResponse(res, 200, "Stats fetched", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   GET DELIVERY EARNINGS
================================ */
export const getDeliveryEarnings = async (req, res) => {
    try {
        const { timeframe } = req.query;
        const result = await getDeliveryEarningsFromService(req.user.id, timeframe);
        return handleResponse(res, 200, "Earnings fetched", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   GET DELIVERY COD CASH SUMMARY
================================ */
export const getDeliveryCodCashSummary = async (req, res) => {
    try {
        const rawId = req.user?.id ?? req.user?._id;
        const result = await getDeliveryCodCashSummaryFromService(rawId);
        return handleResponse(res, 200, "COD cash summary fetched", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   SUBMIT DELIVERY COD CASH
================================ */
export const submitDeliveryCodCashToAdmin = async (req, res) => {
    try {
        const rawId = req.user?.id ?? req.user?._id;
        if (!rawId) {
            return handleResponse(res, 401, "Unauthorized");
        }
        if (!mongoose.Types.ObjectId.isValid(String(rawId))) {
            return handleResponse(res, 401, "Invalid user id");
        }

        const deliveryBoyId = new mongoose.Types.ObjectId(String(rawId));
        const orders = await Order.find({
            deliveryBoy: deliveryBoyId,
            paymentMode: "COD",
            status: { $ne: "cancelled" },
            orderStatus: { $ne: "cancelled" },
            "financeFlags.codMarkedCollected": true,
            "paymentBreakdown.codPendingAmount": { $gt: 0 },
        })
            .select("orderId paymentBreakdown.codPendingAmount")
            .sort({ createdAt: 1 })
            .lean();

        if (!orders.length) {
            return handleResponse(
                res,
                400,
                "No collected COD cash is ready to submit yet. Mark customer cash as collected first.",
            );
        }

        const totalAvailable = roundCurrency(
            orders.reduce(
                (sum, order) => sum + Number(order?.paymentBreakdown?.codPendingAmount || 0),
                0,
            ),
        );
        const requestedRaw = req.body?.amount;
        const requestedAmount =
            requestedRaw == null || requestedRaw === ""
                ? null
                : roundCurrency(requestedRaw);

        if (requestedAmount != null && (!Number.isFinite(Number(requestedRaw)) || requestedAmount <= 0)) {
            return handleResponse(res, 400, "Enter a valid amount to submit");
        }

        const amountToSubmit = requestedAmount == null ? totalAvailable : requestedAmount;
        if (amountToSubmit <= 0) {
            return handleResponse(
                res,
                400,
                "No collected COD cash is ready to submit yet. Mark customer cash as collected first.",
            );
        }
        if (amountToSubmit > totalAvailable) {
            return handleResponse(
                res,
                400,
                `You can submit up to ${String.fromCharCode(8377)}${totalAvailable.toLocaleString()}`,
            );
        }

        const settledOrders = [];
        let totalSubmitted = 0;
        let remaining = amountToSubmit;

        for (const order of orders) {
            const amount = roundCurrency(order?.paymentBreakdown?.codPendingAmount || 0);
            if (amount <= 0 || remaining <= 0) continue;
            const settleAmount = roundCurrency(Math.min(amount, remaining));

            await reconcileCodCash(
                order._id,
                settleAmount,
                deliveryBoyId,
                {
                    actorId: req.user?.id || null,
                    metadata: {
                        source: "delivery_cod_cash_page",
                        initiatedBy: "delivery_partner",
                    },
                },
            );

            totalSubmitted = roundCurrency(totalSubmitted + settleAmount);
            remaining = roundCurrency(remaining - settleAmount);
            settledOrders.push({
                orderId: order.orderId,
                amount: settleAmount,
            });
        }

        if (totalSubmitted <= 0) {
            return handleResponse(
                res,
                400,
                "No collected COD cash is ready to submit yet. Mark customer cash as collected first.",
            );
        }

        await Transaction.create({
            user: deliveryBoyId,
            userModel: "Delivery",
            type: "Cash Settlement",
            amount: -Math.abs(totalSubmitted),
            status: "Settled",
            reference: `CSH-SET-${deliveryBoyId}-${Date.now()}`,
            meta: {
                source: "delivery_cod_cash_page",
                orders: settledOrders.map((item) => item.orderId),
            },
        });

        const wallet = await Wallet.findOne({
            ownerType: "DELIVERY_PARTNER",
            ownerId: deliveryBoyId,
        })
            .select("cashInHand")
            .lean();

        return handleResponse(res, 200, "COD cash submitted to admin successfully", {
            totalSubmitted,
            orderCount: settledOrders.length,
            orders: settledOrders,
            cashInHand: roundCurrency(wallet?.cashInHand || 0),
        });
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   GET DELIVERY ORDER HISTORY
================================ */
/**
 * Any order this rider was linked to: primary assignment, return pickup, or v2 broadcast winner.
 */
async function buildAssignedToPartnerFilter(deliveryBoyId) {
    const clauses = [
        { deliveryBoy: deliveryBoyId },
        { returnDeliveryBoy: deliveryBoyId },
    ];
    try {
        const winnerOrderIds = await DeliveryAssignment.distinct("orderId", {
            winnerDeliveryId: deliveryBoyId,
        });
        if (winnerOrderIds?.length) {
            clauses.push({ orderId: { $in: winnerOrderIds } });
        }
    } catch {
        /* ignore */
    }
    return { $or: clauses };
}

export const getMyDeliveryOrders = async (req, res) => {
    try {
        const rawId = req.user?.id ?? req.user?._id;
        if (!rawId) {
            return handleResponse(res, 401, "Unauthorized");
        }
        if (!mongoose.Types.ObjectId.isValid(String(rawId))) {
            return handleResponse(res, 401, "Invalid user id");
        }
        const deliveryBoyId = new mongoose.Types.ObjectId(String(rawId));
        const { status } = req.query;
        const normalized = (status || "all").toLowerCase();

        const assignedToPartner = await buildAssignedToPartnerFilter(deliveryBoyId);

        /** v2 orders use workflowStatus; legacy uses status — both must be respected. */
        let query;
        if (normalized === "delivered") {
            query = {
                $and: [
                    assignedToPartner,
                    {
                        $or: [
                            { status: "delivered" },
                            { workflowStatus: WORKFLOW_STATUS.DELIVERED },
                        ],
                    },
                ],
            };
        } else if (normalized === "cancelled") {
            query = {
                $and: [
                    assignedToPartner,
                    {
                        $or: [
                            { status: "cancelled" },
                            { workflowStatus: WORKFLOW_STATUS.CANCELLED },
                        ],
                    },
                ],
            };
        } else if (normalized === "returns") {
            query = {
                returnStatus: { $ne: "none" },
                $or: [
                    { deliveryBoy: deliveryBoyId },
                    { returnDeliveryBoy: deliveryBoyId },
                ],
            };
        } else {
            query = assignedToPartner;
        }

        const rawOrders = await Order.find(query)
            .sort({ createdAt: -1 })
            .limit(100)
            .populate("seller", "shopName address")
            .populate("customer", "name phone")
            .lean();

        const historyItems = [];
        for (const order of rawOrders) {
            const isForward = String(order.deliveryBoy) === String(deliveryBoyId);
            const isReturn = String(order.returnDeliveryBoy) === String(deliveryBoyId) && order.returnStatus !== "none";

            if (isForward && (normalized === "all" || normalized === "delivered" || normalized === "cancelled")) {
                // Forward trip
                historyItems.push({
                    ...order,
                    _id: String(order._id) + "_forward",
                    historyJobType: "FORWARD",
                    displayEarnings: order.paymentBreakdown?.riderPayoutTotal || (order.pricing?.total ? order.pricing.total * 0.1 : 0),
                    displayStatus: order.workflowStatus === WORKFLOW_STATUS.DELIVERED || order.status === "delivered" ? "delivered" : 
                                   order.workflowStatus === WORKFLOW_STATUS.CANCELLED || order.status === "cancelled" ? "cancelled" : "active"
                });
            }
            if (isReturn && (normalized === "all" || normalized === "returns")) {
                // Return trip
                historyItems.push({
                    ...order,
                    _id: String(order._id) + "_return",
                    historyJobType: "RETURN",
                    displayEarnings: order.returnDeliveryCommission || 0,
                    displayStatus: order.returnStatus === "returned" || order.returnStatus === "qc_passed" || order.returnStatus === "qc_failed" || order.returnStatus === "refund_completed" ? "returned" : "active return"
                });
            }
        }

        return handleResponse(res, 200, "Delivery orders fetched", historyItems);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   REQUEST WITHDRAWAL (Delivery)
================================ */
export const requestWithdrawal = async (req, res) => {
    try {
        const deliveryBoyId = req.user.id;
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return handleResponse(res, 400, "Please enter a valid amount");
        }

        // 1. Calculate current available balance from Wallet
        const wallet = await Wallet.findOne({ ownerId: deliveryBoyId, ownerType: "DELIVERY_PARTNER" });
        if (!wallet) {
            return handleResponse(res, 404, "Wallet not found");
        }

        const availableBalance = wallet.availableBalance;

        if (amount > availableBalance) {
            return handleResponse(res, 400, `Insufficient balance. Available: ₹${availableBalance}`);
        }

        // 2. Create Withdrawal Transaction
        const withdrawal = await Transaction.create({
            user: deliveryBoyId,
            userModel: "Delivery",
            type: "Withdrawal",
            amount: -Math.abs(amount),
            status: "Pending",
            reference: `WDR-DL-${Date.now()}`
        });

        // 3. Update Wallet balances
        wallet.availableBalance -= Math.abs(amount);
        wallet.pendingBalance += Math.abs(amount);
        await wallet.save();

        return handleResponse(res, 201, "Withdrawal request submitted successfully", withdrawal);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   UPDATE LIVE LOCATION (Delivery)
================================ */
export const updateDeliveryLocation = async (req, res) => {
    try {
        const deliveryId = req.user.id;
        const { lat, lng, accuracy, heading, speed, orderId } = req.body || {};

        if (
            typeof lat !== "number" ||
            typeof lng !== "number" ||
            Number.isNaN(lat) ||
            Number.isNaN(lng)
        ) {
            return handleResponse(res, 400, "Valid numeric lat and lng are required");
        }

        const throttled = await throttleLocationUpdate(deliveryId, lat, lng);
        if (throttled) {
            return handleResponse(res, 200, "Location update throttled", {
                throttled: true,
            });
        }

        // Normalize to [lng, lat] as required by GeoJSON
        const coordinates = [Number(lng), Number(lat)];

        const delivery = await Delivery.findByIdAndUpdate(
            deliveryId,
            {
                $set: {
                    location: {
                        type: "Point",
                        coordinates,
                    },
                    lastLocationAt: new Date(),
                },
            },
            { new: true }
        ).select("_id location isOnline");

        if (!delivery) {
            return handleResponse(res, 404, "Delivery partner not found");
        }

        // SECURITY: when an orderId is supplied, the rider is telling us which
        // active delivery this ping belongs to. We MUST verify the assignment
        // synchronously before fanning out to Firebase — otherwise a rider can
        // pollute another order's live-tracking path (and the customer map
        // would render the wrong rider). The previous fire-and-forget check
        // ran *after* the Firebase write and never blocked anything.
        //
        // Rules:
        //   - orderId omitted          -> only the delivery-keyed RTDB entry is
        //                                 written (no per-order fanout). Trail
        //                                 is skipped. This preserves the
        //                                 "background heartbeat" code path.
        //   - orderId references a doc -> rider must equal order.deliveryBoy,
        //                                 otherwise 403/404 and no RTDB write.
        //   - canonical orderId        -> always read from Mongo, never from
        //                                 the request body, so the RTDB path
        //                                 cannot be spoofed via case-drift or
        //                                 alternate ids.
        let activeOrderId = null;
        if (orderId) {
            const orderMatch = orderMatchQueryFromRouteParam(orderId);
            if (!orderMatch) {
                return handleResponse(res, 400, "Invalid orderId");
            }

            const order = await Order.findOne(orderMatch)
                .select("orderId deliveryBoy")
                .lean();

            if (!order) {
                return handleResponse(res, 404, "Order not found");
            }

            const assignedRiderId = order.deliveryBoy
                ? String(order.deliveryBoy)
                : null;
            if (assignedRiderId !== String(deliveryId)) {
                return handleResponse(
                    res,
                    403,
                    "Order is not assigned to this delivery partner"
                );
            }

            activeOrderId = order.orderId;
        }

        const snapshot = {
            lat,
            lng,
            accuracy: typeof accuracy === "number" ? accuracy : undefined,
            heading: typeof heading === "number" ? heading : undefined,
            speed: typeof speed === "number" ? speed : undefined,
            lastUpdatedAt: new Date().toISOString(),
            deliveryId,
            orderId: activeOrderId,
        };

        // Fan out to Firebase and trail — fire-and-forget, never block the
        // response. Reaching this line guarantees activeOrderId (if set) is
        // the canonical id of an order this rider is actually assigned to.
        writeDeliveryLocation(deliveryId, activeOrderId, snapshot).catch(() => {});
        if (activeOrderId) {
            appendTrailPoint(activeOrderId, { lat, lng, t: Date.now() }).catch(() => {});
        }

        return handleResponse(res, 200, "Location updated successfully", {
            location: delivery.location,
            isOnline: delivery.isOnline
        });
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   INITIATE COD DEPOSIT VIA RAZORPAY
================================ */
export const initiateCodDeposit = async (req, res) => {
    try {
        const rawId = req.user?.id ?? req.user?._id;
        if (!rawId) {
            return handleResponse(res, 401, "Unauthorized");
        }
        
        const requestedRaw = req.body?.amount;
        const requestedAmount =
            requestedRaw == null || requestedRaw === ""
                ? null
                : roundCurrency(requestedRaw);

        if (requestedAmount == null || (!Number.isFinite(Number(requestedRaw)) || requestedAmount <= 0)) {
            return handleResponse(res, 400, "Enter a valid amount to deposit");
        }

        const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
        const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
      
        if (!keyId || !keySecret) {
            return handleResponse(res, 500, "Razorpay credentials not configured");
        }

        const razorpay = new Razorpay({
            key_id: keyId,
            key_secret: keySecret,
        });

        const order = await razorpay.orders.create({
            amount: Math.round(requestedAmount * 100), // Amount in paise, rounded to avoid float issues
            currency: 'INR',
            receipt: `cd_${String(rawId).slice(-6)}_${Date.now()}`
        });

        return handleResponse(res, 200, "Razorpay order created", {
            orderId: order.id,
            amount: requestedAmount,
            key: keyId
        });
    } catch (error) {
        console.error("[initiateCodDeposit] Razorpay error:", error);
        const errorMessage = error.error?.description || error.message || "Failed to initialize payment";
        return handleResponse(res, error.statusCode || 500, errorMessage);
    }
};

/* ===============================
   VERIFY COD DEPOSIT VIA RAZORPAY
================================ */
export const verifyCodDeposit = async (req, res) => {
    try {
        const rawId = req.user?.id ?? req.user?._id;
        if (!rawId) {
            return handleResponse(res, 401, "Unauthorized");
        }

        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
        
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !amount) {
            return handleResponse(res, 400, "Invalid payment details");
        }

        const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
        const generatedSignature = crypto
            .createHmac('sha256', keySecret)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            return handleResponse(res, 400, "Payment verification failed");
        }

        // Signature verified, now run the same logic as submitDeliveryCodCashToAdmin
        const deliveryBoyId = new mongoose.Types.ObjectId(String(rawId));
        const orders = await Order.find({
            deliveryBoy: deliveryBoyId,
            paymentMode: "COD",
            status: { $ne: "cancelled" },
            orderStatus: { $ne: "cancelled" },
            "financeFlags.codMarkedCollected": true,
            "paymentBreakdown.codPendingAmount": { $gt: 0 },
        })
            .select("orderId paymentBreakdown.codPendingAmount")
            .sort({ createdAt: 1 })
            .lean();

        if (!orders.length) {
            return handleResponse(
                res,
                400,
                "No collected COD cash is ready to submit. Payment will be recorded manually.",
            );
        }

        const amountToSubmit = roundCurrency(amount);
        let totalSubmitted = 0;
        let remaining = amountToSubmit;
        const settledOrders = [];

        for (const order of orders) {
            const pendingAmount = roundCurrency(order?.paymentBreakdown?.codPendingAmount || 0);
            if (pendingAmount <= 0 || remaining <= 0) continue;
            const settleAmount = roundCurrency(Math.min(pendingAmount, remaining));

            await reconcileCodCash(
                order._id,
                settleAmount,
                deliveryBoyId,
                {
                    actorId: req.user?.id || null,
                    metadata: {
                        source: "delivery_cod_cash_page",
                        initiatedBy: "delivery_partner",
                        razorpay_payment_id,
                        razorpay_order_id
                    },
                },
            );

            totalSubmitted = roundCurrency(totalSubmitted + settleAmount);
            remaining = roundCurrency(remaining - settleAmount);
            settledOrders.push({
                orderId: order.orderId,
                amount: settleAmount,
            });
        }

        if (totalSubmitted > 0) {
            await Transaction.create({
                user: deliveryBoyId,
                userModel: "Delivery",
                type: "Cash Settlement",
                amount: -Math.abs(totalSubmitted),
                status: "Settled",
                reference: `CSH-SET-${deliveryBoyId}-${Date.now()}`,
                meta: {
                    source: "delivery_cod_cash_page",
                    payment_method: "razorpay",
                    razorpay_payment_id,
                    razorpay_order_id,
                    orders: settledOrders.map((item) => item.orderId),
                },
            });
        }

        return handleResponse(res, 200, "COD Cash deposit successful", {
            totalSubmitted,
            settledOrders,
        });
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};
/*
 * DEPRECATED + REMOVED: Delivery-completion OTP generation/validation moved
 * to the canonical workflow service:
 *   POST /orders/workflow/:orderId/otp/request  -> requestHandoffOtpAtomic
 *   POST /orders/workflow/:orderId/otp/verify   -> verifyHandoffOtpAndDeliver
 *
 * The previous generateDeliveryOtp / validateDeliveryOtp controllers
 * and their /delivery/orders/:orderId/(generate|validate)-otp routes
 * were removed once the workflow state machine became the single source
 * of truth for delivery completion. All behaviors (Delivery.location
 * fallback, proximity check, Firebase tracking cleanup on success,
 * structured OTP error codes, otpValidatedAt + otpValidationLocation
 * persistence, delivery:otp:validated socket fan-out) now live in
 * app/services/orderWorkflowService.js.
 */