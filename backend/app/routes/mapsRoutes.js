import express from "express";
import { geocodeAddressController } from "../controller/mapsController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { mapsRateLimit } from "../middleware/mapsRateLimit.js";
import { validate } from "../middleware/validate.js";
import { geocodeQuerySchema, reverseGeocodeQuerySchema } from "../validation/mapsValidation.js";

const router = express.Router();

router.get(
    "/geocode",
    verifyToken,
    mapsRateLimit,
    validate(geocodeQuerySchema, "query"),
    geocodeAddressController,
);

router.get(
    "/reverse-geocode",
    verifyToken,
    mapsRateLimit,
    validate(reverseGeocodeQuerySchema, "query"),
    geocodeAddressController,
);

export default router;
