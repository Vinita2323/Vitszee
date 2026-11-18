import Order from "../models/order.js";
import Transaction from "../models/transaction.js";
import handleResponse from "../utils/helper.js";
import mongoose from "mongoose";
import Wallet from "../models/wallet.js";
import Seller from "../models/seller.js";
import { getSellerStats as getSellerStatsFromService } from "../services/seller/sellerStatsService.js";
import { roundCurrency } from "../utils/money.js";

/* ===============================
   GET SELLER DASHBOARD STATS
   Delegates to SellerStatsService (P6.2 — cache-fronted) so the heavy
   $facet aggregation + category pipeline are absorbed for ~60s.
================================ */
export const getSellerStats = async (req, res) => {
    try {
        const result = await getSellerStatsFromService(req.user.id, {
            range: req.query?.range,
        });
        return handleResponse(res, 200, "Stats fetched successfully", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   GET SELLER EARNINGS / TRANSACTIONS
================================ */
export const getSellerEarnings = async (req, res) => {
    try {
        const sellerId = req.user.id;
        const sellerOid = new mongoose.Types.ObjectId(sellerId);
        const seller = await Seller.findById(sellerId).select("bankDetails").lean();

        const transactions = await Transaction.find({ user: sellerId, userModel: 'Seller' })
            .sort({ createdAt: -1 })
            .populate("order", "orderId returnWindowExpiresAt items paymentBreakdown");

        const settledBalance = roundCurrency(transactions
            .filter(t => t.status === 'Settled')
            .reduce((acc, t) => acc + (t.amount || 0), 0));

        const pendingPayouts = roundCurrency(transactions
            .filter(t => t.type === 'Withdrawal' && (t.status === 'Pending' || t.status === 'Processing'))
            .reduce((acc, t) => acc + Math.abs(t.amount || 0), 0));

        // Fetch wallet for live pending balance (money on hold due to return window)
        const wallet = await Wallet.findOne({ ownerType: 'SELLER', ownerId: sellerId });
        const onHoldBalance = wallet ? wallet.pendingBalance : 0;
        const liveAvailableBalance = wallet ? wallet.availableBalance : settledBalance;

        // Keep "Total Revenue" aligned with actual wallet transactions (Order Payments + Refunds)
        const totalRevenue = roundCurrency(transactions
            .filter(t => (t.type === 'Order Payment' && t.status !== 'Cancelled') || (t.type === 'Refund' && t.status === 'Settled'))
            .reduce((acc, t) => acc + (t.amount || 0), 0));

        const totalWithdrawn = roundCurrency(transactions
            .filter(t => t.type === 'Withdrawal' && t.status === 'Settled')
            .reduce((acc, t) => acc + Math.abs(t.amount || 0), 0));

        // Monthly Revenue Aggregation (Last 6 Months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyAggregation = await Transaction.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(sellerId),
                    userModel: 'Seller',
                    type: { $in: ['Order Payment', 'Refund'] },
                    createdAt: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                    revenue: { $sum: "$amount" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const chartData = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const dateStr = d.toISOString().slice(0, 7);
            const data = monthlyAggregation.find(m => m._id === dateStr);
            chartData.push({
                name: monthNames[d.getMonth()],
                revenue: data ? data.revenue : 0
            });
        }

        return handleResponse(res, 200, "Earnings fetched successfully", {
            balances: {
                settledBalance: settledBalance,
                pendingPayouts: pendingPayouts,
                onHoldBalance: onHoldBalance, // New field
                availableBalance: liveAvailableBalance, // New field for clarity
                totalRevenue: totalRevenue,
                totalWithdrawn: totalWithdrawn
            },
            bankDetails: seller?.bankDetails || null,
            monthlyChart: chartData,
            ledger: transactions.map(t => ({
                id: (t.reference || t._id).toString(),
                type: t.type,
                amount: (t.type === 'Order Payment' && t.order?.paymentBreakdown?.sellerPayoutTotal != null) ? t.order.paymentBreakdown.sellerPayoutTotal : t.amount,
                status: t.status,
                date: t.createdAt.toISOString().split('T')[0],
                time: t.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                customer: t.type === 'Withdrawal' ? 'Bank Transfer' : 'Customer',
                ref: t.order ? `#${t.order.orderId}` : t.reference || t._id,
                releaseTime: (t.status === 'Pending' && t.order?.returnWindowExpiresAt) ? t.order.returnWindowExpiresAt : null,
                productSubtotal: t.order?.paymentBreakdown?.productSubtotal || 0,
                commission: t.order?.paymentBreakdown?.adminProductCommissionTotal || 0,
                items: (t.order?.items || []).map(i => ({
                    name: i.name || i.productName || 'Item',
                    image: i.image || '',
                    quantity: i.quantity || 1,
                    price: i.price || 0
                }))
            }))
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
