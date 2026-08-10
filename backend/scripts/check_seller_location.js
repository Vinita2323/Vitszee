import connectDB from '../app/dbConfig/dbConfig.js';
import mongoose from 'mongoose';

async function checkSellerLocation() {
    try {
        await connectDB();
        const db = mongoose.connection.db;
        const sellers = await db.collection('sellers').find({}).toArray();
        console.log(`Found ${sellers.length} sellers:`);
        sellers.forEach(s => {
            console.log({
                _id: s._id,
                storeName: s.storeName || s.name,
                address: s.address,
                location: s.location,
                coordinates: s.location?.coordinates
            });
        });
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

checkSellerLocation();
