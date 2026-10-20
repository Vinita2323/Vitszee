import Delivery from "../models/delivery.js";
import jwt from "jsonwebtoken";
import handleResponse from "../utils/helper.js";
import { sendSmsIndiaHubOtp } from "../services/smsIndiaHubService.js";
import {
  generateOTP,
  isDefaultTestPhone,
  phoneDigits,
  shouldDispatchSms,
} from "../utils/otp.js";
import { uploadToCloudinary } from "../services/mediaService.js";
import { clearRiderPresence } from "../services/firebaseService.js";

const generateToken = (delivery) =>
    jwt.sign(
        { id: delivery._id, role: "delivery" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );

function normalizeDeliveryPhone(raw) {
    const digits = phoneDigits(raw);
    if (!/^\d{10}$/.test(digits)) {
        const err = new Error("Enter a valid 10-digit mobile number");
        err.statusCode = 400;
        throw err;
    }
    return digits;
}

/** Find by exact 10-digit phone or common +91 / 0-prefixed variants. */
async function findDeliveryByPhone(phone10) {
    return Delivery.findOne({
        $or: [
            { phone: phone10 },
            { phone: `+91${phone10}` },
            { phone: `91${phone10}` },
            { phone: `0${phone10}` },
        ],
    }).select("+otp +otpExpiry");
}

async function dispatchDeliveryOtpSms(phone10, otp) {
    try {
        await sendSmsIndiaHubOtp({ phone: phone10, otp });
    } catch (smsError) {
        console.error("[deliveryAuth] SMS dispatch failed:", {
            phone: phone10.slice(0, 2) + "******" + phone10.slice(-2),
            message: smsError.message,
            providerCode: smsError.providerCode,
        });
        const err = new Error(
            smsError.message || "Failed to send OTP SMS. Please try again.",
        );
        err.statusCode = smsError.statusCode || 502;
        throw err;
    }
}

function otpResponsePayload(phone10, otp) {
    const smsSent = shouldDispatchSms(phone10);
    return {
        phone: phone10,
        smsSent,
        // Only expose OTP when SMS was intentionally skipped (demo / mock).
        ...(!smsSent ? { mockOtp: otp } : {}),
    };
}

/* ===============================
   SIGNUP – Send OTP
================================ */
export const signupDelivery = async (req, res) => {
    try {
        const {
            name, phone: rawPhone, vehicleType,
            email, address, vehicleNumber,
            drivingLicenseNumber,
            accountHolder, accountNumber, ifsc,
            dob, bloodGroup
        } = req.body;

        if (!name || !rawPhone) {
            return handleResponse(res, 400, "Name and phone are required");
        }

        const phone = normalizeDeliveryPhone(rawPhone);
        const normalizedEmail = String(email || "").trim().toLowerCase();

        let delivery = await findDeliveryByPhone(phone);

        if (delivery && delivery.isVerified && !delivery.deletedAt && delivery.isActive !== false) {
            return handleResponse(res, 400, "Delivery partner already exists. Please login.");
        }

        // Soft-deleted / inactive rows should be reused for re-registration.
        if (delivery && (delivery.deletedAt || delivery.isActive === false)) {
            delivery.deletedAt = null;
            delivery.isActive = true;
            delivery.isVerified = false;
        }

        if (normalizedEmail) {
            const emailEscaped = normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const emailOwner = await Delivery.findOne({
                email: { $regex: new RegExp(`^${emailEscaped}$`, "i") },
                ...(delivery?._id ? { _id: { $ne: delivery._id } } : {}),
            }).select("_id phone isVerified");
            if (emailOwner) {
                return handleResponse(
                    res,
                    409,
                    `This email is already registered with phone ending ${String(emailOwner.phone || "").slice(-4)}. Use that number or a different email.`,
                );
            }
        }

        let aadharUrl = delivery?.documents?.aadhar || "";
        let panUrl = delivery?.documents?.pan || "";
        let dlUrl = delivery?.documents?.drivingLicense || "";
        let profileImageUrl = delivery?.profileImage || "";

        // Handle File Uploads via Multer
        if (req.files && Array.isArray(req.files)) {
            for (const file of req.files) {
                if (file.fieldname === "profileImage") {
                    profileImageUrl = await uploadToCloudinary(file.buffer, "delivery/profiles");
                } else if (file.fieldname === "aadhar") {
                    aadharUrl = await uploadToCloudinary(file.buffer, "delivery/documents");
                } else if (file.fieldname === "pan") {
                    panUrl = await uploadToCloudinary(file.buffer, "delivery/documents");
                } else if (file.fieldname === "dl") {
                    dlUrl = await uploadToCloudinary(file.buffer, "delivery/documents");
                }
            }
        }

        const normalizedAadhar = String(req.body?.aadharUrl || req.body?.aadhar || "").trim();
        const normalizedPan = String(req.body?.panUrl || req.body?.pan || "").trim();
        const normalizedDl = String(
          req.body?.drivingLicenseUrl || req.body?.dlUrl || req.body?.dl || "",
        ).trim();
        const normalizedProfileImage = String(req.body?.profileImageUrl || req.body?.profileImage || "").trim();

        if (/^https?:\/\//i.test(normalizedAadhar)) aadharUrl = normalizedAadhar;
        if (/^https?:\/\//i.test(normalizedPan)) panUrl = normalizedPan;
        if (/^https?:\/\//i.test(normalizedDl)) dlUrl = normalizedDl;
        if (/^https?:\/\//i.test(normalizedProfileImage)) profileImageUrl = normalizedProfileImage;

        // Generate OTP after uploads so expiry starts when SMS is about to go out.
        const otp = generateOTP(phone);

        const deliveryData = {
            name,
            phone,
            vehicleType,
            email: normalizedEmail || email,
            address,
            vehicleNumber,
            drivingLicenseNumber,
            accountHolder,
            accountNumber,
            ifsc,
            dob,
            bloodGroup,
            profileImage: profileImageUrl,
            documents: {
                aadhar: aadharUrl,
                pan: panUrl,
                drivingLicense: dlUrl,
            },
            otp,
            otpExpiry: new Date(Date.now() + 5 * 60 * 1000),
            ...(isDefaultTestPhone(phone) ? { isVerified: true } : {}),
        };

        if (!delivery) {
            delivery = await Delivery.create(deliveryData);
        } else {
            Object.assign(delivery, deliveryData);
            await delivery.save();
        }

        if (shouldDispatchSms(phone)) {
            await dispatchDeliveryOtpSms(phone, otp);
        }

        return handleResponse(res, 200, "OTP sent successfully", otpResponsePayload(phone, otp));
    } catch (error) {
        const status = error.statusCode || (error.code === 11000 ? 409 : 500);
        const message =
            error.code === 11000
                ? "A delivery partner with this phone or email already exists"
                : error.message;
        return handleResponse(res, status, message);
    }
};

/* ===============================
   LOGIN – Send OTP
================================ */
export const loginDelivery = async (req, res) => {
    try {
        const { phone: rawPhone } = req.body;

        if (!rawPhone) {
            return handleResponse(res, 400, "Phone number is required");
        }

        const phone = normalizeDeliveryPhone(rawPhone);
        let delivery = await findDeliveryByPhone(phone);

        // Auto-provision the fixed demo delivery partner so login always works.
        if (!delivery && isDefaultTestPhone(phone)) {
            delivery = await Delivery.create({
                name: "Demo Delivery Partner",
                phone,
                vehicleType: "bike",
                isVerified: true,
                isOnline: true,
            });
        }

        if (!delivery) {
            return handleResponse(res, 404, "Delivery partner not found");
        }
        if (delivery.deletedAt || delivery.isActive === false) {
            return handleResponse(res, 403, "This account has been deleted. Please sign up again.");
        }
        if (!delivery.isVerified) {
            if (isDefaultTestPhone(phone)) {
                delivery.isVerified = true;
            } else {
                return handleResponse(res, 403, "Your application is still pending admin approval");
            }
        }

        const otp = generateOTP(phone);

        delivery.phone = phone; // normalize stored phone going forward
        delivery.otp = otp;
        delivery.otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
        await delivery.save();

        if (shouldDispatchSms(phone)) {
            await dispatchDeliveryOtpSms(phone, otp);
        }

        return handleResponse(res, 200, "OTP sent successfully", otpResponsePayload(phone, otp));
    } catch (error) {
        console.error("loginDelivery Error:", error);
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   VERIFY OTP
================================ */
export const verifyDeliveryOTP = async (req, res) => {
    try {
        const { phone: rawPhone, otp } = req.body;

        if (!rawPhone || !otp) {
            return handleResponse(res, 400, "Phone and OTP are required");
        }

        const phone = normalizeDeliveryPhone(rawPhone);
        const code = String(otp || "").trim();

        const delivery = await findDeliveryByPhone(phone);

        if (
            !delivery ||
            String(delivery.otp || "") !== code ||
            !delivery.otpExpiry ||
            new Date(delivery.otpExpiry).getTime() <= Date.now()
        ) {
            return handleResponse(res, 400, "Invalid or expired OTP");
        }

        if (delivery.deletedAt || delivery.isActive === false) {
            return handleResponse(res, 403, "This account has been deleted. Please sign up again.");
        }

        if (!delivery.isVerified) {
            // New signup OTP verification — phone confirmed; wait for admin approval.
            delivery.phone = phone;
            delivery.otp = undefined;
            delivery.otpExpiry = undefined;
            await delivery.save();
            return handleResponse(res, 200, "Phone verified successfully. Waiting for admin approval.", {
                pendingApproval: true,
                phone,
            });
        }

        delivery.phone = phone;
        delivery.isOnline = true; // Auto-activate delivery boy on login
        delivery.otp = undefined;
        delivery.otpExpiry = undefined;
        delivery.lastLogin = new Date();

        await delivery.save();

        const token = generateToken(delivery);

        return handleResponse(res, 200, "Login successful", {
            token,
            delivery,
        });
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   GET PROFILE
================================ */
export const getDeliveryProfile = async (req, res) => {
    try {
        const delivery = await Delivery.findById(req.user.id);
        if (!delivery) {
            return handleResponse(res, 404, "Delivery partner not found");
        }
        if (delivery.deletedAt || delivery.isActive === false) {
            return handleResponse(res, 403, "This account has been deleted");
        }
        return handleResponse(res, 200, "Profile fetched successfully", delivery);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   UPDATE PROFILE
================================ */
export const updateDeliveryProfile = async (req, res) => {
    try {
        const { name, vehicleType, vehicleNumber, drivingLicenseNumber, currentArea, isOnline, accountHolder, accountNumber, ifsc, dob, email, bloodGroup, address } = req.body;

        const delivery = await Delivery.findById(req.user.id);
        if (!delivery) {
            return handleResponse(res, 404, "Delivery partner not found");
        }

        if (name) delivery.name = name;
        if (vehicleType) delivery.vehicleType = vehicleType;
        if (vehicleNumber) delivery.vehicleNumber = vehicleNumber;
        if (drivingLicenseNumber) delivery.drivingLicenseNumber = drivingLicenseNumber;
        if (currentArea) delivery.currentArea = currentArea;
        if (accountHolder) delivery.accountHolder = accountHolder;
        if (accountNumber) delivery.accountNumber = accountNumber;
        if (ifsc) delivery.ifsc = ifsc;
        if (dob) delivery.dob = dob;
        if (email) delivery.email = email;
        if (bloodGroup) delivery.bloodGroup = bloodGroup;
        if (address) delivery.address = address;

        // Capture going-offline transition before the save so we know whether
        // to drop the rider's realtime presence nodes after the write.
        const wasOnline = delivery.isOnline === true;
        const willGoOffline =
            typeof isOnline !== 'undefined' && isOnline === false && wasOnline;
        if (typeof isOnline !== 'undefined') delivery.isOnline = isOnline;

        await delivery.save();

        // Fire-and-forget — never blocks the HTTP response. A failed cleanup
        // is also safe: the scheduled sweep job will pick it up on TTL.
        if (willGoOffline) {
            clearRiderPresence(String(delivery._id)).catch(() => {});
        }

        return handleResponse(res, 200, "Profile updated successfully", delivery);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   DELETE ACCOUNT (self-service)
================================ */
export const deleteDeliveryAccount = async (req, res) => {
    try {
        const { softDeleteDeliveryAccount } = await import(
            "../services/lifecycle/accountLifecycleService.js"
        );
        await softDeleteDeliveryAccount(req.user.id);
        return handleResponse(res, 200, "Account deleted successfully");
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};
