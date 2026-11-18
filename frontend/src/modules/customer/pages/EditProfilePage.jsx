import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Phone, Mail, Camera, Save, Calendar } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@core/context/AuthContext';
import { customerApi } from '../services/customerApi';

const EditProfilePage = () => {
    const navigate = useNavigate();
    const { user, login } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: user?.name || '',
        phone: user?.phone || '',
        email: user?.email || '',
        bio: user?.bio || '',
        dob: user?.dob || ''
    });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const response = await customerApi.updateProfile(formData);
            const updatedUser = response.data.result;

            // Update local auth state
            login({ ...user, ...updatedUser });

            toast.success('Profile updated successfully!');
            navigate('/profile');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update profile');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white font-sans pb-10">
            {/* Header */}
            <div className="sticky top-0 z-30 bg-white px-4 pt-5 pb-4 border-b border-slate-100 mb-4 flex items-center gap-3">
                <Link to="/profile" className="flex items-center justify-center p-1 -ml-1">
                    <ArrowLeft size={24} className="text-[#1A4516]" />
                </Link>
                <h1 className="text-[19px] font-bold text-[#1A4516] tracking-tight">Edit Profile</h1>
            </div>

            <div className="max-w-xl mx-auto p-5">

                {/* Profile Picture Upload */}
                <div className="flex flex-col items-center mb-8">
                    <div className="relative">
                        <div className="h-28 w-28 rounded-full bg-[#F5FBF5] border-4 border-white shadow-md flex items-center justify-center overflow-hidden">
                            <User size={48} className="text-[#1A4516]/50" />
                        </div>
                        <button className="absolute bottom-0 right-0 p-2 bg-[#1A4516] text-white rounded-full border-2 border-white shadow-sm hover:bg-[#0a3000] transition-colors">
                            <Camera size={18} />
                        </button>
                    </div>
                    <p className="mt-3 text-sm font-bold text-[#1A4516]">Change Photo</p>
                </div>

                {/* Edit Form */}
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-[#1A4516] uppercase tracking-wider mb-2">Full Name</label>
                            <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-xl border border-slate-200 focus-within:border-[#1A4516] focus-within:ring-4 focus-within:ring-[#1A4516]/10 transition-all">
                                <User size={20} className="text-[#1A4516]" />
                                <input
                                    type="text"
                                    name="name"
                                    maxLength={50}
                                    pattern="[a-zA-Z\s]*"
                                    value={formData.name}
                                    onChange={(e) => {
                                        e.target.value = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                                        handleChange(e);
                                    }}
                                    className="bg-transparent w-full text-slate-800 font-bold outline-none placeholder:font-medium"
                                    placeholder="Enter your name"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#1A4516] uppercase tracking-wider mb-2">Phone Number</label>
                            <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-xl border border-slate-200 focus-within:border-[#1A4516] focus-within:ring-4 focus-within:ring-[#1A4516]/10 transition-all">
                                <Phone size={20} className="text-[#1A4516]" />
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    className="bg-transparent w-full text-slate-800 font-bold outline-none placeholder:font-medium"
                                    placeholder="Enter phone number"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#1A4516] uppercase tracking-wider mb-2">Email Address</label>
                            <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-xl border border-slate-200 focus-within:border-[#1A4516] focus-within:ring-4 focus-within:ring-[#1A4516]/10 transition-all">
                                <Mail size={20} className="text-[#1A4516]" />
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="bg-transparent w-full text-slate-800 font-bold outline-none placeholder:font-medium"
                                    placeholder="Enter email address"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#1A4516] uppercase tracking-wider mb-2">Date of Birth</label>
                            <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-xl border border-slate-200 focus-within:border-[#1A4516] focus-within:ring-4 focus-within:ring-[#1A4516]/10 transition-all">
                                <Calendar size={20} className="text-[#1A4516]" />
                                <input
                                    type="date"
                                    name="dob"
                                    value={formData.dob}
                                    onChange={handleChange}
                                    max={new Date().toISOString().split('T')[0]}
                                    className="bg-transparent w-full text-slate-800 font-bold outline-none placeholder:font-medium"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#1A4516] uppercase tracking-wider mb-2">Bio</label>
                            <textarea
                                name="bio"
                                value={formData.bio}
                                onChange={handleChange}
                                rows="3"
                                className="w-full bg-white px-4 py-3 rounded-xl border border-slate-200 focus:border-[#1A4516] focus:ring-4 focus:ring-[#1A4516]/10 transition-all outline-none text-[#1A4516] font-medium resize-none"
                                placeholder="Tell us about yourself..."
                            ></textarea>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-4 bg-[#1A4516] text-white font-bold rounded-2xl shadow-lg hover:bg-[#0a3000] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isLoading ? (
                            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Save size={20} />
                        )}
                        {isLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                </form>

            </div>
        </div>
    );
};

export default EditProfilePage;

