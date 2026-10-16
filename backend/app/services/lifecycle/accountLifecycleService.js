import mongoose from "mongoose";
import Customer from "../../models/customer.js";
import Delivery from "../../models/delivery.js";
import Cart from "../../models/cart.js";
import Wishlist from "../../models/wishlist.js";
import PushToken from "../../modules/notifications/token.model.js";
import { NOTIFICATION_ROLES } from "../../modules/notifications/notification.constants.js";
import { clearRiderPresence } from "../firebaseService.js";

function tombstonePhone(userId, phone) {
  const raw = String(phone || "unknown").replace(/\W/g, "");
  return `deleted_${userId}_${raw}`.slice(0, 64);
}

function tombstoneEmail(userId, email) {
  if (!email) return undefined;
  return `deleted_${userId}_${String(email).replace(/[^a-zA-Z0-9@._-]/g, "")}`.slice(0, 120);
}

/**
 * Soft-delete a customer account.
 * - Tombstones the user (deletedAt + isActive=false)
 * - Frees phone/email unique indexes so the number can re-register
 * - Hard-deletes cart, wishlist, push tokens
 * - Never touches Order / Payment / Ledger / Wallet (financial retention)
 */
export async function softDeleteCustomerAccount(userId) {
  const session = await mongoose.startSession();
  try {
    let deleted = false;
    await session.withTransaction(async () => {
      const user = await Customer.findById(userId).session(session);
      if (!user) {
        const err = new Error("Customer not found");
        err.statusCode = 404;
        throw err;
      }
      if (user.deletedAt) {
        deleted = true;
        return;
      }

      user.deletedAt = new Date();
      user.isActive = false;
      user.isVerified = false;
      user.phone = tombstonePhone(user._id, user.phone);
      if (user.email) {
        user.email = tombstoneEmail(user._id, user.email);
      }
      user.otp = undefined;
      user.otpHash = undefined;
      user.otpExpiry = undefined;
      user.otpExpiresAt = undefined;
      await user.save({ session });

      await Cart.deleteOne({ customerId: userId }).session(session);
      await Wishlist.deleteOne({ customerId: userId }).session(session);
      await PushToken.deleteMany({
        userId,
        role: NOTIFICATION_ROLES.CUSTOMER,
      }).session(session);

      deleted = true;
    });
    return { deleted };
  } finally {
    session.endSession();
  }
}

/**
 * Soft-delete a delivery partner account.
 * - Tombstones the rider (deletedAt + isActive=false, offline)
 * - Frees phone unique index
 * - Hard-deletes push tokens; clears Firebase presence
 * - Leaves assignments/orders untouched for financial & ops retention
 */
export async function softDeleteDeliveryAccount(deliveryId) {
  const session = await mongoose.startSession();
  try {
    let deleted = false;
    await session.withTransaction(async () => {
      const rider = await Delivery.findById(deliveryId).session(session);
      if (!rider) {
        const err = new Error("Delivery partner not found");
        err.statusCode = 404;
        throw err;
      }
      if (rider.deletedAt) {
        deleted = true;
        return;
      }

      rider.deletedAt = new Date();
      rider.isActive = false;
      rider.isOnline = false;
      rider.isVerified = false;
      rider.phone = tombstonePhone(rider._id, rider.phone);
      if (rider.email) {
        rider.email = tombstoneEmail(rider._id, rider.email);
      }
      rider.otp = undefined;
      rider.otpExpiry = undefined;
      await rider.save({ session });

      await PushToken.deleteMany({
        userId: deliveryId,
        role: NOTIFICATION_ROLES.DELIVERY,
      }).session(session);

      deleted = true;
    });

    try {
      await clearRiderPresence(String(deliveryId));
    } catch {
      // Best-effort; account is already tombstoned.
    }

    return { deleted };
  } finally {
    session.endSession();
  }
}
