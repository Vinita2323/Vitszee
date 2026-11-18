import MilestoneCampaign from "../../models/milestoneCampaign.js";
import handleResponse from "../../utils/helper.js";

// GET all campaigns (Admin)
export const getCampaigns = async (req, res) => {
    try {
        const campaigns = await MilestoneCampaign.find().sort({ createdAt: -1 });
        return handleResponse(res, 200, "Campaigns fetched successfully", campaigns);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// POST create campaign
export const createCampaign = async (req, res) => {
    try {
        const campaign = new MilestoneCampaign(req.body);
        await campaign.save();
        return handleResponse(res, 201, "Campaign created successfully", campaign);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// PUT update campaign
export const updateCampaign = async (req, res) => {
    try {
        const campaign = await MilestoneCampaign.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!campaign) {
            return handleResponse(res, 404, "Campaign not found");
        }
        return handleResponse(res, 200, "Campaign updated successfully", campaign);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// DELETE campaign
export const deleteCampaign = async (req, res) => {
    try {
        const campaign = await MilestoneCampaign.findByIdAndDelete(req.params.id);
        if (!campaign) {
            return handleResponse(res, 404, "Campaign not found");
        }
        return handleResponse(res, 200, "Campaign deleted successfully");
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// GET analytics
export const getAnalytics = async (req, res) => {
    try {
        const totalCampaigns = await MilestoneCampaign.countDocuments();
        const activeCampaigns = await MilestoneCampaign.countDocuments({ status: "active" });
        // Simplified analytics for MVP
        return handleResponse(res, 200, "Analytics fetched", { totalCampaigns, activeCampaigns });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
