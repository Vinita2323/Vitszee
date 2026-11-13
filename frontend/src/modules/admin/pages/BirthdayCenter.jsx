import React, { useState, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import Button from '@shared/components/ui/Button';
import Badge from '@shared/components/ui/Badge';
import { adminApi } from '../services/adminApi';
import { toast } from 'sonner';
import { HiOutlineGift, HiOutlineChartBar, HiOutlineCheckCircle } from 'react-icons/hi';
import Modal from '@shared/components/ui/Modal';
import Input from '@shared/components/ui/Input';

const BirthdayCenter = () => {
    const [analytics, setAnalytics] = useState(null);
    const [birthdays, setBirthdays] = useState({ customers: [], sellers: [], deliveries: [] });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('customers');
    const [rewardModal, setRewardModal] = useState({ isOpen: false, user: null, role: null });
    const [rewardForm, setRewardForm] = useState({ rewardType: 'wallet_credit', rewardValue: 0, message: '' });

    const fetchData = async () => {
        setLoading(true);
        try {
            const [analyticsRes, birthdaysRes] = await Promise.all([
                adminApi.getBirthdayAnalytics(),
                adminApi.getTodayBirthdays()
            ]);
            
            if (analyticsRes.data.success) {
                setAnalytics(analyticsRes.data.result);
            }
            if (birthdaysRes.data.success) {
                setBirthdays(birthdaysRes.data.result);
            }
        } catch (error) {
            toast.error("Failed to load birthday data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSendReward = async () => {
        try {
            const response = await adminApi.sendBirthdayReward({
                recipientId: rewardModal.user.id,
                role: rewardModal.role,
                rewardType: rewardForm.rewardType,
                rewardValue: rewardForm.rewardValue,
                message: rewardForm.message
            });
            if (response.data.success) {
                toast.success("Reward sent successfully!");
                setRewardModal({ isOpen: false, user: null, role: null });
                fetchData();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to send reward");
        }
    };

    const renderTable = (users, role) => {
        if (!users || users.length === 0) {
            return <div className="p-4 text-center text-gray-500">No {role.toLowerCase()}s have a birthday today.</div>;
        }

        return (
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="p-4 font-medium text-gray-600">Name</th>
                            <th className="p-4 font-medium text-gray-600">Email/Phone</th>
                            <th className="p-4 font-medium text-gray-600">Address</th>
                            <th className="p-4 font-medium text-gray-600">DOB</th>
                            <th className="p-4 font-medium text-gray-600">Status</th>
                            <th className="p-4 font-medium text-gray-600 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {users.map((user) => (
                            <tr key={user.id} className="hover:bg-gray-50/50">
                                <td className="p-4 text-sm font-medium">{user.name}</td>
                                <td className="p-4 text-sm text-gray-600">
                                    {user.email || user.phone}
                                </td>
                                <td className="p-4 text-sm text-gray-600 max-w-[200px] truncate" title={user.address}>
                                    {user.address}
                                </td>
                                <td className="p-4 text-sm text-gray-600">
                                    {user.dob}
                                </td>
                                <td className="p-4">
                                    {user.rewardStatus === 'sent' ? (
                                        <Badge variant="success">Reward Sent</Badge>
                                    ) : (
                                        <Badge variant="warning">Pending</Badge>
                                    )}
                                </td>
                                <td className="p-4 text-right">
                                    <Button 
                                        variant="outline" 
                                        size="sm"
                                        disabled={user.rewardStatus === 'sent'}
                                        onClick={() => {
                                            setRewardModal({ isOpen: true, user, role: user.role });
                                            setRewardForm({ rewardType: 'wallet_credit', rewardValue: 0, message: `Happy Birthday ${user.name}!` });
                                        }}
                                        className="flex items-center gap-1 ml-auto"
                                    >
                                        {user.rewardStatus === 'sent' ? <HiOutlineCheckCircle /> : <HiOutlineGift />}
                                        {user.rewardStatus === 'sent' ? 'Sent' : 'Send Reward'}
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Birthday Center</h1>
                    <p className="text-gray-500 mt-1">Manage and send rewards for user birthdays</p>
                </div>
            </div>

            {/* Analytics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                        <HiOutlineChartBar className="text-xl" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 font-medium">Total Birthdays Today</p>
                        <h3 className="text-2xl font-bold text-gray-900">
                            {(birthdays?.customers?.length || 0) + (birthdays?.sellers?.length || 0) + (birthdays?.deliveries?.length || 0)}
                        </h3>
                    </div>
                </Card>
                <Card className="p-6 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                        <HiOutlineGift className="text-xl" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 font-medium">Rewards Sent ({analytics?.year || new Date().getFullYear()})</p>
                        <h3 className="text-2xl font-bold text-gray-900">
                            {analytics?.totalSent || 0}
                        </h3>
                    </div>
                </Card>
            </div>

            <Card className="overflow-hidden">
                <div className="border-b border-gray-100 p-4">
                    <div className="flex gap-4">
                        {['customers', 'sellers', 'deliveries'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 font-medium text-sm rounded-lg transition-colors ${
                                    activeTab === tab
                                        ? 'bg-primary-50 text-primary-600'
                                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                                }`}
                            >
                                {tab.charAt(0).toUpperCase() + tab.slice(1)} 
                                <span className="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                                    {birthdays[tab]?.length || 0}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading birthdays...</div>
                ) : (
                    renderTable(birthdays[activeTab], activeTab.charAt(0).toUpperCase() + activeTab.slice(1, -1))
                )}
            </Card>

            {/* Reward Modal */}
            <Modal
                isOpen={rewardModal.isOpen}
                onClose={() => setRewardModal({ isOpen: false, user: null, role: null })}
                title={`Send Reward to ${rewardModal.user?.name}`}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reward Type</label>
                        <select 
                            className="w-full border-gray-300 rounded-lg shadow-sm focus:border-primary-500 focus:ring-primary-500"
                            value={rewardForm.rewardType}
                            onChange={(e) => setRewardForm({ ...rewardForm, rewardType: e.target.value })}
                        >
                            <option value="wallet_credit">Wallet Credit</option>
                            <option value="coupon">Coupon (Not automated yet)</option>
                            <option value="custom">Custom Message Only</option>
                        </select>
                    </div>

                    {rewardForm.rewardType === 'wallet_credit' && (
                        <div>
                            <Input
                                label="Amount (₹)"
                                type="number"
                                value={rewardForm.rewardValue}
                                onChange={(e) => setRewardForm({ ...rewardForm, rewardValue: Number(e.target.value) })}
                                min="0"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                        <textarea
                            className="w-full border-gray-300 rounded-lg shadow-sm focus:border-primary-500 focus:ring-primary-500"
                            rows="3"
                            value={rewardForm.message}
                            onChange={(e) => setRewardForm({ ...rewardForm, message: e.target.value })}
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="outline" onClick={() => setRewardModal({ isOpen: false, user: null, role: null })}>
                            Cancel
                        </Button>
                        <Button onClick={handleSendReward}>
                            Send Reward
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default BirthdayCenter;
