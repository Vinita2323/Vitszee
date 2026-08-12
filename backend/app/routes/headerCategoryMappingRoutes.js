import express from "express";
import {
  getAllAdmin,
  getAllActive,
  create,
  update,
  remove,
  reorder
} from "../controller/headerCategoryMappingController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Admin routes (require auth and admin role)
router.get("/admin", verifyToken, allowRoles("admin"), getAllAdmin);
router.post("/admin", verifyToken, allowRoles("admin"), create);
router.put("/admin/:id", verifyToken, allowRoles("admin"), update);
router.delete("/admin/:id", verifyToken, allowRoles("admin"), remove);
router.post("/admin/reorder", verifyToken, allowRoles("admin"), reorder);

// Public/Customer routes
router.get("/", getAllActive);

export default router;
