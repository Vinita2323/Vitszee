require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Order = mongoose.connection.db.collection('orders');
  const Wallet = mongoose.connection.db.collection('wallets');

  const orders = await Order.find({ paymentMode: 'COD', 'paymentBreakdown.codRemittedAmount': { $in: [0, null] } }).toArray();

  for (const o of orders) {
    const gross = o.paymentBreakdown?.grandTotal || o.pricing?.total || 0;
    const currentPending = o.paymentBreakdown?.codPendingAmount || 0;
    
    if (gross > currentPending) {
      const diff = gross - currentPending;
      await Order.updateOne({ _id: o._id }, { 
        $set: { 
          'paymentBreakdown.codPendingAmount': gross, 
          'paymentBreakdown.codCollectedAmount': gross 
        } 
      });

      if (o.deliveryBoy) {
        await Wallet.updateOne(
          { ownerType: 'DELIVERY_PARTNER', ownerId: o.deliveryBoy },
          { $inc: { cashInHand: diff } }
        );
      }
    }
  }
  console.log('Done patching.');
  process.exit(0);
}).catch(console.error);
