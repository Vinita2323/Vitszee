import "dotenv/config";
import { invalidate } from "./app/services/cacheService.js";

async function clear() {
  try {
    await invalidate("cache:catalog:categories:*");
    console.log("Category Cache Cleared");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
clear();
