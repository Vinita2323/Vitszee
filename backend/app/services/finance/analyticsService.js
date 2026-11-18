import Order from "../../models/order.js";
import Seller from "../../models/seller.js";
import { ORDER_PAYMENT_STATUS } from "../../constants/finance.js";
import { roundCurrency } from "../../utils/money.js";

export async function getProfitAnalytics(timeRange = '7d') {
    // Parse time range
    let days = 7;
    if (timeRange === '30d') days = 30;
    else if (timeRange === '90d') days = 90;
    else if (timeRange === '24h') days = 1;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // 1. Sales Trend Data (Grouped by Date)
    const salesAggregation = await Order.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate },
                status: { $ne: "cancelled" },
                orderStatus: { $ne: "cancelled" }
            }
        },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                revenue: { $sum: { $ifNull: ["$paymentBreakdown.grandTotal", "$pricing.total"] } },
                orders: { $sum: 1 }
            }
        },
        { $sort: { "_id": 1 } }
    ]);

    // Format sales data for the chart (Mon, Tue, etc.)
    const formattedSalesData = salesAggregation.map(item => {
        const d = new Date(item._id);
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return {
            name: days === 1 ? item._id.split("-").pop() : dayNames[d.getDay()], // E.g., Date number for 24h, else short Day
            date: item._id,
            revenue: roundCurrency(item.revenue || 0),
            orders: item.orders || 0
        };
    });

    // 2. Category / Top Sellers Data
    const categoryAggregation = await Order.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate },
                status: { $ne: "cancelled" },
                orderStatus: { $ne: "cancelled" }
            }
        },
        { $unwind: "$items" },
        {
            $lookup: {
                from: "products",
                localField: "items.product",
                foreignField: "_id",
                as: "productDetails"
            }
        },
        { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: "categories",
                localField: "productDetails.category",
                foreignField: "_id",
                as: "categoryDetails"
            }
        },
        { $unwind: { path: "$categoryDetails", preserveNullAndEmptyArrays: true } },
        {
            $group: {
                _id: { $ifNull: ["$categoryDetails.name", "Uncategorized"] },
                revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
            }
        },
        { $sort: { revenue: -1 } },
        { $limit: 4 }
    ]);

    const colors = ['#6366f1', '#f59e0b', '#10b981', '#f43f5e'];
    let totalCatRevenue = categoryAggregation.reduce((acc, c) => acc + c.revenue, 0);
    const categoryData = categoryAggregation.map((cat, i) => ({
        name: cat._id,
        value: totalCatRevenue > 0 ? Math.round((cat.revenue / totalCatRevenue) * 100) : 0,
        color: colors[i % colors.length]
    }));

    // 3. Top Stats
    const statsAggr = await Order.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate },
                status: { $ne: "cancelled" },
                orderStatus: { $ne: "cancelled" }
            }
        },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: { $ifNull: ["$paymentBreakdown.grandTotal", "$pricing.total"] } },
                totalOrders: { $sum: 1 }
            }
        }
    ]);

    const activeSellersCount = await Seller.countDocuments({ status: "active" });

    const totalRevenue = roundCurrency(statsAggr[0]?.totalRevenue || 0);
    const totalOrders = statsAggr[0]?.totalOrders || 0;
    const avgOrderValue = totalOrders > 0 ? roundCurrency(totalRevenue / totalOrders) : 0;

    return {
        salesData: formattedSalesData,
        categoryData,
        stats: {
            totalRevenue,
            totalOrders,
            activeSellers: activeSellersCount,
            avgOrderValue
        },
        hourlyHeatmap: [
            { hour: '08:00', load: 30 },
            { hour: '12:00', load: 85 },
            { hour: '16:00', load: 55 },
            { hour: '20:00', load: 75 }
        ]
    };
}
