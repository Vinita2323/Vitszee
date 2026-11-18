import mongoose from 'mongoose';

async function run() {
    try {
        await mongoose.connect('mongodb://localhost:27017/dm-groceries');
        const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
        
        // Find orders with a coupon code
        const orders = await Order.find({ 'coupon.code': { $exists: true } }).lean();
        console.log('Orders with coupon:', orders.map(o => ({ 
            id: o._id, 
            customer: o.customer, 
            status: o.status, 
            coupon: o.coupon 
        })));
        
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
