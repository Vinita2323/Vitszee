import Delivery from "../../models/delivery.js";
import Order from "../../models/order.js";
import Wallet from "../../models/wallet.js";
import Transaction from "../../models/transaction.js";
import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";

export const getDeliveryPartners = async (req, res) => {
  try {
    const { status, verified, search } = req.query;
    const query = {};

    if (status === "online" || status === "available") {
      query.isOnline = true;
    } else if (status === "offline") {
      query.isOnline = false;
    }

    if (verified === "true") {
      query.isVerified = true;
    } else if (verified === "false") {
      query.isVerified = false;
    }

    if (search && typeof search === "string" && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [{ name: regex }, { phone: regex }, { email: regex }];
    }

    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const [deliveryPartners, total] = await Promise.all([
      Delivery.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Delivery.countDocuments(query),
    ]);

    if (!deliveryPartners || deliveryPartners.length === 0) {
      return handleResponse(res, 200, "Delivery partners fetched successfully", {
        items: [],
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      });
    }

    const partnerIds = deliveryPartners.map((p) => p._id);

    // 1. Wallets for requested partners
    const wallets = await Wallet.find({
      ownerType: "DELIVERY_PARTNER",
      ownerId: { $in: partnerIds },
    })
      .select("ownerId availableBalance cashInHand totalCredited")
      .lean();
    const walletMap = new Map(
      wallets.map((w) => [String(w.ownerId), w])
    );

    // 2. Count delivered orders for requested partners
    const deliveryCounts = await Order.aggregate([
      {
        $match: {
          deliveryBoy: { $in: partnerIds },
          $or: [{ status: "delivered" }, { orderStatus: "delivered" }],
        },
      },
      {
        $group: {
          _id: "$deliveryBoy",
          count: { $sum: 1 },
        },
      },
    ]);
    const deliveriesMap = new Map(
      deliveryCounts.map((d) => [String(d._id), d.count])
    );

    // 3. Today's earnings from settled delivery transactions
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayEarningsAgg = await Transaction.aggregate([
      {
        $match: {
          user: { $in: partnerIds },
          userModel: "Delivery",
          createdAt: { $gte: startOfToday },
          status: "Settled",
          type: { $in: ["Delivery Earning", "Incentive", "Bonus"] },
        },
      },
      {
        $group: {
          _id: "$user",
          total: { $sum: "$amount" },
        },
      },
    ]);
    const todayEarningsMap = new Map(
      todayEarningsAgg.map((t) => [String(t._id), t.total])
    );

    // 4. Fleet Rank calculation across active fleet
    const allPartners = await Delivery.find({ isVerified: true })
      .select("_id averageRating createdAt")
      .lean();

    const allDeliveredOrders = await Order.aggregate([
      {
        $match: {
          deliveryBoy: { $ne: null },
          $or: [{ status: "delivered" }, { orderStatus: "delivered" }],
        },
      },
      {
        $group: {
          _id: "$deliveryBoy",
          count: { $sum: 1 },
        },
      },
    ]);
    const allDeliveredMap = new Map(
      allDeliveredOrders.map((d) => [String(d._id), d.count])
    );

    const rankedFleet = allPartners
      .map((p) => ({
        id: String(p._id),
        deliveries: allDeliveredMap.get(String(p._id)) || 0,
        rating: typeof p.averageRating === "number" ? p.averageRating : 0,
        createdAt: p.createdAt ? new Date(p.createdAt).getTime() : 0,
      }))
      .sort((a, b) => {
        if (b.deliveries !== a.deliveries) return b.deliveries - a.deliveries;
        if (b.rating !== a.rating) return b.rating - a.rating;
        return a.createdAt - b.createdAt;
      });

    const fleetRankMap = new Map(
      rankedFleet.map((item, index) => [item.id, index + 1])
    );

    // Enrich items
    const enrichedPartners = deliveryPartners.map((partner) => {
      const idStr = String(partner._id);
      const wallet = walletMap.get(idStr);
      const totalDeliveries = deliveriesMap.get(idStr) || 0;
      const todayEarnings = todayEarningsMap.get(idStr) || 0;
      const rankNum = fleetRankMap.get(idStr);

      return {
        ...partner,
        totalDeliveries,
        totalOrders: totalDeliveries,
        walletBalance: wallet?.availableBalance || 0,
        walletCreds: wallet?.availableBalance || 0,
        cashInHand: wallet?.cashInHand || 0,
        todayEarnings,
        fleetRank: rankNum ? `#${rankNum}` : "N/A",
        fleetRankNumber: rankNum || null,
        rating: typeof partner.averageRating === "number" ? partner.averageRating : 0,
        totalReviews: partner.totalReviews || 0,
      };
    });

    return handleResponse(res, 200, "Delivery partners fetched successfully", {
      items: enrichedPartners,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      phone,
      email,
      vehicle,
      vehicleType,
      vehicleNum,
      vehicleNumber,
      currentArea,
      address,
      drivingLicenseNumber,
      isOnline,
    } = req.body;

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (phone) updateData.phone = phone.trim();
    if (email !== undefined) updateData.email = email.trim();
    if (vehicleType || vehicle) updateData.vehicleType = (vehicleType || vehicle).toLowerCase();
    if (vehicleNumber || vehicleNum) updateData.vehicleNumber = (vehicleNumber || vehicleNum).trim();
    if (currentArea) updateData.currentArea = currentArea.trim();
    if (address !== undefined) updateData.address = address.trim();
    if (drivingLicenseNumber) updateData.drivingLicenseNumber = drivingLicenseNumber.trim();
    if (typeof isOnline === "boolean") updateData.isOnline = isOnline;

    const rider = await Delivery.findByIdAndUpdate(id, updateData, { new: true });
    if (!rider) {
      return handleResponse(res, 404, "Rider not found");
    }

    return handleResponse(res, 200, "Rider updated successfully", rider);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const approveDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await Delivery.findByIdAndUpdate(
      id,
      { isVerified: true, isOnline: true },
      { new: true },
    );

    if (!rider) {
      return handleResponse(res, 404, "Rider not found");
    }

    // Auto-initialize wallet if it does not exist
    const existingWallet = await Wallet.findOne({
      ownerType: "DELIVERY_PARTNER",
      ownerId: rider._id,
    });
    if (!existingWallet) {
      await Wallet.create({
        ownerType: "DELIVERY_PARTNER",
        ownerId: rider._id,
        availableBalance: 0,
        pendingBalance: 0,
        cashInHand: 0,
        currency: "INR",
        status: "ACTIVE",
      });
    }

    return handleResponse(res, 200, "Rider approved successfully", rider);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const rejectDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await Delivery.findByIdAndDelete(id);

    if (!rider) {
      return handleResponse(res, 404, "Rider not found");
    }

    return handleResponse(
      res,
      200,
      "Rider application rejected and removed",
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getActiveFleet = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const query = {
      deliveryBoy: { $ne: null },
      status: {
        $in: ["confirmed", "packed", "shipped", "out_for_delivery"],
      },
    };

    const [activeOrders, total] = await Promise.all([
      Order.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("deliveryBoy", "name phone documents vehicleType")
        .populate("seller", "shopName address name")
        .populate("customer", "name phone")
        .lean(),
      Order.countDocuments(query),
    ]);

    const fleetData = activeOrders.map((order) => ({
      id: order.orderId,
      status:
        order.status === "out_for_delivery"
          ? "On the Way"
          : order.status === "packed"
            ? "At Pickup"
            : order.status === "shipped"
              ? "In Transit"
              : "Assigned",
      deliveryBoy: {
        name: order.deliveryBoy?.name || "Unknown",
        phone: order.deliveryBoy?.phone || "N/A",
        id: order.deliveryBoy?._id || "N/A",
        vehicle: order.deliveryBoy?.vehicleType || "N/A",
        image:
          order.deliveryBoy?.documents?.profileImage ||
          "https://via.placeholder.com/200",
      },
      seller: {
        name: order.seller?.shopName || order.seller?.name || "Unknown",
      },
      customer: {
        name: order.customer?.name || "Guest",
        phone: order.customer?.phone || "N/A",
      },
      lastUpdate: order.updatedAt,
    }));

    return handleResponse(res, 200, "Active fleet fetched successfully", {
      items: fleetData,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
