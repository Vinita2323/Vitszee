import Customer from "../../models/customer.js";
import Seller from "../../models/seller.js";
import Delivery from "../../models/delivery.js";
import BirthdayRewardHistory from "../../models/birthdayRewardHistory.js";
import handleResponse from "../../utils/helper.js";
import { creditWallet } from "../../services/finance/walletService.js";
import { emitNotificationEvent } from "../../modules/notifications/notification.service.js";
import { NOTIFICATION_EVENTS } from "../../modules/notifications/notification.constants.js";
import { OWNER_TYPE } from "../../constants/finance.js";

// Helper to get today's month-day suffix
const getTodaySuffix = () => {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `-${mm}-${dd}`;
};

export const getTodayBirthdays = async (req, res) => {
    try {
        const suffix = getTodaySuffix();
        const year = new Date().getFullYear();
        const regex = new RegExp(`${suffix}$`);

        const [customers, sellers, deliveries, histories] = await Promise.all([
            Customer.find({ dob: { $regex: regex } }, 'name email phone dob createdAt address').lean(),
            Seller.find({ dob: { $regex: regex } }, 'name email phone dob createdAt address').lean(),
            Delivery.find({ dob: { $regex: regex } }, 'name email phone dob createdAt address').lean(),
            BirthdayRewardHistory.find({ year }).lean()
        ]);

        const historyMap = new Map(histories.map(h => [`${h.recipientId}-${h.role.toLowerCase()}`, h]));

        const formatUser = (u, role) => {
            const h = historyMap.get(`${u._id}-${role.toLowerCase()}`);
            return {
                id: u._id,
                name: u.name,
                email: u.email,
                phone: u.phone,
                dob: u.dob,
                address: u.address || 'N/A',
                registrationDate: u.createdAt,
                role: role,
                rewardStatus: h ? 'sent' : 'pending',
                rewardDetails: h || null
            };
        };

        const results = {
            customers: customers.map(c => formatUser(c, 'Customer')),
            sellers: sellers.map(s => formatUser(s, 'Seller')),
            deliveries: deliveries.map(d => formatUser(d, 'Delivery'))
        };

        return handleResponse(res, 200, "Today's birthdays fetched successfully", results);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const sendReward = async (req, res) => {
    try {
        const { recipientId, role, rewardType, rewardValue, message } = req.body;
        const adminId = req.user.id;
        const year = new Date().getFullYear();

        if (!recipientId || !role || !rewardType) {
            return handleResponse(res, 400, "recipientId, role, and rewardType are required");
        }

        // Check for duplicate
        const existing = await BirthdayRewardHistory.findOne({ recipientId, role, year });
        if (existing) {
            return handleResponse(res, 400, "Reward already sent to this user this year");
        }

        // Process reward
        if (rewardType === 'wallet_credit' && rewardValue > 0) {
            let ownerType;
            if (role === 'Customer') ownerType = OWNER_TYPE.CUSTOMER;
            else if (role === 'Seller') ownerType = OWNER_TYPE.SELLER;
            else if (role === 'Delivery') ownerType = OWNER_TYPE.DELIVERY_PARTNER;

            await creditWallet({
                ownerType,
                ownerId: recipientId,
                amount: rewardValue,
                ledgerDescription: `Birthday Wallet Credit: ${message || 'Happy Birthday!'}`,
            });
        }
        // If other reward types like coupon, we could generate a coupon here using couponService
        // For now, wallet_credit and custom_reward are handled.

        // Record history
        const history = await BirthdayRewardHistory.create({
            recipientId,
            role,
            rewardType,
            rewardValue,
            message,
            sentBy: adminId,
            year
        });

        // Send Notification
        const notificationPayload = {
            title: "Happy Birthday!",
            message: message || "Wishing you a very Happy Birthday from Vitzee Market!",
            userId: recipientId
        };

        let recipientRole = NOTIFICATION_ROLES.CUSTOMER;
        if (role === 'Seller') recipientRole = NOTIFICATION_ROLES.SELLER;
        if (role === 'Delivery') recipientRole = NOTIFICATION_ROLES.DELIVERY;

        emitNotificationEvent(NOTIFICATION_EVENTS.BIRTHDAY_REWARD, {
            ...notificationPayload,
            role: recipientRole
        });

        return handleResponse(res, 200, "Reward sent successfully", history);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const getBirthdayAnalytics = async (req, res) => {
    try {
        const year = new Date().getFullYear();
        
        // Simple aggregate for this year
        const stats = await BirthdayRewardHistory.aggregate([
            { $match: { year } },
            { $group: { _id: "$rewardType", count: { $sum: 1 }, totalValue: { $sum: "$rewardValue" } } }
        ]);

        const totalSent = stats.reduce((acc, curr) => acc + curr.count, 0);
        
        return handleResponse(res, 200, "Birthday analytics fetched", { stats, totalSent, year });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
