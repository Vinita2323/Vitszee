require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');
const { bulkProcessPayouts } = require('./app/services/finance/payoutService.js');

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');
    const result = await bulkProcessPayouts({ remarks: 'Manual trigger from CLI' });
    console.log('Processed payouts:', result);
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.disconnect();
  }
}
run();
