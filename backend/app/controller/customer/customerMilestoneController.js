import CustomerMilestoneProgress from "../../models/customerMilestoneProgress.js";
import MilestoneCampaign from "../../models/milestoneCampaign.js";
import handleResponse from "../../utils/helper.js";
import { evaluateCustomerMilestones } from "../../services/milestoneEvaluatorService.js";

// GET my progress
export const getMyMilestoneProgress = async (req, res) => {
    try {
        const customerId = req.user.id;
        
        // Ensure progress documents exist for all active campaigns
        const activeCampaigns = await MilestoneCampaign.find({ status: "active" });
        for (const campaign of activeCampaigns) {
            await CustomerMilestoneProgress.updateOne(
                { customer: customerId, campaign: campaign._id },
                { $setOnInsert: { customer: customerId, campaign: campaign._id, currentProgress: 0 } },
                { upsert: true }
            );
        }

        // Evaluate milestones on the fly to grant retroactive rewards instantly
        await evaluateCustomerMilestones(customerId, null);

        const progress = await CustomerMilestoneProgress.find({ customer: customerId })
            .populate("campaign")
            .populate("couponId");
            
        return handleResponse(res, 200, "Progress fetched", progress);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
