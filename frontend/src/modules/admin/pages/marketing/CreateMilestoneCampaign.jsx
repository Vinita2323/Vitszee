import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@core/api/axios';
import { toast } from 'sonner';

const CreateMilestoneCampaign = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    
    const [formData, setFormData] = useState({
        name: '',
        triggerType: 'total_orders',
        targetValue: 5,
        rewardType: 'percentage_discount',
        discountValue: 10,
        maxDiscount: 100,
        minOrderValue: 500,
        walletAmount: 0,
        validityDays: 30,
        status: 'active'
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: ['targetValue', 'discountValue', 'maxDiscount', 'minOrderValue', 'walletAmount', 'validityDays'].includes(name) ? Number(value) : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const payload = {
                name: formData.name,
                triggerType: formData.triggerType,
                targetValue: formData.targetValue,
                rewardType: formData.rewardType,
                status: formData.status
            };

            if (formData.rewardType === 'wallet_credit') {
                payload.walletConfig = { amount: formData.walletAmount };
            } else {
                payload.couponConfig = {
                    discountValue: formData.discountValue,
                    maxDiscount: formData.maxDiscount,
                    minOrderValue: formData.minOrderValue,
                    validityDays: formData.validityDays
                };
            }

            await api.post('/admin/milestone-campaigns', payload);
            toast.success("Campaign created successfully!");
            navigate('/admin/marketing/milestones');
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to create campaign");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Create Milestone Campaign</h1>
                <button
                    onClick={() => navigate('/admin/marketing/milestones')}
                    className="text-gray-600 hover:text-gray-900"
                >
                    Cancel
                </button>
            </div>

            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 space-y-6">
                
                {/* Basic Info */}
                <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4 border-b pb-2">Basic Info</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
                            <input
                                type="text"
                                name="name"
                                required
                                value={formData.name}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                                placeholder="e.g. 5 Orders Milestone"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Type</label>
                            <select
                                name="triggerType"
                                value={formData.triggerType}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                            >
                                <option value="total_orders">Total Orders</option>
                                <option value="total_products">Total Products</option>
                                <option value="total_spending">Total Spending</option>
                                <option value="first_order">First Order</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Target Value</label>
                            <input
                                type="number"
                                name="targetValue"
                                required
                                min="1"
                                value={formData.targetValue}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                            />
                        </div>
                    </div>
                </div>

                {/* Reward Config */}
                <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4 border-b pb-2">Reward Configuration</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Reward Type</label>
                            <select
                                name="rewardType"
                                value={formData.rewardType}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                            >
                                <option value="percentage_discount">Percentage Discount Coupon</option>
                                <option value="flat_discount">Flat Discount Coupon</option>
                                <option value="free_delivery">Free Delivery Coupon</option>
                                <option value="wallet_credit">Wallet Credit</option>
                            </select>
                        </div>

                        {formData.rewardType === 'wallet_credit' ? (
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Wallet Amount (₹)</label>
                                <input
                                    type="number"
                                    name="walletAmount"
                                    required
                                    min="1"
                                    value={formData.walletAmount}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                                />
                            </div>
                        ) : (
                            <>
                                {formData.rewardType !== 'free_delivery' && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Discount Value</label>
                                        <input
                                            type="number"
                                            name="discountValue"
                                            required
                                            min="1"
                                            value={formData.discountValue}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                                        />
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Discount (₹)</label>
                                    <input
                                        type="number"
                                        name="maxDiscount"
                                        value={formData.maxDiscount}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Min Order Value (₹)</label>
                                    <input
                                        type="number"
                                        name="minOrderValue"
                                        value={formData.minOrderValue}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Coupon Validity (Days)</label>
                                    <input
                                        type="number"
                                        name="validityDays"
                                        value={formData.validityDays}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="pt-4 border-t flex justify-end">
                    <button
                        type="submit"
                        disabled={loading}
                        className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Creating...' : 'Create Campaign'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateMilestoneCampaign;
