import CashCollection from "../../models/cashCollection.js";
import Shift from "../../models/shift.js";
import { COLLECTION_METHOD, SHIFT_STATUS } from "../../constants/cashSettlement.js";
import { roundCurrency } from "../../utils/money.js";
import logger from "../logger.js";
import { checkAndNotifyLimits } from "./limitService.js";

/**
 * Records the cash/online collection for a delivered order. Called once the
 * order's delivered settlement has run, so every figure is read from the
 * backend-verified order (never from the client).
 *
 * Idempotent: `order` is unique on CashCollection, so a retry returns the
 * existing row instead of creating a second one.
 */
export async function recordDeliveryCollection(order) {
  if (!order?.deliveryBoy) return null;
  const captain = order.deliveryBoy;
  const mode = String(order.paymentMode || "").toUpperCase();
  const grandTotal = roundCurrency(order.paymentBreakdown?.grandTotal || order.pricing?.total || 0);

  let method;
  let amount;
  if (order.paymentMethod === "RAZORPAY_QR") {
    method = COLLECTION_METHOD.RAZORPAY_QR;
    amount = grandTotal;
  } else if (mode === "ONLINE") {
    method = COLLECTION_METHOD.ONLINE_PREPAID;
    amount = grandTotal;
  } else if (mode === "COD") {
    method = COLLECTION_METHOD.CASH;
    amount = roundCurrency(order.paymentBreakdown?.codCollectedAmount || 0);
    if (!order.financeFlags?.codMarkedCollected || amount <= 0) {
      logger.error("cash collection skipped: COD order has no recorded cash", {
        scope: "cashSettlement",
        orderId: order.orderId,
      });
      return null;
    }
  } else {
    return null;
  }

  const activeShift = await Shift.findOne({ captain, status: SHIFT_STATUS.ACTIVE }).select("_id");
  try {
    const row = await CashCollection.create({
      order: order._id,
      orderId: order.orderId,
      captain,
      shift: activeShift?._id || null,
      customer: order.customer?._id || order.customer || null,
      amount,
      paymentMethod: method,
      countsTowardCash: method === COLLECTION_METHOD.CASH,
      collectedAt: new Date(), // server time
      reference: `COL-${order.orderId}`,
      verification: {
        source: "BACKEND_ORDER_SETTLEMENT",
        orderGrandTotal: grandTotal,
        codCollectedAmount: roundCurrency(order.paymentBreakdown?.codCollectedAmount || 0),
        orderPaymentMethod: order.paymentMethod || null,
        gatewayTransactionId: order.payment?.transactionId || null,
        otpValidatedAt: order.otpValidatedAt || null,
        deliveredAt: order.deliveredAt || null,
        shiftAssigned: !!activeShift,
      },
    });
    if (method === COLLECTION_METHOD.CASH) {
      checkAndNotifyLimits(captain).catch((e) =>
        logger.warn("cash limit check failed", { error: e.message }),
      );
    }
    return row;
  } catch (error) {
    if (error?.code === 11000) {
      return CashCollection.findOne({ order: order._id });
    }
    throw error;
  }
}
