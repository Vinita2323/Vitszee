import express from "express";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import {
    getCampaigns,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    getAnalytics
} from "../controller/admin/milestoneCampaignController.js";

const router = express.Router();

router.use(verifyToken, allowRoles("admin"));

router.get("/analytics", getAnalytics);
router.route("/").get(getCampaigns).post(createCampaign);
router.route("/:id").put(updateCampaign).delete(deleteCampaign);

export default router;
