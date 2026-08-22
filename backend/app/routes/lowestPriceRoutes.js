import express from "express";
import {
  getAdminLowestPriceConfig,
  updateAdminLowestPriceConfig,
  getPublicLowestPriceConfig,
} from "../controller/lowestPriceController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public customer endpoint
router.get("/lowest-price", getPublicLowestPriceConfig);

// Admin endpoints
router.get(
  "/admin-lowest-price",
  verifyToken,
  allowRoles("admin"),
  getAdminLowestPriceConfig
);

router.put(
  "/admin-lowest-price",
  verifyToken,
  allowRoles("admin"),
  updateAdminLowestPriceConfig
);

export default router;
