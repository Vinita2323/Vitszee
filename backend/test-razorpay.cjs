require('dotenv').config({ path: './.env' });
const Razorpay = require('razorpay');

const client = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function test() {
  try {
    const all = await client.paymentLink.all({ reference_id: 'CHK-01KXN7R3QHKC83VDS6HHBD0QY3-A1' });
    console.log("With reference_id:", all.items.length);
  } catch (err) {
    console.error(err);
  }
}
test();

