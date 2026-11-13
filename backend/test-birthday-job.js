import mongoose from "mongoose";
import dotenv from "dotenv";
import { getBirthdayRewardJobHandler } from "./app/jobs/birthdayRewardJob.js";

dotenv.config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");
        const handler = getBirthdayRewardJobHandler();
        await handler();
        console.log("Job executed successfully.");
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
};

run();
