import Seller from "../models/seller.js";
import Transaction from "../models/transaction.js";
import { handleResponse, calculateDistance } from "../utils/helper.js";
import { roundCurrency } from "../utils/money.js";
import mongoose from "mongoose";
import { invalidateSellerName } from "../services/entityNameCache.js";
import Wallet from "../models/wallet.js";

/* ===============================
   GET NEARBY SELLERS
================================ */
export const getNearbySellers = async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return handleResponse(res, 400, "Latitude and longitude are required");
    }

    const customerLat = Number(lat);
    const customerLng = Number(lng);

    // Fetch all active/verified sellers
    // We could use $geoNear, but to strictly follow the requirement of individual radii,
    // we'll fetch sellers within a reasonable max distance (e.g. 100km) and then filter.
    const sellers = await Seller.find({
      isActive: true,
      isVerified: true,
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [customerLng, customerLat],
          },
          $maxDistance: 100000, // 100km max search area for performance
        },
      },
    }).lean();

    // Filter based on individual service radius
    const nearbySellers = sellers.filter((seller) => {
      const sellerLng = seller.location.coordinates[0];
      const sellerLat = seller.location.coordinates[1];
      const distance = calculateDistance(
        customerLat,
        customerLng,
        sellerLat,
        sellerLng,
      );

      // Add distance to seller object for frontend
      seller.distance = distance;

      return distance <= (seller.serviceRadius || 5);
    });

    return handleResponse(
      res,
      200,
      "Nearby sellers fetched successfully",
      nearbySellers,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   REQUEST WITHDRAWAL (Seller)
================================ */
export const requestWithdrawal = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return handleResponse(res, 400, "Please enter a valid amount");
    }

    const wallet = await Wallet.findOne({ ownerId: sellerId, ownerType: "SELLER" });
    if (!wallet) {
      return handleResponse(res, 404, "Wallet not found");
    }

    const availableBalance = wallet.availableBalance;

    if (roundCurrency(amount) > availableBalance) {
      return handleResponse(
        res,
        400,
        `Insufficient balance. Available: ₹${availableBalance}`,
      );
    }

    // 2. Create Withdrawal Transaction
    // Withdrawals have negative amounts per the model comment
    const withdrawal = await Transaction.create({
      user: sellerId,
      userModel: "Seller",
      type: "Withdrawal",
      amount: -Math.abs(amount),
      status: "Pending",
      reference: `WDR-${Date.now()}`,
    });

    // 3. Update Wallet balances
    wallet.availableBalance -= Math.abs(amount);
    wallet.pendingBalance += Math.abs(amount);
    await wallet.save();

    return handleResponse(
      res,
      201,
      "Withdrawal request submitted successfully",
      withdrawal,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET SELLER PROFILE
================================ */
export const getSellerProfile = async (req, res) => {
  try {
    const seller = await Seller.findById(req.user.id);
    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }
    return handleResponse(
      res,
      200,
      "Seller profile fetched successfully",
      seller,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE SELLER PROFILE
================================ */
export const updateSellerProfile = async (req, res) => {
  try {
    const {
      name,
      shopName,
      phone,
      address,
      locality,
      pincode,
      city,
      state,
      lat,
      lng,
      radius,
      serviceRadius,
      isActive,
      dob,
      bankDetails,
    } = req.body;

    // Find seller
    const seller = await Seller.findById(req.user.id);
    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    // Update fields if provided
    if (name) seller.name = name;
    if (shopName) seller.shopName = shopName;
    if (phone) seller.phone = phone;
    if (address !== undefined) seller.address = address;
    if (locality !== undefined) seller.locality = locality;
    if (pincode !== undefined) seller.pincode = pincode;
    if (city !== undefined) seller.city = city;
    if (state !== undefined) seller.state = state;
    if (dob) seller.dob = dob;
    if (isActive !== undefined) seller.isActive = Boolean(isActive);

    if (bankDetails) {
      if (!seller.bankDetails) seller.bankDetails = {};
      if (bankDetails.bankName !== undefined) seller.bankDetails.bankName = bankDetails.bankName;
      if (bankDetails.accountNumber !== undefined) seller.bankDetails.accountNumber = bankDetails.accountNumber;
      if (bankDetails.ifscCode !== undefined) seller.bankDetails.ifscCode = bankDetails.ifscCode;
      if (bankDetails.accountHolderName !== undefined) seller.bankDetails.accountHolderName = bankDetails.accountHolderName;
      seller.markModified('bankDetails');
    }

    // Validate and update geo data
    if (
      lat !== undefined &&
      lat !== null &&
      lat !== "" &&
      lng !== undefined &&
      lng !== null &&
      lng !== ""
    ) {
      const numLat = Number(lat);
      const numLng = Number(lng);
      if (isNaN(numLat) || numLat < -90 || numLat > 90)
        return handleResponse(res, 400, "Invalid latitude");
      if (isNaN(numLng) || numLng < -180 || numLng > 180)
        return handleResponse(res, 400, "Invalid longitude");

      seller.location = {
        type: "Point",
        coordinates: [numLng, numLat],
      };
    }

    // Update service radius (supports both radius and serviceRadius in payload)
    const targetRadius = radius !== undefined ? radius : serviceRadius;
    if (targetRadius !== undefined && targetRadius !== null && targetRadius !== "") {
      const numRadius = Number(targetRadius);
      if (isNaN(numRadius) || numRadius < 1 || numRadius > 100)
        return handleResponse(res, 400, "Radius must be between 1 and 100 km");
      seller.serviceRadius = numRadius;
    }

    const updatedSeller = await seller.save();

    // Invalidate cached seller name in case shopName changed
    invalidateSellerName(req.user.id).catch((err) => {
      console.warn("[Seller] Name cache invalidation failed:", err.message);
    });

    return handleResponse(
      res,
      200,
      "Profile updated successfully",
      updatedSeller,
    );
  } catch (error) {
    // Handle duplicate phone error
    if (error.code === 11000) {
      return handleResponse(res, 400, "Phone number already in use");
    }
    return handleResponse(res, 500, error.message);
  }
};
