
import('mongoose').then(async (mongoose) => {
  await mongoose.connect(process.env.MONGO_URI);
  const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
  const Payout = mongoose.model('Payout', new mongoose.Schema({}, { strict: false }));
  const orders = await Order.find({'settlementStatus.sellerPayout': 'HOLD'}).select('orderId deliveredAt returnWindowExpiresAt status returnStatus').lean();
  console.log('Orders still on HOLD in DB:', orders.length);
  const payouts = await Payout.find({ status: { $in: ['PENDING', 'PROCESSING'] }, payoutType: 'SELLER' }).select('_id amount status relatedOrderIds').lean();
  console.log('Pending Payouts:', payouts.length);
  process.exit(0);
}).catch(console.error);

