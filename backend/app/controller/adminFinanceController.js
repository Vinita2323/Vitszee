import mongoose from "mongoose";
import Order from "../models/order.js";
import Payout from "../models/payout.js";
import Wallet from "../models/wallet.js";
import Seller from "../models/seller.js";
import Delivery from "../models/delivery.js";
import handleResponse from "../utils/helper.js";
import { roundCurrency } from "../utils/money.js";
import { reconcileCodCash } from "../services/finance/orderFinanceService.js";
import { getAdminFinanceSummary } from "../services/finance/walletService.js";
import { getLedgerEntries } from "../services/finance/ledgerService.js";
import { bulkProcessPayouts } from "../services/finance/payoutService.js";
import { exportFinanceStatement } from "../services/finance/statementService.js";
import { getProfitAnalytics } from "../services/finance/analyticsService.js";
import { getFinanceDrilldown } from "../services/finance/drilldownService.js";
import {
  FINANCE_AUDIT_ACTION,
  ORDER_PAYMENT_STATUS,
  OWNER_TYPE,
} from "../constants/finance.js";
import {
  getOrCreateFinanceSettings,
  updateDeliveryFinanceSettings,
} from "../services/finance/financeSettingsService.js";
import { createFinanceAuditLog } from "../services/finance/auditLogService.js";
import {
  financeLedgerQuerySchema,
  payoutProcessSchema,
  updateDeliverySettingsSchema,
} from "../validation/financeValidation.js";
import { validateBodySafe as validateWithJoi } from "../middleware/validate.js";

export const getAdminFinanceSummaryController = async (req, res) => {
  try {
    const summary = await getAdminFinanceSummary();
    return handleResponse(res, 200, "Admin finance summary fetched", summary);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getAdminFinanceAnalyticsController = async (req, res) => {
  try {
    const { timeRange } = req.query;
    const analytics = await getProfitAnalytics(timeRange);
    return handleResponse(res, 200, "Admin finance analytics fetched", analytics);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getAdminFinanceDrilldownController = async (req, res) => {
  try {
    const { metricType, page, limit } = req.query;
    const drilldown = await getFinanceDrilldown({ metricType, page, limit });
    return handleResponse(res, 200, "Admin finance drilldown fetched", drilldown);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getAdminFinanceLedgerController = async (req, res) => {
  try {
    const validated = validateWithJoi(financeLedgerQuerySchema, req.query || {});
    if (!validated.isValid) {
      return handleResponse(res, 400, validated.message);
    }
    const ledger = await getLedgerEntries(validated.value);
    return handleResponse(res, 200, "Finance ledger fetched", ledger);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getAdminFinancePayoutsController = async (req, res) => {
  try {
    const {
      seller,
      rider,
      status,
      page = 1,
      limit = 25,
    } = req.query;

    const query = {};
    if (status) query.status = status;

    const includeSeller = String(seller).toLowerCase() === "true";
    const includeRider = String(rider).toLowerCase() === "true";
    if (includeSeller && !includeRider) query.payoutType = "SELLER";
    if (!includeSeller && includeRider) query.payoutType = "DELIVERY_PARTNER";

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
    const skip = (safePage - 1) * safeLimit;

    const [rawItems, total] = await Promise.all([
      Payout.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate("relatedOrderIds", "orderId paymentMode paymentStatus status")
        .lean(),
      Payout.countDocuments(query),
    ]);

    const sellerIds = rawItems
      .filter((item) => item.payoutType === "SELLER")
      .map((item) => item.beneficiaryId);
    const riderIds = rawItems
      .filter((item) => item.payoutType === "DELIVERY_PARTNER")
      .map((item) => item.beneficiaryId);

    const [sellers, riders] = await Promise.all([
      Seller.find({ _id: { $in: sellerIds } })
        .select("_id shopName name phone")
        .lean(),
      Delivery.find({ _id: { $in: riderIds } })
        .select("_id name phone")
        .lean(),
    ]);

    const sellerMap = new Map(sellers.map((seller) => [String(seller._id), seller]));
    const riderMap = new Map(riders.map((rider) => [String(rider._id), rider]));

    const items = rawItems.map((item) => {
      const beneficiary =
        item.payoutType === "SELLER"
          ? sellerMap.get(String(item.beneficiaryId))
          : riderMap.get(String(item.beneficiaryId));
      return {
        ...item,
        beneficiary: beneficiary || null,
      };
    });

    return handleResponse(res, 200, "Finance payouts fetched", {
      items,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const processAdminFinancePayoutsController = async (req, res) => {
  try {
    const validated = validateWithJoi(payoutProcessSchema, req.body || {});
    if (!validated.isValid) {
      return handleResponse(res, 400, validated.message);
    }

    const result = await bulkProcessPayouts({
      payoutIds: validated.value.payoutIds,
      payoutType: validated.value.payoutType,
      limit: validated.value.limit,
      remarks: validated.value.remarks || "",
      adminId: req.user?.id || null,
    });

    return handleResponse(res, 200, "Payout processing completed", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const exportAdminFinanceStatementController = async (req, res) => {
  try {
    const statement = await exportFinanceStatement(req.query || {});
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${statement.fileName}"`,
    );
    return res.status(200).send(statement.csv);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getDeliverySettingsController = async (req, res) => {
  try {
    const settings = await getOrCreateFinanceSettings();
    return handleResponse(res, 200, "Delivery finance settings fetched", settings);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateDeliverySettingsController = async (req, res) => {
  try {
    const validated = validateWithJoi(updateDeliverySettingsSchema, req.body || {});
    if (!validated.isValid) {
      return handleResponse(res, 400, validated.message);
    }
    const updated = await updateDeliveryFinanceSettings(validated.value);
    await createFinanceAuditLog({
      action: FINANCE_AUDIT_ACTION.DELIVERY_SETTINGS_UPDATED,
      actorType: OWNER_TYPE.ADMIN,
      actorId: req.user?.id || null,
      metadata: {
        updatedFields: Object.keys(validated.value || {}),
      },
    });
    return handleResponse(res, 200, "Delivery finance settings updated", updated);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getSellerWalletSummaryController = async (req, res) => {
  try {
    const sellerId = req.user?.id;
    const wallet = await Wallet.findOne({ ownerType: "SELLER", ownerId: sellerId }).lean();
    return handleResponse(res, 200, "Seller wallet summary fetched", {
      availableBalance: wallet?.availableBalance || 0,
      pendingBalance: wallet?.pendingBalance || 0,
      totalCredited: wallet?.totalCredited || 0,
      totalDebited: wallet?.totalDebited || 0,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getRiderWalletSummaryController = async (req, res) => {
  try {
    const riderId = req.user?.id;
    const wallet = await Wallet.findOne({
      ownerType: "DELIVERY_PARTNER",
      ownerId: riderId,
    }).lean();
    return handleResponse(res, 200, "Rider wallet summary fetched", {
      availableBalance: wallet?.availableBalance || 0,
      pendingBalance: wallet?.pendingBalance || 0,
      cashInHand: wallet?.cashInHand || 0,
      totalCredited: wallet?.totalCredited || 0,
      totalDebited: wallet?.totalDebited || 0,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/**
 * Admin reconciles / marks remitted COD cash from delivery partners.
 */
export const remitOrderCodCashController = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { amount } = req.body || {};
    const adminId = req.user?.id || req.user?._id;

    const isMongoId = mongoose.Types.ObjectId.isValid(orderId);
    const order = await Order.findOne(
      isMongoId ? { $or: [{ _id: orderId }, { orderId }] } : { orderId }
    );

    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }

    if (order.paymentMode !== "COD") {
      return handleResponse(res, 400, "Only COD orders can be remitted");
    }

    if (order.paymentStatus === ORDER_PAYMENT_STATUS.COD_RECONCILED) {
      return handleResponse(res, 200, "COD for this order is already fully reconciled", order);
    }

    const codCollected = roundCurrency(order.paymentBreakdown?.codCollectedAmount || 0);
    const codRemitted = roundCurrency(order.paymentBreakdown?.codRemittedAmount || 0);
    const codPending = roundCurrency(codCollected - codRemitted);

    if (codPending <= 0) {
      return handleResponse(res, 400, "No pending COD amount to remit for this order");
    }

    const remitAmount =
      amount !== undefined && amount !== null && amount !== ""
        ? roundCurrency(Number(amount))
        : codPending;

    if (remitAmount <= 0) {
      return handleResponse(res, 400, "Remittance amount must be greater than 0");
    }

    if (remitAmount > codPending) {
      return handleResponse(
        res,
        400,
        `Remittance amount (${remitAmount}) exceeds pending amount (${codPending})`,
      );
    }

    const updated = await reconcileCodCash(
      order._id,
      remitAmount,
      order.deliveryBoy,
      { actorId: adminId, metadata: { remittedByAdmin: true } },
    );

    return handleResponse(res, 200, "COD cash remitted successfully", updated);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

