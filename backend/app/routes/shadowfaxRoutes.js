import express from "express";
import {
  getShadowfaxSettings,
  updateShadowfaxSettings,
  testShadowfaxConnection,
  getAdminShipments,
  getShipmentByOrderId,
  triggerForwardOrderCreation,
  triggerDispatchReady,
  triggerOrderCancellation,
  trackShipmentUnified,
  handleForwardWebhook,
  handleReverseWebhook,
} from "../controller/shadowfaxController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// ── Inbound Webhooks (No auth headers required by Shadowfax callback servers) ──
router.post("/webhook/forward", handleForwardWebhook);
router.post("/webhook/reverse", handleReverseWebhook);

// ── Unified Tracking (Customer, Seller, Admin) ──
router.get("/track/:identifier", verifyToken, trackShipmentUnified);

// ── Admin Protected Routes ──
router.get("/config", verifyToken, allowRoles("admin"), getShadowfaxSettings);
router.put("/config", verifyToken, allowRoles("admin"), updateShadowfaxSettings);
router.post("/test-connection", verifyToken, allowRoles("admin"), testShadowfaxConnection);
router.get("/shipments", verifyToken, allowRoles("admin"), getAdminShipments);
router.get("/shipments/:orderId", verifyToken, allowRoles("admin"), getShipmentByOrderId);
router.post("/shipments/:orderId/create-forward", verifyToken, allowRoles("admin", "seller"), triggerForwardOrderCreation);
router.post("/shipments/:orderId/dispatch-ready", verifyToken, allowRoles("admin", "seller"), triggerDispatchReady);
router.post("/shipments/:orderId/cancel", verifyToken, allowRoles("admin"), triggerOrderCancellation);

export default router;
