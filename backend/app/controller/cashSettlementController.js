import handleResponse from "../utils/helper.js";
import { uploadToCloudinary } from "../services/mediaService.js";
import {
  startShift,
  endShift,
  getCaptainOverview,
  getActiveShift,
  buildSettlementSummary,
  serializeDeposit,
} from "../services/cashSettlement/shiftService.js";
import { submitDeposit, approveDeposit, rejectDeposit, recordDiscrepancy, resolveDiscrepancy, createAdjustment } from "../services/cashSettlement/depositService.js";
import { grantLimitOverride } from "../services/cashSettlement/limitService.js";
import {
  getDashboard,
  listSettlements,
  getSettlementDetail,
  listDeposits,
  exportSettlementsCsv,
} from "../services/cashSettlement/adminService.js";

const fail = (res, e) =>
  handleResponse(res, e.statusCode || 500, e.message, {
    error: { code: e.code || "CASH_SETTLEMENT_FAILED", message: e.message },
  });

const wrap = (fn) => async (req, res) => {
  try {
    return await fn(req, res);
  } catch (e) {
    return fail(res, e);
  }
};

/* ───────────────────────────── captain ───────────────────────────── */

export const captainStartShift = wrap(async (req, res) => {
  const shift = await startShift(req.user.id);
  return handleResponse(res, 201, "Shift started", {
    shiftId: shift.shiftId,
    startedAt: shift.startedAt,
    status: shift.status,
  });
});

export const captainEndShift = wrap(async (req, res) => {
  const summary = await endShift(req.user.id);
  return handleResponse(res, 200, "Shift ended", summary);
});

export const captainOverview = wrap(async (req, res) => {
  return handleResponse(res, 200, "Shifts & cash settlement", await getCaptainOverview(req.user.id));
});

export const captainCurrentSummary = wrap(async (req, res) => {
  const active = await getActiveShift(req.user.id);
  return handleResponse(res, 200, "Current shift", active ? await buildSettlementSummary(active) : null);
});

export const captainSubmitDeposit = wrap(async (req, res) => {
  const body = req.body || {};
  let proofUrl = null;
  if (req.file) {
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(req.file.mimetype)) {
      return handleResponse(res, 400, "Proof must be a JPG, PNG, WebP or PDF file");
    }
    proofUrl = await uploadToCloudinary(req.file.buffer, "delivery/cash-deposit-proofs");
  }
  const { deposit, duplicate } = await submitDeposit({
    captainId: req.user.id,
    method: body.method,
    amount: body.amount,
    utr: body.utr,
    proofUrl,
    receiptNumber: body.receiptNumber,
    receivedBy: body.receivedBy,
    depositedAt: body.depositedAt,
    idempotencyKey: req.headers["idempotency-key"] || body.idempotencyKey || null,
  });
  return handleResponse(
    res,
    duplicate ? 200 : 201,
    duplicate
      ? "Deposit already submitted"
      : "Deposit submitted. It will count only after an admin verifies it.",
    serializeDeposit(deposit),
  );
});

/* ───────────────────────────── admin ───────────────────────────── */

export const adminDashboard = wrap(async (_req, res) =>
  handleResponse(res, 200, "Cash settlement dashboard", await getDashboard()),
);

export const adminListSettlements = wrap(async (req, res) =>
  handleResponse(res, 200, "Settlements", await listSettlements(req.query || {})),
);

export const adminSettlementDetail = wrap(async (req, res) =>
  handleResponse(res, 200, "Settlement detail", await getSettlementDetail(req.params.id)),
);

export const adminListDeposits = wrap(async (req, res) =>
  handleResponse(res, 200, "Deposits", await listDeposits(req.query || {})),
);

export const adminApproveDeposit = wrap(async (req, res) => {
  const out = await approveDeposit({
    depositId: req.params.id,
    adminId: req.user.id,
    verifiedAmount: req.body?.verifiedAmount ?? null,
    note: req.body?.note ?? null,
  });
  return handleResponse(res, 200, "Deposit verified", {
    status: out.status,
    allocated: out.allocated,
    excess: out.excess,
    pendingAfter: out.pendingAfter,
  });
});

export const adminRejectDeposit = wrap(async (req, res) => {
  const dep = await rejectDeposit({
    depositId: req.params.id,
    adminId: req.user.id,
    reason: req.body?.reason,
    discrepancyType: req.body?.discrepancyType || null,
  });
  return handleResponse(res, 200, "Deposit rejected", serializeDeposit(dep));
});

export const adminRecordDiscrepancy = wrap(async (req, res) => {
  const row = await recordDiscrepancy({ adminId: req.user.id, ...(req.body || {}) });
  return handleResponse(res, 201, "Discrepancy recorded", row);
});

export const adminResolveDiscrepancy = wrap(async (req, res) => {
  const row = await resolveDiscrepancy({
    discrepancyId: req.params.id,
    adminId: req.user.id,
    resolutionNote: req.body?.resolutionNote,
  });
  return handleResponse(res, 200, "Discrepancy resolved", row);
});

export const adminCreateAdjustment = wrap(async (req, res) => {
  const out = await createAdjustment({ adminId: req.user.id, ...(req.body || {}) });
  return handleResponse(res, 201, "Adjustment applied", {
    status: out.status,
    allocated: out.allocated,
    pendingAfter: out.pendingAfter,
  });
});

export const adminGrantOverride = wrap(async (req, res) => {
  const row = await grantLimitOverride({
    captainId: req.params.captainId,
    adminId: req.user.id,
    hours: req.body?.hours,
    reason: req.body?.reason,
  });
  return handleResponse(res, 201, "Override granted", row);
});

export const adminExportCsv = wrap(async (req, res) => {
  const csv = await exportSettlementsCsv(req.query || {});
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="captain-cash-settlements.csv"');
  return res.status(200).send(csv);
});
