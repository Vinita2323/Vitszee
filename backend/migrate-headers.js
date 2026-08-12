import mongoose from "mongoose";
import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

import Category from "./app/models/category.js";
import HeaderCategoryMapping from "./app/models/headerCategoryMapping.js";

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    const headers = await Category.find({ type: "header", status: "active" });
    console.log(`Found ${headers.length} active header categories.`);

    let count = 0;
    for (const [index, cat] of headers.entries()) {
      if (cat.slug === "all" || cat.name.toLowerCase() === "all") continue;
      
      const existing = await HeaderCategoryMapping.findOne({ categoryId: cat._id });
      if (!existing) {
        await HeaderCategoryMapping.create({
          categoryId: cat._id,
          isActive: true,
          displayOrder: index,
        });
        count++;
      }
    }

    console.log(`Successfully migrated ${count} categories to the new mapping system.`);
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

run();
