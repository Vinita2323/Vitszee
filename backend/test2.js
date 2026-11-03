import('mongoose').then(async (mongoose) => {
  const dotenv = await import('dotenv');
  dotenv.config();
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/noyo-kart');
  const Order = (await import('./app/models/order.js')).default;
  const order = await Order.findOne({ orderId: 'ORD-01KYH4JD501R92QXG54Y5KJD5J' });
  console.log('Seller:', order?.seller);
  if (order) {
    const orders = await Order.find({ seller: order.seller }).select('orderId status returnStatus paymentBreakdown returnRefundAmount returnDeliveryCommission');
    console.log(JSON.stringify(orders, null, 2));
    
    const [orderRevenueAgg] = await Order.aggregate([
        {
            $match: {
                seller: order.seller,
                status: { $ne: 'cancelled' },
            },
        },
        {
            $group: {
                _id: null,
                baseRevenue: { $sum: { $ifNull: ['$paymentBreakdown.sellerPayoutTotal', 0] } },
                refunds: {
                    $sum: {
                        $cond: [
                            { $eq: ['$returnStatus', 'refund_completed'] },
                            { $add: [
                                { $ifNull: ['$returnRefundAmount', 0] },
                                { $ifNull: ['$returnDeliveryCommission', 0] }
                            ]},
                            0
                        ]
                    }
                }
            },
        },
        {
            $project: {
                totalRevenue: { $subtract: ['$baseRevenue', '$refunds'] },
                baseRevenue: 1,
                refunds: 1
            }
        }
    ]);
    console.log('Agg:', orderRevenueAgg);
  }
  process.exit(0);
}).catch(console.error);
