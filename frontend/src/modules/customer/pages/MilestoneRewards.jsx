import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@core/api/axios';
import { toast } from 'sonner';
import { Gift, Lock, Unlock, TrendingUp, ShoppingBag, ArrowRight } from 'lucide-react';
import { ChevronLeft } from 'lucide-react';
import BottomNav from '../components/layout/BottomNav';

const MilestoneRewards = () => {
    const navigate = useNavigate();
    const [progress, setProgress] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProgress();
    }, []);

    const fetchProgress = async () => {
        try {
            const res = await api.get('/customer/milestones/progress');
            setProgress(res.data?.results || []);
        } catch (error) {
            toast.error("Failed to load rewards progress");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 pb-20 flex justify-center items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <div className="bg-[#1A4516] pt-12 pb-6 px-4 text-white flex items-center sticky top-0 z-50 shadow-md">
                <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <h1 className="text-lg font-bold ml-2">My Rewards</h1>
            </div>
            
            <div className="p-4 space-y-6 mt-16 max-w-lg mx-auto">
                <div className="bg-gradient-to-r from-primary to-orange-500 rounded-2xl p-6 text-white shadow-lg">
                    <div className="flex items-center space-x-3 mb-2">
                        <Gift className="w-8 h-8" />
                        <h2 className="text-2xl font-bold">Rewards & Milestones</h2>
                    </div>
                    <p className="text-white/90">Keep shopping to unlock exclusive discounts and wallet cash!</p>
                </div>

                <div className="space-y-4">
                    <h3 className="text-lg font-bold text-gray-900 px-1">Active Goals</h3>
                    
                    {progress.length === 0 ? (
                        <div className="bg-white rounded-xl p-8 text-center shadow-sm">
                            <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <h4 className="text-gray-900 font-medium mb-1">No Active Milestones</h4>
                            <p className="text-gray-500 text-sm">Check back later for new reward opportunities.</p>
                        </div>
                    ) : (
                        progress.map((item) => {
                            const isCompleted = item.isCompleted;
                            const camp = item.campaign;
                            if (!camp) return null; // Defensive check
                            
                            const percent = Math.min(100, Math.round((item.currentProgress / camp.targetValue) * 100));

                            return (
                                <div key={item._id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 relative overflow-hidden">
                                    {isCompleted && (
                                        <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
                                            Unlocked
                                        </div>
                                    )}

                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex-1">
                                            <h4 className="font-bold text-gray-900 mb-1">{camp.name}</h4>
                                            <p className="text-xs text-gray-500">
                                                Reward: {camp.rewardType.replace('_', ' ')}
                                            </p>
                                        </div>
                                        <div className={`p-2 rounded-full ${isCompleted ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                                            {isCompleted ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600 font-medium">Progress</span>
                                            <span className="font-bold text-gray-900">
                                                {item.currentProgress} / {camp.targetValue}
                                            </span>
                                        </div>
                                        <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full rounded-full transition-all duration-1000 ${isCompleted ? 'bg-green-500' : 'bg-primary'}`}
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>
                                    </div>

                                    {isCompleted && item.couponId && (
                                        <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
                                            <div>
                                                <p className="text-xs text-gray-500">Your Coupon Code</p>
                                                <p className="font-mono font-bold text-lg text-primary">{item.couponId.code}</p>
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    navigator.clipboard.writeText(item.couponId.code);
                                                    toast.success("Coupon copied!");
                                                }}
                                                className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                                            >
                                                Copy Code
                                            </button>
                                        </div>
                                    )}
                                    
                                    {!isCompleted && (
                                        <button onClick={() => navigate('/products')} className="mt-4 w-full flex items-center justify-center space-x-2 text-primary text-sm font-medium hover:text-primary-dark transition-colors">
                                            <span>Shop now to unlock</span>
                                            <ArrowRight className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
            
            <BottomNav />
        </div>
    );
};

export default MilestoneRewards;
