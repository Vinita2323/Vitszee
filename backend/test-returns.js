import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Order = mongoose.model('Order', new mongoose.Schema({}, {strict: false}), 'orders');
  const orders = await Order.find({ 
    returnStatus: { $exists: true, $ne: 'none', $ne: null }
  }).sort({ createdAt: -1 }).limit(3).lean();
  console.log(JSON.stringify(orders.map(o => ({ 
    orderId: o.orderId, 
    returnStatus: o.returnStatus, 
    returnDeliveryBoy: o.returnDeliveryBoy, 
    returnSearchExpiresAt: o.returnSearchExpiresAt,
    skippedBy: o.skippedBy 
  })), null, 2));
  process.exit(0);
}

main();
