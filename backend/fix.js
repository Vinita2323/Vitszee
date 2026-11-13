import('mongoose').then(async (mongoose) => {
  const dotenv = await import('dotenv');
  dotenv.config();
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/noyo-kart');
  const Transaction = (await import('./app/models/transaction.js')).default;
  const Order = (await import('./app/models/order.js')).default;
  const order = await Order.findOne({ orderId: 'ORD-01KYH4JD501R92QXG54Y5KJD5J' });
  if (order) {
    const updated = await Transaction.updateMany(
      { order: order._id, userModel: 'Seller', type: 'Order Payment', status: 'Pending' },
      { $set: { status: 'Cancelled' } }
    );
    console.log('Fixed:', updated);
  }
  process.exit(0);
}).catch(console.error);
