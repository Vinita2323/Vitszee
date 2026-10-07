import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import http from 'http';

async function main() {
  await mongoose.connect('mongodb://localhost:27017/TrueBuy');
  const Delivery = mongoose.model('Delivery', new mongoose.Schema({}, {strict: false}), 'deliveries');
  const delivery = await Delivery.findOne({ status: 'approved' });
  
  if (!delivery) {
    console.log("No delivery partner found");
    process.exit(1);
  }

  const token = jwt.sign({ id: delivery._id, role: 'delivery' }, process.env.JWT_SECRET || 'Truebuy@123', { expiresIn: '1d' });

  const req = http.request('http://localhost:7000/api/delivery/orders/available?type=all', {
    headers: { 'Authorization': `Bearer ${token}` }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
      process.exit(0);
    });
  });
  req.on('error', e => console.error(e));
  req.end();
}

main();
