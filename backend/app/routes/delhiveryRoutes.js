import express from "express";
import {
  getDelhiverySettings,
  updateDelhiverySettings,
  testDelhiveryConnection,
  getAdminShipments,
  getShipmentByOrderId,
  triggerForwardOrderCreation,
  triggerOrderCancellation,
  syncShipmentTracking,
  triggerPickupRequest,
  registerSellerPickupLocation,
  trackShipmentUnified,
  handleScanWebhook,
} from "../controller/delhiveryController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// ── Inbound scan push from Delhivery (authorised with the shared webhook secret) ──
router.post("/webhook", handleScanWebhook);

// ── Unified Tracking (Customer, Seller, Admin) ──
router.get("/track/:identifier", verifyToken, trackShipmentUnified);

// ── Admin / Seller ──
router.get("/config", verifyToken, allowRoles("admin"), getDelhiverySettings);
router.put("/config", verifyToken, allowRoles("admin"), updateDelhiverySettings);
router.post("/test-connection", verifyToken, allowRoles("admin"), testDelhiveryConnection);
router.get("/shipments", verifyToken, allowRoles("admin"), getAdminShipments);
router.get("/shipments/:orderId", verifyToken, allowRoles("admin"), getShipmentByOrderId);
router.post("/shipments/:orderId/create-forward", verifyToken, allowRoles("admin", "seller"), triggerForwardOrderCreation);
router.post("/shipments/:orderId/cancel", verifyToken, allowRoles("admin"), triggerOrderCancellation);
router.post("/shipments/:orderId/sync", verifyToken, allowRoles("admin"), syncShipmentTracking);
router.post("/pickup-request", verifyToken, allowRoles("admin"), triggerPickupRequest);
router.post("/sellers/:sellerId/register-pickup", verifyToken, allowRoles("admin"), registerSellerPickupLocation);

export default router;
