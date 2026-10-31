import express from "express";
import multer from "multer";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import {
  captainStartShift,
  captainEndShift,
  captainOverview,
  captainCurrentSummary,
  captainSubmitDeposit,
  adminDashboard,
  adminListSettlements,
  adminSettlementDetail,
  adminListDeposits,
  adminApproveDeposit,
  adminRejectDeposit,
  adminRecordDiscrepancy,
  adminResolveDiscrepancy,
  adminCreateAdjustment,
  adminGrantOverride,
  adminExportCsv,
} from "../controller/cashSettlementController.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

/* ──────────────────────── Captain / Delivery Routes ──────────────────────── */

// Start a new shift
router.post(
  "/shifts/start",
  verifyToken,
  allowRoles("delivery"),
  captainStartShift,
);

// End current active shift
router.post(
  "/shifts/end",
  verifyToken,
  allowRoles("delivery"),
  captainEndShift,
);

// Full overview of shifts, cash held, limits and recent deposits
router.get(
  "/overview",
  verifyToken,
  allowRoles("delivery"),
  captainOverview,
);

// Current active shift summary (collections, limits, cash position)
router.get(
  "/shifts/current",
  verifyToken,
  allowRoles("delivery"),
  captainCurrentSummary,
);

// Submit cash deposit proof (bank transfer / UPI / physical cash)
router.post(
  "/deposits",
  verifyToken,
  allowRoles("delivery"),
  upload.single("proof"),
  captainSubmitDeposit,
);

/* ──────────────────────── Admin Operations Routes ──────────────────────── */

// High-level cash settlement dashboard metrics
router.get(
  "/admin/dashboard",
  verifyToken,
  allowRoles("admin"),
  adminDashboard,
);

// List settlements with filtering and pagination
router.get(
  "/admin/settlements",
  verifyToken,
  allowRoles("admin"),
  adminListSettlements,
);

// Export settlements to CSV (must come before /admin/settlements/:id)
router.get(
  "/admin/settlements/export",
  verifyToken,
  allowRoles("admin"),
  adminExportCsv,
);

// Detailed settlement breakdown for a shift
router.get(
  "/admin/settlements/:id",
  verifyToken,
  allowRoles("admin"),
  adminSettlementDetail,
);

// List submitted / approved / rejected deposits
router.get(
  "/admin/deposits",
  verifyToken,
  allowRoles("admin"),
  adminListDeposits,
);

// Approve deposit (allocates cash across pending COD orders via FIFO)
router.post(
  "/admin/deposits/:id/approve",
  verifyToken,
  allowRoles("admin"),
  adminApproveDeposit,
);

// Reject deposit
router.post(
  "/admin/deposits/:id/reject",
  verifyToken,
  allowRoles("admin"),
  adminRejectDeposit,
);

// Record cash discrepancy (underpayment, missing cash, etc.)
router.post(
  "/admin/discrepancies",
  verifyToken,
  allowRoles("admin"),
  adminRecordDiscrepancy,
);

// Resolve an existing discrepancy
router.post(
  "/admin/discrepancies/:id/resolve",
  verifyToken,
  allowRoles("admin"),
  adminResolveDiscrepancy,
);

// Post an admin cash adjustment
router.post(
  "/admin/adjustments",
  verifyToken,
  allowRoles("admin"),
  adminCreateAdjustment,
);

// Grant temporary cash limit override to an active captain
router.post(
  "/admin/captains/:captainId/override",
  verifyToken,
  allowRoles("admin"),
  adminGrantOverride,
);

export default router;
