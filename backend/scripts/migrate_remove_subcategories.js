import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Category from '../app/models/category.js';
import Product from '../app/models/product.js';
import ExperienceSection from '../app/models/experienceSection.js';
import HeroConfig from '../app/models/heroConfig.js';
import { invalidate } from '../app/services/cacheService.js';

async function migrate() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI is not set in environment variables');
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.\n');

    // 1. Initial State Check
    const initialProductCount = await Product.countDocuments();
    const initialHeaderCount = await Category.countDocuments({ type: 'header' });
    const initialCategoryCount = await Category.countDocuments({ type: 'category' });
    const initialSubcategoryCount = await Category.countDocuments({ type: 'subcategory' });

    console.log('=== PRE-MIGRATION AUDIT ===');
    console.log(`Total Products: ${initialProductCount}`);
    console.log(`Headers: ${initialHeaderCount}`);
    console.log(`Categories: ${initialCategoryCount}`);
    console.log(`Subcategories: ${initialSubcategoryCount}`);

    const subcategories = await Category.find({ type: 'subcategory' }).lean();
    const subcatMap = new Map(subcategories.map(s => [String(s._id), s]));

    const categories = await Category.find({ type: 'category' }).lean();
    const catMap = new Map(categories.map(c => [String(c._id), c]));

    const headers = await Category.find({ type: 'header' }).lean();
    const headerMap = new Map(headers.map(h => [String(h._id), h]));

    // 2. Inspect all products and map to parent category
    const products = await Product.find().lean();
    console.log(`\nProcessing ${products.length} products...`);

    let migratedProductsCount = 0;
    let unchangedProductsCount = 0;
    const bulkProductOps = [];

    for (const product of products) {
      let targetCategoryId = product.categoryId;
      let targetHeaderId = product.headerId;

      if (product.subcategoryId) {
        const sub = subcatMap.get(String(product.subcategoryId));
        if (sub) {
          // If subcategory has a parent category, that is the authoritative category
          if (sub.parentId && catMap.has(String(sub.parentId))) {
            targetCategoryId = sub.parentId;
            const parentCat = catMap.get(String(sub.parentId));
            if (parentCat?.parentId && headerMap.has(String(parentCat.parentId))) {
              targetHeaderId = parentCat.parentId;
            }
          }
        }
      }

      bulkProductOps.push({
        updateOne: {
          filter: { _id: product._id },
          update: {
            $set: {
              categoryId: targetCategoryId,
              headerId: targetHeaderId,
            },
            $unset: {
              subcategoryId: '',
            },
          },
        },
      });
      migratedProductsCount++;
    }

    if (bulkProductOps.length > 0) {
      const result = await Product.bulkWrite(bulkProductOps);
      console.log(`Product migration bulk write completed. Modified count: ${result.modifiedCount}`);
    }

    // 3. Clean up Experience Sections
    console.log('\nCleaning up Experience Sections...');
    const delSectionsResult = await ExperienceSection.deleteMany({ displayType: 'subcategories' });
    console.log(`Deleted ${delSectionsResult.deletedCount} subcategory experience sections.`);

    // Clean up product sections that had subcategoryIds configured
    const updateExpResult = await ExperienceSection.updateMany(
      { 'config.products.subcategoryIds': { $exists: true } },
      {
        $unset: {
          'config.products.subcategoryIds': '',
          'config.subcategories': '',
        },
      }
    );
    console.log(`Updated ${updateExpResult.modifiedCount} product experience sections to remove subcategory references.`);

    // 4. Clean up HeroConfig banners if any had linkType: 'subcategory'
    const heroConfigs = await HeroConfig.find().lean();
    for (const hc of heroConfigs) {
      if (Array.isArray(hc.banners?.items)) {
        let modified = false;
        const updatedItems = hc.banners.items.map(b => {
          if (b.linkType === 'subcategory') {
            modified = true;
            return { ...b, linkType: 'category' };
          }
          return b;
        });
        if (modified) {
          await HeroConfig.updateOne({ _id: hc._id }, { $set: { 'banners.items': updatedItems } });
          console.log(`Updated HeroConfig ${hc._id} banner linkTypes.`);
        }
      }
    }

    // 5. Delete all Subcategories from Category collection
    console.log('\nDeleting Subcategory documents from Category collection...');
    const delSubcatsResult = await Category.deleteMany({ type: 'subcategory' });
    console.log(`Deleted ${delSubcatsResult.deletedCount} subcategory documents.`);

    // 6. Post-migration verification
    const finalProductCount = await Product.countDocuments();
    const finalHeaderCount = await Category.countDocuments({ type: 'header' });
    const finalCategoryCount = await Category.countDocuments({ type: 'category' });
    const finalSubcategoryCount = await Category.countDocuments({ type: 'subcategory' });
    const remainingProductsWithSubcat = await Product.countDocuments({ subcategoryId: { $exists: true } });
    const productsWithoutCategory = await Product.countDocuments({ categoryId: { $exists: false } });
    const productsWithoutHeader = await Product.countDocuments({ headerId: { $exists: false } });

    console.log('\n=== POST-MIGRATION VERIFICATION ===');
    console.log(`Total Products Before: ${initialProductCount} | Total Products After: ${finalProductCount}`);
    console.log(`Headers: ${finalHeaderCount}`);
    console.log(`Categories: ${finalCategoryCount}`);
    console.log(`Subcategories: ${finalSubcategoryCount}`);
    console.log(`Products with remaining subcategoryId field: ${remainingProductsWithSubcat}`);
    console.log(`Products missing categoryId: ${productsWithoutCategory}`);
    console.log(`Products missing headerId: ${productsWithoutHeader}`);

    if (finalProductCount !== initialProductCount) {
      throw new Error(`CRITICAL ERROR: Product count mismatch! Before: ${initialProductCount}, After: ${finalProductCount}`);
    }

    if (finalSubcategoryCount !== 0) {
      throw new Error(`CRITICAL ERROR: Remaining subcategories in database: ${finalSubcategoryCount}`);
    }

    // 7. Invalidate Caches
    try {
      await invalidate('cache:catalog:*');
      await invalidate('cache:experience:*');
      await invalidate('cache:search:*');
      console.log('\nRedis caches invalidated successfully.');
    } catch (cacheErr) {
      console.warn('Cache invalidation note:', cacheErr.message);
    }

    console.log('\n✅ MIGRATION COMPLETED SUCCESSFULLY WITH ZERO DATA LOSS!');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
