import mongoose from 'mongoose';
import { returnPickupBroadcastPayloadFromOrder } from './app/services/orderWorkflowService.js';

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Order = mongoose.model('Order', new mongoose.Schema({}, {strict: false}), 'orders');
  const order = await Order.findOne({ orderId: 'ORD-01KYBVRJ3SW8BDF80CZNDB5E8R' }).lean();
  
  if (order) {
    try {
      const payload = returnPickupBroadcastPayloadFromOrder(order, { radiusMeters: 15000 });
      console.log(JSON.stringify(payload, null, 2));
    } catch (e) {
      console.error("Error generating payload:", e);
    }
  }
  process.exit(0);
}

main();
