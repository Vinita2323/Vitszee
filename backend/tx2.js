import('mongoose').then(async (mongoose) => {
  const dotenv = await import('dotenv');
  dotenv.config();
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/noyo-kart');
  const Transaction = (await import('./app/models/transaction.js')).default;
  const txs = await Transaction.find({ user: '6999782fd49e8099e8a7b11c', order: '6a66fc365d5b7c96427c34a4' });
  console.log(JSON.stringify(txs, null, 2));
  process.exit(0);
}).catch(console.error);
