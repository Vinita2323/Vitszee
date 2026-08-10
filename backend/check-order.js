import mongoose from 'mongoose';
import Order from './app/models/order.js';

await mongoose.connect(process.env.MONGO_URI);
const o = await Order.findOne({orderId: 'ORD-01KY9DMQWQXA2ZEGJGM0ESEV01'}).lean();
if (o) {
  console.log(JSON.stringify({
    orderId: o.orderId,
    returnDeliveryCommission: o.returnDeliveryCommission, 
    returnStatus: o.returnStatus, 
    distanceSnapshot: o.distanceSnapshot,
    distanceKmActual: o.paymentBreakdown?.distanceKmActual,
  }, null, 2));
} else {
  console.log("No returns found");
}
process.exit(0);
