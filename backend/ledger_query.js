import('mongoose').then(async (mongoose) => {
  const dotenv = await import('dotenv');
  dotenv.config();
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/noyo-kart');
  const LedgerEntry = (await import('./app/models/ledgerEntry.js')).default;
  const entries = await LedgerEntry.aggregate([
    { $match: { ownerType: 'PLATFORM_WALLET' } },
    { $group: { _id: '$type', totalCredit: { $sum: { $cond: [{ $eq: ['$direction', 'CREDIT'] }, '$amount', 0] } }, totalDebit: { $sum: { $cond: [{ $eq: ['$direction', 'DEBIT'] }, '$amount', 0] } } } }
  ]);
  console.log(JSON.stringify(entries, null, 2));
  process.exit(0);
});
