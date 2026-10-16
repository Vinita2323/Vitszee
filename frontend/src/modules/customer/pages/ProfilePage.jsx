import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    User, MapPin, Package, ChevronRight,
    LogOut, Heart, HelpCircle, Bell, Users, Settings, Edit2, Gift, Trash2
} from 'lucide-react';
import { useAuth } from '@core/context/AuthContext';
import { useSettings } from '@core/context/SettingsContext';
import { customerApi } from '../services/customerApi';
import { toast } from 'sonner';

const ProfilePage = () => {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { settings } = useSettings();
    const appName = settings?.appName || 'App';
    const [deleting, setDeleting] = useState(false);

    const formatIndiaPhone = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (raw.startsWith('+91')) return raw.replace(/^\+91[\s-]*/, '');
        if (raw.startsWith('91') && raw.length >= 12) return raw.replace(/^91[\s-]*/, '');
        return raw;
    };

    const handleDeleteAccount = async () => {
        const confirmed = window.confirm(
            'Delete your account permanently? This cannot be undone. Your orders will be retained for records, but you will be signed out and cannot log in with this account again.',
        );
        if (!confirmed) return;

        setDeleting(true);
        try {
            await customerApi.deleteAccount();
            toast.success('Account deleted');
            await logout();
        } catch (error) {
            const message =
                error?.response?.data?.message ||
                error?.message ||
                'Failed to delete account';
            toast.error(message);
            setDeleting(false);
        }
    };

    return (
        <div className="min-h-screen bg-white font-sans pb-20">
            {/* Top Green Header */}
            <div className="bg-[#1A4516] pt-12 pb-20 px-6 text-white relative">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1 min-w-0 pr-2">
                        <div className="h-16 w-16 rounded-full bg-white/20 p-1 shrink-0">
                            <div className="h-full w-full rounded-full bg-white flex items-center justify-center overflow-hidden text-[#1A4516]">
                                <User size={28} />
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-[17px] leading-tight font-bold tracking-tight flex items-center flex-wrap gap-1">
                                Hi, {user?.name || 'Customer'} <span>👋</span>
                            </h2>
                            <p className="text-white/80 text-sm mt-0.5 font-medium truncate">{formatIndiaPhone(user?.phone) || '98765 43210'}</p>
                        </div>
                    </div>
                    <Link to="/profile/edit" className="text-white hover:bg-white/10 p-2 rounded-full transition-colors shrink-0">
                        <Edit2 size={22} />
                    </Link>
                </div>
            </div>

            {/* Overlapping White Container */}
            <div className="bg-white rounded-t-[2.5rem] px-5 pt-8 pb-12 -mt-10 relative z-20 min-h-screen shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
                <div className="max-w-2xl mx-auto">
                    <div className="px-2 mb-4">
                        <h3 className="font-extrabold text-[#1A4516] text-lg">My Account</h3>
                    </div>
                    <div className="space-y-1">
                        <MenuItem icon={Package} label="My Orders" path="/orders" />
                        <MenuItem icon={MapPin} label="My Addresses" path="/addresses" />
                        {/* Wallet temporarily disabled
                        <MenuItem icon={Wallet} label="My Wallet" rightText={`₹${user?.walletBalance || 0}`} path="/wallet" />
                        */}
                        <MenuItem icon={Gift} label="My Rewards" path="/rewards" />
                        <MenuItem icon={Heart} label="My Wishlist" path="/wishlist" />
                        <MenuItem icon={Users} label="Refer & Earn" />
                        <MenuItem icon={Bell} label="Notifications" />
                        <MenuItem icon={HelpCircle} label="Help & Support" path="/support" />
                        <MenuItem icon={Settings} label="Settings" path="/settings" />
                        <MenuItem icon={LogOut} label="Logout" onClick={logout} />
                        <MenuItem
                            icon={Trash2}
                            label={deleting ? 'Deleting…' : 'Delete Account'}
                            onClick={deleting ? undefined : handleDeleteAccount}
                            danger
                        />
                    </div>
                
                    <div className="text-center pt-8 pb-4">
                        <p className="text-xs text-slate-400 font-medium">Version 2.4.0 - {appName}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const MenuItem = ({ icon: Icon, label, rightText, onClick, path, danger }) => {
    const content = (
        <div className={`flex items-center justify-between py-3.5 px-4 rounded-2xl transition-colors cursor-pointer group ${danger ? 'hover:bg-red-50' : 'hover:bg-[#F5FBF5]'}`}>
            <div className="flex items-center gap-4">
                <Icon size={20} className={danger ? 'text-red-500' : 'text-slate-500 group-hover:text-[#1A4516] transition-colors'} />
                <span className={`text-sm font-bold transition-colors ${danger ? 'text-red-600' : 'text-slate-700 group-hover:text-[#1A4516]'}`}>{label}</span>
            </div>
            <div className="flex items-center gap-2">
                {rightText && <span className="text-sm font-black text-[#1A4516]">{rightText}</span>}
                <ChevronRight size={18} className={`transition-all ${danger ? 'text-red-300' : 'text-slate-300 group-hover:translate-x-0.5 group-hover:text-[#1A4516]'}`} />
            </div>
        </div>
    );

    if (path) {
        return <Link to={path} className="block">{content}</Link>;
    }
    
    return <div onClick={onClick} className="block">{content}</div>;
};

export default ProfilePage;
