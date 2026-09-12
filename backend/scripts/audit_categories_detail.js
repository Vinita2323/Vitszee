import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Category from '../app/models/category.js';
import Product from '../app/models/product.js';
import ExperienceSection from '../app/models/experienceSection.js';
import HeroConfig from '../app/models/heroConfig.js';

async function audit() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    const headers = await Category.find({ type: 'header' }).lean();
    const categories = await Category.find({ type: 'category' }).lean();
    const subcategories = await Category.find({ type: 'subcategory' }).lean();

    console.log('=== CATEGORY BREAKDOWN ===');
    console.log(`Headers count: ${headers.length}`);
    console.log(`Level 2 Categories count: ${categories.length}`);
    console.log(`Subcategories count: ${subcategories.length}`);
    console.log(`Total categories doc count: ${headers.length + categories.length + subcategories.length}`);

    const totalProducts = await Product.countDocuments();
    console.log(`\n=== PRODUCT STATS ===`);
    console.log(`Total Products: ${totalProducts}`);

    const products = await Product.find().lean();
    let hasSubcatFieldCount = 0;
    let nullSubcatFieldCount = 0;
    let missingSubcatFieldCount = 0;
    let validSubcatLinkedCount = 0;
    let orphanedSubcatLinkedCount = 0;

    const subcatMap = new Map(subcategories.map(s => [String(s._id), s]));
    const catMap = new Map(categories.map(c => [String(c._id), c]));
    const headerMap = new Map(headers.map(h => [String(h._id), h]));

    const subcatProductCounts = {};
    for (const sub of subcategories) {
      subcatProductCounts[String(sub._id)] = {
        name: sub.name,
        parentId: sub.parentId,
        parentName: catMap.get(String(sub.parentId))?.name || 'NO_PARENT_FOUND',
        productCount: 0,
      };
    }

    let productsNeedingCategoryReassignment = 0;
    let productsAlreadyHavingCorrectCategory = 0;

    for (const p of products) {
      if (p.subcategoryId === null) {
        nullSubcatFieldCount++;
      } else if (p.subcategoryId === undefined) {
        missingSubcatFieldCount++;
      } else {
        hasSubcatFieldCount++;
        const subIdStr = String(p.subcategoryId);
        const sub = subcatMap.get(subIdStr);
        if (sub) {
          validSubcatLinkedCount++;
          if (subcatProductCounts[subIdStr]) {
            subcatProductCounts[subIdStr].productCount++;
          }
          const parentCat = catMap.get(String(sub.parentId));
          if (parentCat) {
            if (String(p.categoryId) === String(parentCat._id)) {
              productsAlreadyHavingCorrectCategory++;
            } else {
              productsNeedingCategoryReassignment++;
              console.log(`Product "${p.name}" (ID: ${p._id}) has categoryId ${p.categoryId} (${catMap.get(String(p.categoryId))?.name}) but subcategory parent is ${parentCat._id} (${parentCat.name})`);
            }
          } else {
            console.log(`WARNING: Subcategory "${sub.name}" (ID: ${sub._id}) parentId ${sub.parentId} does not exist in categories!`);
          }
        } else {
          orphanedSubcatLinkedCount++;
          console.log(`Product "${p.name}" (ID: ${p._id}) has subcategoryId ${p.subcategoryId} which is NOT in subcategories!`);
        }
      }
    }

    console.log(`Products with non-null subcategoryId: ${hasSubcatFieldCount}`);
    console.log(`Products with null subcategoryId: ${nullSubcatFieldCount}`);
    console.log(`Products without subcategoryId field: ${missingSubcatFieldCount}`);
    console.log(`Products linked to valid subcategories: ${validSubcatLinkedCount}`);
    console.log(`Products linked to orphaned subcategories: ${orphanedSubcatLinkedCount}`);
    console.log(`Products where prod.categoryId == sub.parentId: ${productsAlreadyHavingCorrectCategory}`);
    console.log(`Products where prod.categoryId != sub.parentId: ${productsNeedingCategoryReassignment}`);

    console.log('\n=== SUBCATEGORY USAGE DETAILS ===');
    for (const [subId, info] of Object.entries(subcatProductCounts)) {
      if (info.productCount > 0) {
        console.log(`Subcategory "${info.name}" (${subId}) -> Parent Category "${info.parentName}" (${info.parentId}) : ${info.productCount} products`);
      }
    }

    console.log('\n=== EXPERIENCE SECTIONS AUDIT ===');
    const allSections = await ExperienceSection.find().lean();
    console.log(`Total experience sections: ${allSections.length}`);
    for (const s of allSections) {
      console.log(`- Section ID: ${s._id} | Title: "${s.title}" | displayType: ${s.displayType} | pageType: ${s.pageType}`);
      if (s.displayType === 'subcategories') {
        console.log(`  -> Config:`, JSON.stringify(s.config?.subcategories));
      }
      if (s.displayType === 'products') {
        console.log(`  -> Subcategory filter in products config:`, s.config?.products?.subcategoryIds);
      }
    }

    console.log('\n=== HERO CONFIGS AUDIT ===');
    const heroConfigs = await HeroConfig.find().lean();
    console.log(`Total hero configs: ${heroConfigs.length}`);
    for (const hc of heroConfigs) {
      const bannerLinkTypes = hc.banners?.items?.map(b => b.linkType) || [];
      console.log(`- HeroConfig ID: ${hc._id} | pageType: ${hc.pageType} | Banner linkTypes:`, bannerLinkTypes);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

audit();
