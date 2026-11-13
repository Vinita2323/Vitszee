import express from "express";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import { getMyMilestoneProgress } from "../controller/customer/customerMilestoneController.js";

const router = express.Router();

router.use(verifyToken, allowRoles("customer"));

router.get("/progress", getMyMilestoneProgress);

export default router;
