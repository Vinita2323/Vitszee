import mongoose from 'mongoose';
import Order from './app/models/order.js';
import Setting from './app/models/setting.js';
import { calculateRiderPayout } from './app/services/finance/pricingService.js';

await mongoose.connect(process.env.MONGO_URI);

try {
  // Find a return requested order or simulate one
  const order = await Order.findOne({returnStatus: 'return_requested'}).lean();
  if (order) {
    let distanceKm = order.distanceSnapshot?.distanceKmActual || order.paymentBreakdown?.distanceKmActual || 0;
    const settings = await Setting.findOne({}).lean();
    const riderPayout = calculateRiderPayout(distanceKm, settings || {});
    const returnCommission = riderPayout.riderPayoutTotal || 0;
    console.log({ distanceKm, riderPayout, returnCommission, settings: { riderBasePayout: settings.riderBasePayout } });
  } else {
    // simulate
    const settings = await Setting.findOne({}).lean();
    const riderPayout = calculateRiderPayout(10.5, settings || {});
    console.log("No pending return. Simulated:", { riderPayout, settings: { riderBasePayout: settings.riderBasePayout } });
  }
} catch (e) {
  console.log("Error:", e.message);
}
process.exit(0);
