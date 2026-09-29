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
import {
  getDelhiveryLocalSettings,
  updateDelhiveryLocalSettings,
  testLocalConnection,
  getLocalQuoteHandler,
  triggerLocalOrderCreation,
  confirmLocalOrderHandler,
  triggerLocalCancellation,
  syncLocalTracking,
  handleLocalWebhook,
} from "../controller/delhiveryLocalController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// ── Inbound scan push from Delhivery (authorised with the shared webhook secret) ──
router.post("/webhook", handleScanWebhook);

// ── Inbound Delhivery Local (intracity) fulfilment webhook ──
router.post("/local-webhook", handleLocalWebhook);

// ── Delhivery Local (intracity / quick delivery) — Admin / Seller ──
router.get("/local/config", verifyToken, allowRoles("admin"), getDelhiveryLocalSettings);
router.put("/local/config", verifyToken, allowRoles("admin"), updateDelhiveryLocalSettings);
router.post("/local/test-connection", verifyToken, allowRoles("admin"), testLocalConnection);
router.post("/local/quote", verifyToken, allowRoles("admin", "seller"), getLocalQuoteHandler);
router.post("/local/orders/:orderId/create", verifyToken, allowRoles("admin", "seller"), triggerLocalOrderCreation);
router.post("/local/orders/:orderId/confirm", verifyToken, allowRoles("admin"), confirmLocalOrderHandler);
router.post("/local/orders/:orderId/cancel", verifyToken, allowRoles("admin"), triggerLocalCancellation);
router.post("/local/orders/:orderId/sync", verifyToken, allowRoles("admin"), syncLocalTracking);

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
