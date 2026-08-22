import LowestPriceConfig from "../models/lowestPriceConfig.js";
import Product from "../models/product.js";
import handleResponse from "../utils/helper.js";
import {
  parseCustomerCoordinates,
  getNearbySellerIdsForCustomer,
} from "../services/customerVisibilityService.js";
import { getApprovedOrLegacyFilter } from "../services/productModerationService.js";
import { invalidate } from "../services/cacheService.js";

// Helper to ensure at least one config exists
const getOrCreateDefaultConfig = async () => {
  let config = await LowestPriceConfig.findOne();
  if (!config) {
    config = await LowestPriceConfig.create({
      title: "Lowest Price ever",
      subtitle: "Unbeatable Savings • Updated hourly",
      status: "active",
      mode: "curated",
      productIds: [],
      maxDisplayCount: 12,
      backgroundColor: "#E6F3E6",
      accentColor: "#1A4516",
    });
  }
  return config;
};

// Admin: Get Lowest Price Section Configuration
export const getAdminLowestPriceConfig = async (req, res) => {
  try {
    const config = await getOrCreateDefaultConfig();
    const populated = await LowestPriceConfig.findById(config._id).populate({
      path: "productIds",
      select: "name slug price salePrice mainImage image stock weight unit sellerId status approvalStatus categoryId",
      populate: [
        { path: "sellerId", select: "shopName name isVerified isActive" },
        { path: "categoryId", select: "name slug" },
      ],
    });

    return handleResponse(res, 200, "Lowest Price config fetched", populated);
  } catch (error) {
    console.error("Error fetching admin lowest price config:", error);
    return handleResponse(res, 500, error.message);
  }
};

// Admin: Update Lowest Price Section Configuration
export const updateAdminLowestPriceConfig = async (req, res) => {
  try {
    const config = await getOrCreateDefaultConfig();
    const payload = req.body || {};

    if (payload.title !== undefined) config.title = String(payload.title).trim();
    if (payload.subtitle !== undefined) config.subtitle = String(payload.subtitle).trim();
    if (payload.status !== undefined) config.status = payload.status;
    if (payload.mode !== undefined) config.mode = payload.mode;
    if (Array.isArray(payload.productIds)) config.productIds = payload.productIds.filter(Boolean);
    if (payload.maxDisplayCount !== undefined) {
      config.maxDisplayCount = Math.max(1, Math.min(50, Number(payload.maxDisplayCount) || 12));
    }
    if (payload.backgroundColor !== undefined) config.backgroundColor = payload.backgroundColor;
    if (payload.accentColor !== undefined) config.accentColor = payload.accentColor;

    await config.save();
    await invalidate("cache:lowestprice:*");

    const populated = await LowestPriceConfig.findById(config._id).populate({
      path: "productIds",
      select: "name slug price salePrice mainImage image stock weight unit sellerId status approvalStatus categoryId",
      populate: [
        { path: "sellerId", select: "shopName name isVerified isActive" },
        { path: "categoryId", select: "name slug" },
      ],
    });

    return handleResponse(res, 200, "Lowest Price config updated successfully", populated);
  } catch (error) {
    console.error("Error updating lowest price config:", error);
    return handleResponse(res, 400, error.message);
  }
};

// Customer / Public: Get Lowest Price Section Data
export const getPublicLowestPriceConfig = async (req, res) => {
  try {
    const config = await LowestPriceConfig.findOne({ status: "active" });
    if (!config) {
      return handleResponse(res, 200, "Lowest Price section inactive", {
        isActive: false,
        products: [],
      });
    }

    let products = [];
    const coords = parseCustomerCoordinates(req.query || {});
    let nearbySellerSet = null;

    if (coords.valid) {
      const nearbySellerIds = await getNearbySellerIdsForCustomer(coords.lat, coords.lng);
      nearbySellerSet = new Set(nearbySellerIds.map(String));
    }

    if (config.mode === "curated" && Array.isArray(config.productIds) && config.productIds.length > 0) {
      const populated = await LowestPriceConfig.findById(config._id)
        .populate({
          path: "productIds",
          select: "name slug price salePrice mainImage image stock weight unit sellerId status approvalStatus categoryId",
          match: {
            status: "active",
            ...getApprovedOrLegacyFilter(),
          },
          populate: { path: "sellerId", select: "shopName name isVerified isActive" },
        })
        .lean();

      let candidateProducts = (populated?.productIds || [])
        .filter(Boolean)
        .filter((p) => p.price && p.salePrice && p.price > p.salePrice);

      // Location filter if user coordinates provided
      if (nearbySellerSet) {
        candidateProducts = candidateProducts.filter((p) => {
          const sid = String(p.sellerId?._id || p.sellerId || "");
          return !sid || nearbySellerSet.has(sid);
        });
      }

      products = candidateProducts.map((p) => ({
        id: p._id,
        _id: p._id,
        name: p.name,
        slug: p.slug,
        image: p.mainImage || p.image || "",
        mainImage: p.mainImage || p.image || "",
        price: p.salePrice ?? p.price,
        salePrice: p.salePrice ?? p.price,
        originalPrice: p.price ?? p.salePrice,
        stock: p.stock ?? 0,
        weight: p.weight || "1 unit",
        unit: p.unit || "",
        deliveryTime: "8-15 mins",
        seller: p.sellerId ? { id: p.sellerId._id, shopName: p.sellerId.shopName } : null,
      }));
    } else {
      // Automatic mode or fallback: pick products with largest discount %
      const filter = {
        status: "active",
        ...getApprovedOrLegacyFilter(),
        $expr: { $gt: ["$price", "$salePrice"] },
      };

      if (nearbySellerSet) {
        filter.sellerId = { $in: Array.from(nearbySellerSet) };
      }

      const rawProducts = await Product.find(filter)
        .sort({ createdAt: -1 })
        .limit(config.maxDisplayCount || 12)
        .populate("sellerId", "shopName name")
        .lean();

      // Sort by percentage discount descending
      rawProducts.sort((a, b) => {
        const discA = a.price && a.salePrice ? (a.price - a.salePrice) / a.price : 0;
        const discB = b.price && b.salePrice ? (b.price - b.salePrice) / b.price : 0;
        return discB - discA;
      });

      products = rawProducts.map((p) => ({
        id: p._id,
        _id: p._id,
        name: p.name,
        slug: p.slug,
        image: p.mainImage || p.image || "",
        mainImage: p.mainImage || p.image || "",
        price: p.salePrice ?? p.price,
        salePrice: p.salePrice ?? p.price,
        originalPrice: p.price ?? p.salePrice,
        stock: p.stock ?? 0,
        weight: p.weight || "1 unit",
        unit: p.unit || "",
        deliveryTime: "8-15 mins",
        seller: p.sellerId ? { id: p.sellerId._id, shopName: p.sellerId.shopName } : null,
      }));
    }

    return handleResponse(res, 200, "Lowest Price section fetched", {
      isActive: config.status === "active",
      title: config.title,
      subtitle: config.subtitle,
      mode: config.mode,
      backgroundColor: config.backgroundColor,
      accentColor: config.accentColor,
      products,
    });
  } catch (error) {
    console.error("Error fetching public lowest price config:", error);
    return handleResponse(res, 500, error.message);
  }
};
