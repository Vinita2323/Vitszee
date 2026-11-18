import('mongoose').then(async (mongoose) => {
  const dotenv = await import('dotenv');
  dotenv.config();
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/noyo-kart');
  const Transaction = (await import('./app/models/transaction.js')).default;
  const txs = await Transaction.find({ reference: /REF-SELL-ORD-01KYH4JD501R92QXG54Y5KJD5J/ });
  console.log(JSON.stringify(txs, null, 2));
  process.exit(0);
}).catch(console.error);
