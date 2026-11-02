import crypto from "crypto";
import mongoose from "mongoose";

import Order from "../models/order.js";
import CheckoutGroup from "../models/checkoutGroup.js";
import Payment from "../models/payment.js";
import { ORDER_PAYMENT_STATUS } from "../constants/finance.js";
import {
  PAYMENT_EVENT_SOURCE,
  PAYMENT_STATUS,
  PAYMENT_GATEWAY,
  RECONCILIATION_REASON,
  WEBHOOK_KIND,
  WEBHOOK_EVENT_STATUS,
} from "../constants/payment.js";
import { handleOnlineOrderFinance } from "./finance/orderFinanceService.js";
import { DEFAULT_SELLER_TIMEOUT_MS, WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { afterPlaceOrderV2, proceedToDeliverySearch } from "./orderWorkflowService.js";
import { releaseReservedStockForOrder } from "./stockService.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import logger from "./logger.js";
import { getActivePaymentProvider } from "./payment/providerRegistry.js";
import { alertAdmins } from "./paymentAlerts.js";
import { claimWebhookEvent, completeWebhookEvent, failWebhookEvent } from "./paymentWebhookEvents.js";

const MAX_MERCHANT_ORDER_ID_LENGTH = 63;

function sanitizeMerchantOrderIdPart(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildGatewayMerchantOrderId(publicOrderRef, attemptCount = 1) {
  const normalizedBase = sanitizeMerchantOrderIdPart(publicOrderRef) || "ORDER";
  const suffix = `-A${Math.max(1, Number(attemptCount) || 1)}`;
  const maxBaseLength = MAX_MERCHANT_ORDER_ID_LENGTH - suffix.length;
  const truncatedBase = normalizedBase.slice(0, Math.max(1, maxBaseLength));
  return `${truncatedBase}${suffix}`;
}

function toOrderLookup(orderRef) {
  if (!orderRef) return null;
  const trimmed = String(orderRef).trim();
  if (!trimmed) return null;
  if (mongoose.Types.ObjectId.isValid(trimmed)) {
    return {
      $or: [{ _id: new mongoose.Types.ObjectId(trimmed) }, { orderId: trimmed }],
    };
  }
  return { orderId: trimmed };
}

function extractCheckoutGroupId(orderRef) {
  const trimmed = String(orderRef || "").trim().toUpperCase();
  if (!trimmed) return null;
  if (trimmed.startsWith("CHK-") || trimmed.startsWith("CG-")) {
    return trimmed;
  }
  return null;
}

async function resolvePaymentTarget(orderRef) {
  const checkoutGroupId = extractCheckoutGroupId(orderRef);
  if (checkoutGroupId) {
    const checkoutGroup = await CheckoutGroup.findOne({ checkoutGroupId }).lean();
    if (!checkoutGroup) {
      const err = new Error("Checkout group not found");
      err.statusCode = 404;
      throw err;
    }
    let orders = await Order.find({ checkoutGroupId })
      .sort({ checkoutGroupIndex: 1, createdAt: 1 });

    if (orders.length === 0) {
      const fallbackClauses = [];
      if (Array.isArray(checkoutGroup.orderIds) && checkoutGroup.orderIds.length > 0) {
        fallbackClauses.push({ _id: { $in: checkoutGroup.orderIds } });
      }
      if (Array.isArray(checkoutGroup.publicOrderIds) && checkoutGroup.publicOrderIds.length > 0) {
        fallbackClauses.push({ orderId: { $in: checkoutGroup.publicOrderIds } });
      }

      if (fallbackClauses.length > 0) {
        orders = await Order.find({ $or: fallbackClauses })
          .sort({ checkoutGroupIndex: 1, createdAt: 1 });
      }
    }

    if (orders.length === 0) {
      const err = new Error("Checkout group has no orders");
      err.statusCode = 404;
      throw err;
    }
    return {
      checkoutGroupId,
      checkoutGroup,
      orders,
      primaryOrder: orders[0],
      publicOrderRef: checkoutGroupId,
    };
  }

  const query = toOrderLookup(orderRef);
  if (!query) {
    const err = new Error("orderRef is required");
    err.statusCode = 400;
    throw err;
  }

  const order = await Order.findOne(query);
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (order.checkoutGroupId) {
    const orders = await Order.find({ checkoutGroupId: order.checkoutGroupId })
      .sort({ checkoutGroupIndex: 1, createdAt: 1 });
    const checkoutGroup = await CheckoutGroup.findOne({
      checkoutGroupId: order.checkoutGroupId,
    }).lean();
    return {
      checkoutGroupId: order.checkoutGroupId,
      checkoutGroup,
      orders: orders.length > 0 ? orders : [order],
      primaryOrder: order,
      publicOrderRef: order.checkoutGroupId,
    };
  }

  return {
    checkoutGroupId: null,
    checkoutGroup: null,
    orders: [order],
    primaryOrder: order,
    publicOrderRef: order.orderId,
  };
}

function validatePaymentEligibility(target, userId) {
  if (!target?.orders?.length) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  for (const order of target.orders) {
    if (String(order.customer) !== String(userId)) {
      const err = new Error("You are not allowed to pay for this order");
      err.statusCode = 403;
      throw err;
    }
    if (order.paymentMode !== "ONLINE") {
      const err = new Error("Payment is allowed only for ONLINE orders");
      err.statusCode = 400;
      throw err;
    }
    if (
      order.status === "cancelled" ||
      order.workflowStatus === WORKFLOW_STATUS.CANCELLED ||
      order.status === "delivered" ||
      order.workflowStatus === WORKFLOW_STATUS.DELIVERED
    ) {
      const err = new Error("Payment is not allowed for this checkout state");
      err.statusCode = 409;
      throw err;
    }
    if (order.paymentStatus === ORDER_PAYMENT_STATUS.PAID) {
      const err = new Error("Order is already paid");
      err.statusCode = 409;
      throw err;
    }
    if (order.paymentStatus === ORDER_PAYMENT_STATUS.REFUNDED) {
      const err = new Error("Order payment has already been refunded");
      err.statusCode = 409;
      throw err;
    }
  }
}

function getPayableAmountPaise(target) {
  const amountRupees = target.orders.reduce(
    (sum, order) =>
      sum + Number(order?.paymentBreakdown?.grandTotal ?? order?.pricing?.total ?? 0),
    0,
  );
  if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
    const err = new Error("Unable to determine payable amount for this checkout");
    err.statusCode = 400;
    throw err;
  }
  return Math.round(amountRupees * 100);
}


function paymentStatusToOrderPaymentStatus(status) {
  if (status === PAYMENT_STATUS.CAPTURED) return ORDER_PAYMENT_STATUS.PAID;
  if (status === PAYMENT_STATUS.FAILED) return ORDER_PAYMENT_STATUS.FAILED;
  if (status === PAYMENT_STATUS.REFUNDED) return ORDER_PAYMENT_STATUS.REFUNDED;
  return ORDER_PAYMENT_STATUS.CREATED;
}

/**
 * Atomically moves a payment to `nextStatus` only if it is currently in one
 * of `allowedFrom`. Returns the updated payment, or null when another worker
 * (or an earlier event) already moved it — callers treat null as "nothing to do".
 */
export async function claimStatusTransition(payment, nextStatus, {
  allowedFrom,
  source,
  reason = "",
  gatewayPaymentId = null,
  eventName = null,
}) {
  const now = new Date();
  const set = { status: nextStatus };
  if (gatewayPaymentId) set.gatewayPaymentId = gatewayPaymentId;
  if (eventName) {
    set["rawGatewayResponse.lastEvent"] = eventName;
    set["rawGatewayResponse.lastEventAt"] = now;
  }
  if (nextStatus === PAYMENT_STATUS.CAPTURED) set.capturedAt = now;
  if (nextStatus === PAYMENT_STATUS.FAILED) {
    set.failedAt = now;
    set.failureReason = reason || null;
  }
  if (nextStatus === PAYMENT_STATUS.REFUNDED) set.refundedAt = now;

  return Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: allowedFrom } },
    {
      $set: set,
      $push: {
        statusHistory: {
          fromStatus: payment.status || PAYMENT_STATUS.CREATED,
          toStatus: nextStatus,
          source,
          reason,
          changedAt: now,
        },
      },
    },
    { new: true },
  );
}

async function moveOrderToSellerPendingAfterPayment(orderId) {
  const now = new Date();
  const sellerPendingUntil = new Date(now.getTime() + DEFAULT_SELLER_TIMEOUT_MS());
  const updatedOrder = await Order.findOneAndUpdate(
    {
      _id: orderId,
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.CREATED,
      paymentMode: "ONLINE",
    },
    {
      $set: {
        workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
        sellerPendingExpiresAt: sellerPendingUntil,
        sellerResponseDeadline: sellerPendingUntil,
        sellerResponseStatus: "PENDING",
        expiresAt: sellerPendingUntil,
      },
    },
    { new: true },
  );
  if (updatedOrder) {
    void afterPlaceOrderV2(updatedOrder).catch((error) => {
      logger.warn("afterPlaceOrderV2 failed", {
        scope: "moveOrderToSellerPendingAfterPayment",
        orderId: updatedOrder.orderId,
        orderObjectId: updatedOrder._id?.toString?.(),
        error: error.message,
      });
    });
  }
}

async function moveOrderToDeliverySearchAfterPayment(orderId) {
  const orderForCheck = await Order.findById(orderId);
  if (orderForCheck && orderForCheck.workflowStatus === WORKFLOW_STATUS.SELLER_ACCEPTED) {
    // Update payment method to online since it was captured
    orderForCheck.paymentMode = "ONLINE";
    orderForCheck.payment.method = "online";
    await orderForCheck.save();

    try {
      await proceedToDeliverySearch(orderForCheck.orderId, orderForCheck);
    } catch (error) {
      logger.warn("proceedToDeliverySearch failed in moveOrderToDeliverySearchAfterPayment", {
        orderId: orderForCheck.orderId,
        error: error.message,
      });
    }
  }
}

export async function getRelatedOrdersForPayment(payment) {
  if (Array.isArray(payment.orderIds) && payment.orderIds.length > 0) {
    return Order.find({ _id: { $in: payment.orderIds } })
      .sort({ checkoutGroupIndex: 1, createdAt: 1 });
  }
  if (payment.checkoutGroupId) {
    return Order.find({ checkoutGroupId: payment.checkoutGroupId })
      .sort({ checkoutGroupIndex: 1, createdAt: 1 });
  }
  if (payment.order) {
    const order = await Order.findById(payment.order);
    return order ? [order] : [];
  }
  return [];
}

async function updateCheckoutGroupPaymentStatus(checkoutGroupId, nextStatus) {
  if (!checkoutGroupId) return;
  if (nextStatus === PAYMENT_STATUS.CAPTURED) {
    await CheckoutGroup.updateOne(
      { checkoutGroupId },
      {
        $set: {
          status: "PAID",
          paymentStatus: ORDER_PAYMENT_STATUS.PAID,
          "stockReservation.status": "COMMITTED",
        },
      },
    );
    return;
  }
  if (nextStatus === PAYMENT_STATUS.FAILED || nextStatus === PAYMENT_STATUS.CANCELLED) {
    await CheckoutGroup.updateOne(
      { checkoutGroupId },
      {
        $set: {
          status: "CANCELLED",
          paymentStatus: ORDER_PAYMENT_STATUS.FAILED,
          "stockReservation.status": "RELEASED",
          "stockReservation.releasedAt": new Date(),
        },
      },
    );
    return;
  }
  if (nextStatus === PAYMENT_STATUS.REFUNDED) {
    await CheckoutGroup.updateOne(
      { checkoutGroupId },
      {
        $set: {
          paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,
          status: "CANCELLED",
        },
      },
    );
  }
}

const isOrderCancelled = (order) =>
  order.status === "cancelled" ||
  order.orderStatus === "cancelled" ||
  order.workflowStatus === WORKFLOW_STATUS.CANCELLED;

const CAPTURE_FROM = [
  PAYMENT_STATUS.CREATED,
  PAYMENT_STATUS.PENDING,
  PAYMENT_STATUS.AUTHORIZED,
  PAYMENT_STATUS.FAILED,
  PAYMENT_STATUS.CANCELLED,
];
const CANCEL_FROM = [
  PAYMENT_STATUS.CREATED,
  PAYMENT_STATUS.PENDING,
  PAYMENT_STATUS.AUTHORIZED,
  PAYMENT_STATUS.FAILED,
];
const CAPTURE_LOCK_MS = 2 * 60 * 1000;

/**
 * Records that this payment needs a human (late capture after cancel,
 * duplicate payment, amount mismatch...). Each (reason, key) is stored and
 * alerted exactly once, however many times the triggering event is redelivered.
 */
export async function flagReconciliation(payment, reason, details = {}, keyPart = "") {
  const key = `${reason}:${keyPart || details.gatewayPaymentId || ""}`;
  const flagged = await Payment.findOneAndUpdate(
    { _id: payment._id, reconciliationKeys: { $ne: key } },
    {
      $set: { "reconciliation.required": true },
      $push: {
        reconciliationKeys: key,
        "reconciliation.items": { reason, details, flaggedAt: new Date() },
      },
    },
    { new: true },
  );
  if (!flagged) return false; // already flagged and alerted
  logger.error("payment_needs_reconciliation", {
    scope: "paymentService.reconciliation",
    reason,
    publicOrderId: payment.publicOrderId,
    paymentId: String(payment._id),
    ...details,
  });
  alertAdmins({
    title: "Payment needs reconciliation",
    message: `${reason} for ${payment.publicOrderId}. ${describeReconciliation(reason, payment, details)}`,
    token: `payment-recon:${payment._id}:${key}`,
  });
  return true;
}

function describeReconciliation(reason, payment, d) {
  const amount = d.amountPaise != null ? `₹${(d.amountPaise / 100).toFixed(2)}` : `₹${(payment.amount / 100).toFixed(2)}`;
  switch (reason) {
    case RECONCILIATION_REASON.LATE_CAPTURE_AFTER_CANCEL:
      return `${amount} was captured after the order was cancelled. Refund or reinstate it.`;
    case RECONCILIATION_REASON.DUPLICATE_PAYMENT:
      return `A second payment (${d.gatewayPaymentId || "unknown"}) of ${amount} was captured. Refund the duplicate.`;
    case RECONCILIATION_REASON.AMOUNT_MISMATCH:
      return `Expected ₹${(payment.amount / 100).toFixed(2)} but the gateway reported ${amount}.`;
    default:
      return JSON.stringify(d).slice(0, 180);
  }
}

/** Stops a payment from being applied twice: one worker at a time, exactly once. */
async function acquireCaptureLock(paymentId) {
  return Payment.findOneAndUpdate(
    {
      _id: paymentId,
      captureProcessedAt: null,
      $or: [{ captureLockedAt: null }, { captureLockedAt: { $lt: new Date(Date.now() - CAPTURE_LOCK_MS) } }],
    },
    { $set: { captureLockedAt: new Date() } },
    { new: true },
  );
}

async function runCaptureSideEffects(payment, orders) {
  const locked = await acquireCaptureLock(payment._id);
  if (!locked) return { ran: false };
  try {
    for (const order of orders) {
      await handleOnlineOrderFinance(order._id, {
        actorId: null,
        transactionId: payment.gatewayPaymentId || "",
        metadata: {
          paymentId: payment._id.toString(),
          checkoutGroupId: payment.checkoutGroupId || null,
        },
      });
      await moveOrderToSellerPendingAfterPayment(order._id);
      await moveOrderToDeliverySearchAfterPayment(order._id);
      emitNotificationEvent(NOTIFICATION_EVENTS.PAYMENT_SUCCESS, {
        orderId: order.orderId,
        checkoutGroupId: payment.checkoutGroupId,
        customerId: order.customer,
        userId: order.customer,
        sellerId: order.seller,
      });
      emitNotificationEvent(NOTIFICATION_EVENTS.NEW_ORDER, {
        orderId: order.orderId,
        sellerId: order.seller,
      });
    }
    if (orders.length === (await getRelatedOrdersForPayment(payment)).length) {
      await updateCheckoutGroupPaymentStatus(payment.checkoutGroupId, PAYMENT_STATUS.CAPTURED);
    }
    await Payment.updateOne(
      { _id: payment._id },
      { $set: { captureProcessedAt: new Date(), captureLockedAt: null } },
    );
    return { ran: true };
  } catch (error) {
    await Payment.updateOne({ _id: payment._id }, { $set: { captureLockedAt: null } });
    throw error;
  }
}

/**
 * Money was captured for this payment. Safe to call any number of times and
 * from any signal (payment.captured, order.paid, payment_link.paid, client
 * verify): the first caller moves the state, exactly one worker applies the
 * order side effects, everyone else is a no-op.
 */
async function handleCaptured(payment, ev) {
  // 1. Verify what was actually paid (webhook amount/currency vs what we asked for).
  if (ev.amountPaise != null && ev.amountPaise !== payment.amount) {
    await flagReconciliation(payment, RECONCILIATION_REASON.AMOUNT_MISMATCH, {
      gatewayPaymentId: ev.gatewayPaymentId, amountPaise: ev.amountPaise, expectedPaise: payment.amount,
    });
    return { outcome: "AMOUNT_MISMATCH", payment };
  }
  if (ev.currency && payment.currency && ev.currency.toUpperCase() !== payment.currency.toUpperCase()) {
    await flagReconciliation(payment, RECONCILIATION_REASON.AMOUNT_MISMATCH, {
      gatewayPaymentId: ev.gatewayPaymentId, currency: ev.currency, expectedCurrency: payment.currency,
    }, `currency:${ev.currency}`);
    return { outcome: "CURRENCY_MISMATCH", payment };
  }
  if (payment.status === PAYMENT_STATUS.REFUNDED) return { outcome: "ALREADY_REFUNDED", payment };

  // Only a real Razorpay payment id (pay_...) identifies the payment; older rows
  // may hold the payment-link id here, which must not be mistaken for a payment.
  const realPaymentId = ev.gatewayPaymentId && /^pay_/.test(ev.gatewayPaymentId) ? ev.gatewayPaymentId : null;
  const knownPaymentId = payment.gatewayPaymentId && /^pay_/.test(payment.gatewayPaymentId) ? payment.gatewayPaymentId : null;

  // 2. Already captured: either the same payment signalled again, or a second payment.
  if (payment.status === PAYMENT_STATUS.CAPTURED) {
    if (knownPaymentId && realPaymentId && knownPaymentId !== realPaymentId) {
      await flagReconciliation(payment, RECONCILIATION_REASON.DUPLICATE_PAYMENT, {
        gatewayPaymentId: realPaymentId, firstPaymentId: knownPaymentId, amountPaise: ev.amountPaise ?? payment.amount,
      });
      return { outcome: "DUPLICATE_PAYMENT", payment };
    }
    if (!knownPaymentId && realPaymentId) {
      await Payment.updateOne({ _id: payment._id, gatewayPaymentId: payment.gatewayPaymentId }, { $set: { gatewayPaymentId: realPaymentId } });
    }
    return finishCapture(await Payment.findById(payment._id), ev, { alreadyCaptured: true });
  }

  // 3. First capture: claim the state change atomically.
  const claimed = await claimStatusTransition(payment, PAYMENT_STATUS.CAPTURED, {
    allowedFrom: CAPTURE_FROM,
    source: ev.source,
    reason: ev.reason || "Payment captured",
    gatewayPaymentId: realPaymentId || (ev.gatewayPaymentId && !payment.gatewayPaymentId ? ev.gatewayPaymentId : null),
    eventName: ev.eventName,
  });
  if (!claimed) {
    // Lost the race — another event captured it first. Re-evaluate as "already captured".
    return handleCaptured(await Payment.findById(payment._id), ev);
  }
  return finishCapture(claimed, ev, { alreadyCaptured: false });
}

async function finishCapture(payment, ev, { alreadyCaptured }) {
  if (payment.captureProcessedAt) return { outcome: "ALREADY_PROCESSED", payment };
  const orders = await getRelatedOrdersForPayment(payment);
  const live = orders.filter((o) => !isOrderCancelled(o));
  const dead = orders.filter(isOrderCancelled);

  if (dead.length) {
    // Never silently ignore a successful payment: the order is gone but the money is here.
    await flagReconciliation(payment, RECONCILIATION_REASON.LATE_CAPTURE_AFTER_CANCEL, {
      gatewayPaymentId: ev.gatewayPaymentId || payment.gatewayPaymentId,
      amountPaise: payment.amount,
      cancelledOrderIds: dead.map((o) => o.orderId),
      allCancelled: live.length === 0,
    }, payment.gatewayPaymentId || ev.gatewayPaymentId || "");
  }
  if (!live.length) {
    await Payment.updateOne({ _id: payment._id }, { $set: { captureProcessedAt: new Date() } });
    return { outcome: "CAPTURED_ORDER_CANCELLED", payment: await Payment.findById(payment._id) };
  }
  const result = await runCaptureSideEffects(payment, live);
  return {
    outcome: result.ran ? (alreadyCaptured ? "RECOVERED_SIDE_EFFECTS" : "CAPTURED") : "IN_PROGRESS",
    payment: await Payment.findById(payment._id),
  };
}

/**
 * One failed attempt on a payment link. The link stays valid and the customer
 * may retry, so the payment stays PENDING and the order is NOT cancelled.
 */
async function handleAttemptFailed(payment, ev) {
  if ([PAYMENT_STATUS.CAPTURED, PAYMENT_STATUS.REFUNDED].includes(payment.status)) {
    return { outcome: "IGNORED_AFTER_CAPTURE", payment };
  }
  const attemptId = ev.gatewayPaymentId || `attempt:${ev.eventId}`;
  const recorded = await Payment.findOneAndUpdate(
    { _id: payment._id, "failedAttempts.paymentId": { $ne: attemptId } },
    {
      $push: { failedAttempts: { paymentId: attemptId, reason: ev.failureReason || null, at: new Date() } },
      $set: { failureReason: ev.failureReason || payment.failureReason || null, "rawGatewayResponse.lastEvent": ev.eventName },
    },
    { new: true },
  );
  if (recorded) {
    const orders = await getRelatedOrdersForPayment(payment);
    for (const order of orders) {
      emitNotificationEvent(NOTIFICATION_EVENTS.CUSTOMER_PAYMENT_FAILED, {
        orderId: order.orderId,
        customerId: order.customer,
        userId: order.customer,
        customerMessage: "Your payment attempt failed. You can retry using the same payment link.",
      });
    }
  }
  return { outcome: recorded ? "ATTEMPT_RECORDED" : "ATTEMPT_ALREADY_RECORDED", payment: recorded || payment };
}

/**
 * The payment link expired or was cancelled with no successful payment.
 * Only now are unpaid orders cancelled and their stock released — and only
 * orders that are still waiting for payment (state-checked).
 */
async function handleLinkClosed(payment, ev) {
  if ([PAYMENT_STATUS.CAPTURED, PAYMENT_STATUS.REFUNDED].includes(payment.status)) {
    return { outcome: "IGNORED_AFTER_CAPTURE", payment }; // out-of-order event
  }
  const reason = ev.reason || "Payment link closed";
  let current = payment;
  if (payment.status !== PAYMENT_STATUS.CANCELLED) {
    const claimed = await claimStatusTransition(payment, PAYMENT_STATUS.CANCELLED, {
      allowedFrom: CANCEL_FROM,
      source: ev.source,
      reason,
      eventName: ev.eventName,
    });
    if (!claimed) return { outcome: "IGNORED_RACE", payment: await Payment.findById(payment._id) };
    current = claimed;
  }
  // Idempotent: orders already cancelled are skipped, so retries are safe.
  const cancelled = await cancelUnpaidOrders(current, reason);
  return { outcome: cancelled ? "CANCELLED" : "CANCELLED_NO_ORDER_CHANGE", payment: current };
}

async function cancelUnpaidOrders(payment, reason) {
  const orders = await getRelatedOrdersForPayment(payment);
  if (!orders.length) return 0;
  const cancelledNow = [];
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    for (const order of orders) {
      const orderForUpdate = await Order.findById(order._id, null, { session });
      if (
        orderForUpdate &&
        orderForUpdate.workflowStatus === WORKFLOW_STATUS.CREATED &&
        orderForUpdate.status !== "cancelled" &&
        orderForUpdate.paymentStatus !== ORDER_PAYMENT_STATUS.PAID
      ) {
        await releaseReservedStockForOrder(orderForUpdate, { session, reason });
        orderForUpdate.status = "cancelled";
        orderForUpdate.orderStatus = "cancelled";
        orderForUpdate.workflowStatus = WORKFLOW_STATUS.CANCELLED;
        orderForUpdate.cancelledBy = "system";
        orderForUpdate.cancelReason = reason;
        orderForUpdate.paymentStatus = ORDER_PAYMENT_STATUS.FAILED;
        await orderForUpdate.save({ session });
        cancelledNow.push(orderForUpdate);
      }
    }
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
  await updateCheckoutGroupPaymentStatus(payment.checkoutGroupId, PAYMENT_STATUS.CANCELLED);
  for (const order of cancelledNow) {
    emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, {
      orderId: order.orderId,
      checkoutGroupId: payment.checkoutGroupId,
      customerId: order.customer,
      userId: order.customer,
      sellerId: order.seller,
      customerMessage: "Order was cancelled because payment was not completed.",
      sellerMessage: `Order #${order.orderId} was cancelled because payment was not completed.`,
    });
  }
  return cancelledNow.length;
}

/** Full refund of the payment: mirror it on the related orders and checkout group. */
export async function applyFullRefundEffects(payment) {
  const orders = await getRelatedOrdersForPayment(payment);
  if (!orders.length) return;
  await Order.updateMany(
    { _id: { $in: orders.map((order) => order._id) } },
    { $set: { paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED, "payment.status": "refunded" } },
  );
  await updateCheckoutGroupPaymentStatus(payment.checkoutGroupId, PAYMENT_STATUS.REFUNDED);
  for (const order of orders) {
    emitNotificationEvent(NOTIFICATION_EVENTS.REFUND_COMPLETED, {
      orderId: order.orderId,
      checkoutGroupId: payment.checkoutGroupId,
      customerId: order.customer,
      userId: order.customer,
      sellerId: order.seller,
    });
  }
}

export async function createPaymentOrderForOrderRef({
  orderRef,
  userId,
  idempotencyKey = null,
  correlationId = null,
}) {
  const target = await resolvePaymentTarget(orderRef);
  validatePaymentEligibility(target, userId);
  const primaryOrder = target.primaryOrder;
  const paymentScopeQuery = target.checkoutGroupId
    ? { checkoutGroupId: target.checkoutGroupId }
    : { order: primaryOrder._id };

  if (idempotencyKey) {
    const existingForKey = await Payment.findOne({
      ...paymentScopeQuery,
      idempotencyKey,
    });
    if (existingForKey) {
      return {
        payment: existingForKey,
        redirectUrl: existingForKey.rawGatewayResponse?.redirectUrl,
        duplicate: true,
      };
    }
  }

  const existingOpenPayment = await Payment.findOne({
    ...paymentScopeQuery,
    status: {
      $in: [PAYMENT_STATUS.CREATED, PAYMENT_STATUS.PENDING],
    },
  }).sort({ createdAt: -1 });

  if (existingOpenPayment && existingOpenPayment.rawGatewayResponse?.redirectUrl) {
    return {
      payment: existingOpenPayment,
      redirectUrl: existingOpenPayment.rawGatewayResponse.redirectUrl,
      duplicate: true,
    };
  }

  const amountPaise = getPayableAmountPaise(target);
  const currency = String(primaryOrder?.paymentBreakdown?.currency || "INR").toUpperCase();
  const attemptCount = (await Payment.countDocuments(paymentScopeQuery)) + 1;
  const merchantOrderId = buildGatewayMerchantOrderId(
    target.checkoutGroupId || target.publicOrderRef || crypto.randomUUID(),
    attemptCount,
  );

  const provider = getActivePaymentProvider();
  const redirectUrl = `${process.env.FRONTEND_URL}/payment-status?merchantOrderId=${merchantOrderId}`;
  const callbackUrl = `${String(process.env.FRONTEND_URL || "").replace(/:(5173|5174)(?=\/|$)/, `:${process.env.PORT || "7000"}`)}/api/payments/webhook/${provider.providerName.toLowerCase()}`;

  const initResult = await provider.initiatePayment({
    merchantOrderId,
    amountPaise,
    redirectUrl,
    callbackUrl,
  });

  const paymentData = {
    order: primaryOrder._id,
    orderIds: target.orders.map((order) => order._id),
    checkoutGroupId: target.checkoutGroupId || null,
    publicOrderId: target.publicOrderRef,
    customer: primaryOrder.customer,
    gatewayName: provider.providerName,
    gatewayOrderId: merchantOrderId,
    gatewayLinkId: initResult.gatewayResponse?.id || null,
    amount: amountPaise,
    currency,
    status: PAYMENT_STATUS.PENDING,
    attemptCount,
    idempotencyKey: idempotencyKey || undefined,
    correlationId,
    rawGatewayResponse: {
      redirectUrl: initResult.redirectUrl,
      merchantOrderId: merchantOrderId,
      linkId: initResult.gatewayResponse?.id || null,
      amount: amountPaise,
    },
    statusHistory: [
      {
        fromStatus: PAYMENT_STATUS.CREATED,
        toStatus: PAYMENT_STATUS.PENDING,
        source: PAYMENT_EVENT_SOURCE.SYSTEM,
        reason: `${provider.providerName} checkout initiated`,
      },
    ],
  };

  const payment = await Payment.create(paymentData);

  logger.info("payment_order_created", {
    correlationId,
    publicOrderId: payment.publicOrderId,
    paymentId: payment._id.toString(),
    gatewayOrderId: payment.gatewayOrderId,
    amount: payment.amount,
    redirectUrl: initResult.redirectUrl,
    provider: provider.providerName,
  });

  return { payment, redirectUrl: initResult.redirectUrl, duplicate: false };
}

export async function verifyPaymentStatus({
  merchantOrderId,
  userId,
  correlationId = null,
}) {
  const payment = await Payment.findOne({ gatewayOrderId: merchantOrderId });
  if (!payment) {
    const err = new Error("Payment attempt not found");
    err.statusCode = 404;
    throw err;
  }

  // Security check: only the owner or admin can verify
  if (userId && String(payment.customer) !== String(userId)) {
      const err = new Error("Not authorized to verify this payment");
      err.statusCode = 403;
      throw err;
  }

  const provider = getActivePaymentProvider();
  const statusResp = await provider.getPaymentStatus({ merchantOrderId });
  const nextStatus = provider.mapStatusToInternal(statusResp.state);
  const reason = `${provider.providerName} status check: ${statusResp.state}`;

  if (statusResp.linkId && !payment.gatewayLinkId) {
    await Payment.updateOne({ _id: payment._id, gatewayLinkId: null }, { $set: { gatewayLinkId: statusResp.linkId } });
  }

  const ev = {
    source: PAYMENT_EVENT_SOURCE.CLIENT_VERIFY,
    reason,
    eventName: "client_verify",
    gatewayPaymentId: statusResp.paymentId || null,
    amountPaise: statusResp.amountPaidPaise ?? null,
    currency: statusResp.currency || null,
  };
  if (nextStatus === PAYMENT_STATUS.CAPTURED) {
    // A payment link only reports "paid" once it is fully paid, so it is safe to capture.
    await handleCaptured(payment, {
      ...ev,
      gatewayPaymentId: statusResp.paymentId || (statusResp.transactionId && /^pay_/.test(statusResp.transactionId) ? statusResp.transactionId : null),
    });
  } else if (nextStatus === PAYMENT_STATUS.CANCELLED || nextStatus === PAYMENT_STATUS.FAILED) {
    await handleLinkClosed(payment, ev);
  }

  const fresh = (await Payment.findById(payment._id)) || payment;
  if (correlationId && !fresh.correlationId) {
    await Payment.updateOne({ _id: fresh._id }, { $set: { correlationId } });
  }
  logger.info("payment_status_verified", {
    correlationId,
    merchantOrderId,
    status: fresh.status,
    provider: provider.providerName,
  });

  return { payment: fresh, status: fresh.status === PAYMENT_STATUS.PENDING ? nextStatus : fresh.status };
}

/* ───────────────────────── webhook processing ───────────────────────── */

/** Find our Payment for a gateway event using every reference we store. */
async function findPaymentForEvent(decoded) {
  const tries = [
    decoded.merchantOrderId && { gatewayOrderId: decoded.merchantOrderId },
    decoded.linkId && { gatewayLinkId: decoded.linkId },
    decoded.razorpayOrderId && { gatewayRazorpayOrderId: decoded.razorpayOrderId },
    decoded.paymentId && { gatewayPaymentId: decoded.paymentId },
  ].filter(Boolean);
  for (const query of tries) {
    const payment = await Payment.findOne(query);
    if (payment) return payment;
  }
  return null;
}

/** Remember gateway ids so later events that carry only one of them still match. */
async function backfillGatewayIds(payment, decoded) {
  const set = {};
  if (decoded.linkId && !payment.gatewayLinkId) set.gatewayLinkId = decoded.linkId;
  if (decoded.razorpayOrderId && !payment.gatewayRazorpayOrderId) set.gatewayRazorpayOrderId = decoded.razorpayOrderId;
  if (Object.keys(set).length) await Payment.updateOne({ _id: payment._id }, { $set: set });
}

async function dispatchWebhookEvent({ provider, decoded, eventId, correlationId }) {
  const isRazorpay = provider.providerName === PAYMENT_GATEWAY.RAZORPAY;
  const kind = decoded.kind || legacyKind(provider.mapStatusToInternal(decoded.state));

  if (kind === WEBHOOK_KIND.QR) {
    // Razorpay Dynamic QR (COD at the doorstep) — idempotent per payment id.
    const { processQrWebhookEvent } = await import("./codQrPaymentService.js");
    const qr = await processQrWebhookEvent({
      event: decoded.eventName,
      payload: decoded.raw?.payload,
      eventId,
    });
    return { eventStatus: qr.handled ? WEBHOOK_EVENT_STATUS.PROCESSED : WEBHOOK_EVENT_STATUS.IGNORED, summary: { qr: true, ...qr } };
  }
  if (kind === WEBHOOK_KIND.IGNORED) {
    return { eventStatus: WEBHOOK_EVENT_STATUS.IGNORED, summary: { ignored: true, reason: `Event ${decoded.eventName || decoded.state} not handled` } };
  }
  if (kind === WEBHOOK_KIND.REFUND) {
    const { processRefundEvent } = await import("./paymentRefundService.js");
    const refund = await processRefundEvent({ decoded, findPayment: findPaymentForEvent });
    return {
      eventStatus: refund.matched ? WEBHOOK_EVENT_STATUS.PROCESSED : WEBHOOK_EVENT_STATUS.UNMATCHED,
      summary: { refund: true, ...refund },
      paymentId: refund.paymentDocId,
      publicOrderId: refund.publicOrderId,
    };
  }

  const payment = await findPaymentForEvent(decoded);
  if (!payment) {
    // Not ours (e.g. a COD cash-deposit order), unless it carries our references:
    // then a customer's money arrived with nothing to attach it to — alert, never drop silently.
    if (kind === WEBHOOK_KIND.CAPTURED && (decoded.hasOurReference || decoded.eventName === "payment_link.paid")) {
      logger.error("payment_captured_unmatched", {
        scope: "paymentService.webhook",
        eventName: decoded.eventName,
        gatewayPaymentId: decoded.paymentId,
        linkId: decoded.linkId,
        merchantOrderId: decoded.merchantOrderId,
        amountPaise: decoded.amountPaise,
      });
      alertAdmins({
        title: "Payment received but not matched",
        message: `Razorpay payment ${decoded.paymentId || "?"} (${decoded.amountPaise != null ? `₹${(decoded.amountPaise / 100).toFixed(2)}` : "amount unknown"}) matches no checkout. Reference: ${decoded.merchantOrderId || decoded.linkId || "none"}.`,
        token: `payment-unmatched:${decoded.paymentId || decoded.linkId || eventId}`,
      });
      return {
        eventStatus: WEBHOOK_EVENT_STATUS.UNMATCHED,
        summary: { accepted: true, ignored: true, reason: "Payment attempt not found" },
      };
    }
    return {
      eventStatus: WEBHOOK_EVENT_STATUS.IGNORED,
      summary: { accepted: true, ignored: true, reason: "Payment attempt not found" },
    };
  }

  await backfillGatewayIds(payment, decoded);
  const ev = {
    source: PAYMENT_EVENT_SOURCE.WEBHOOK,
    reason: `${provider.providerName} webhook: ${decoded.eventName || decoded.state}`,
    eventName: decoded.eventName || decoded.state,
    eventId,
    gatewayPaymentId: decoded.paymentId || (isRazorpay ? null : decoded.transactionId) || null,
    amountPaise: decoded.amountPaise ?? null,
    currency: decoded.currency || null,
    failureReason: decoded.failureReason || null,
  };

  let result;
  if (kind === WEBHOOK_KIND.CAPTURED) result = await handleCaptured(payment, ev);
  else if (kind === WEBHOOK_KIND.ATTEMPT_FAILED) result = await handleAttemptFailed(payment, ev);
  else result = await handleLinkClosed(payment, ev); // LINK_CLOSED

  if (correlationId) {
    await Payment.updateOne({ _id: payment._id, correlationId: null }, { $set: { correlationId } });
  }
  return {
    eventStatus: WEBHOOK_EVENT_STATUS.PROCESSED,
    paymentId: payment._id,
    publicOrderId: payment.publicOrderId,
    summary: {
      duplicate: false,
      outcome: result.outcome,
      paymentStatus: (result.payment || payment).status,
      publicOrderId: payment.publicOrderId,
    },
  };
}

// Providers without the richer decode (PhonePe) report only a state.
function legacyKind(internalStatus) {
  if (internalStatus === PAYMENT_STATUS.CAPTURED) return WEBHOOK_KIND.CAPTURED;
  if (internalStatus === PAYMENT_STATUS.FAILED || internalStatus === PAYMENT_STATUS.CANCELLED) return WEBHOOK_KIND.LINK_CLOSED;
  return WEBHOOK_KIND.IGNORED;
}

export async function processWebhook({
  rawBody,
  authorization,
  correlationId = null,
  webhookEventId = null,
}) {
  const provider = getActivePaymentProvider();

  const isValid = await provider.validateWebhook({ rawBody, authorization });
  if (!isValid) {
    const err = new Error("Invalid webhook signature");
    err.statusCode = 401;
    throw err;
  }

  const decoded = await provider.decodeWebhookPayload({ rawBody });

  const eventId = String(webhookEventId || decoded.eventId || "").trim();
  if (!eventId) {
    const err = new Error("Webhook event id is missing");
    err.statusCode = 400;
    throw err;
  }
  const payloadHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(decoded.raw))
    .digest("hex");

  // Exactly-once processing with retryable failures: an event is only
  // "done" once it has been fully applied. A failed attempt stays FAILED, so
  // the gateway's redelivery re-runs it instead of being swallowed.
  const claim = await claimWebhookEvent({
    eventId,
    gatewayName: provider.providerName,
    eventType: decoded.eventName || decoded.state || "unknown",
    payloadHash,
  });
  if (!claim.claimed) {
    if (claim.reason === "IN_PROGRESS") {
      const err = new Error("Webhook event is being processed; retry shortly");
      err.statusCode = 503;
      throw err;
    }
    return { duplicate: true, accepted: true };
  }

  try {
    const result = await dispatchWebhookEvent({ provider, decoded, eventId, correlationId });
    await completeWebhookEvent(eventId, {
      status: result.eventStatus,
      payment: result.paymentId || null,
      publicOrderId: result.publicOrderId || null,
      note: result.summary?.reason || result.summary?.outcome || null,
    });
    return { accepted: true, duplicate: false, ...result.summary };
  } catch (error) {
    await failWebhookEvent(eventId, error);
    throw error;
  }
}

// Placeholder for generic verifyClientPaymentCallback
export async function verifyClientPaymentCallback(data) {
    return verifyPaymentStatus({
        merchantOrderId: data.gatewayOrderId || data.merchantOrderId,
        userId: data.userId,
        correlationId: data.correlationId
    });
}
