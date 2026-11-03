import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@core/api/axios';
import { toast } from 'sonner';

const MilestoneCampaigns = () => {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetchCampaigns();
    }, []);

    const fetchCampaigns = async () => {
        try {
            const res = await api.get('/admin/milestone-campaigns');
            setCampaigns(res.data?.results || []);
        } catch (error) {
            toast.error("Failed to load campaigns");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this campaign?")) return;
        try {
            await api.delete(`/admin/milestone-campaigns/${id}`);
            toast.success("Campaign deleted");
            fetchCampaigns();
        } catch (error) {
            toast.error("Failed to delete");
        }
    };

    const handleToggleStatus = async (id, currentStatus) => {
        try {
            const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
            await api.put(`/admin/milestone-campaigns/${id}`, { status: newStatus });
            toast.success(`Campaign marked as ${newStatus}`);
            fetchCampaigns();
        } catch (error) {
            toast.error("Failed to update status");
        }
    };

    if (loading) return <div className="p-6">Loading...</div>;

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Milestone Campaigns</h1>
                <button
                    onClick={() => navigate('/admin/marketing/milestones/create')}
                    className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition-colors"
                >
                    + Create Campaign
                </button>
            </div>

            <div className="bg-white rounded-xl shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trigger</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reward</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {campaigns.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="px-6 py-4 text-center text-gray-500">No campaigns found.</td>
                            </tr>
                        ) : (
                            campaigns.map((camp) => (
                                <tr key={camp._id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {camp.name}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {camp.triggerType.replace('_', ' ')} ({camp.targetValue})
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {camp.rewardType.replace('_', ' ')}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${camp.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                            {camp.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => handleToggleStatus(camp._id, camp.status)}
                                            className="text-indigo-600 hover:text-indigo-900 mr-4"
                                        >
                                            {camp.status === 'active' ? 'Deactivate' : 'Activate'}
                                        </button>
                                        <button
                                            onClick={() => handleDelete(camp._id)}
                                            className="text-red-600 hover:text-red-900"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default MilestoneCampaigns;
