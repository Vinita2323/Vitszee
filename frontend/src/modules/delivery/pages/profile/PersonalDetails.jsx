import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, User, Mail, Phone, MapPin, Calendar, Droplet, Camera, Loader2 } from "lucide-react";
import { useAuth } from "@core/context/AuthContext";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { toast } from "sonner";
import { deliveryApi } from "../../services/deliveryApi";
import DeliveryAvatar from "../../components/DeliveryAvatar";

const PersonalDetails = () => {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const fileInputRef = useRef(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    dob: "",
    bloodGroup: "",
    id: "",
    profileImage: "",
  });

  React.useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await deliveryApi.getProfile();
      if (res.data.success || res.data.result) {
        const user = res.data.result || {};
        setFormData({
          name: user.name || "",
          phone: user.phone || "",
          email: user.email || "",
          address: user.address || "",
          dob: user.dob || "",
          bloodGroup: user.bloodGroup || "",
          id: user._id || "",
          profileImage: user.profileImage || "",
        });
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to fetch profile");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await deliveryApi.updateProfile({
        name: formData.name,
        email: formData.email,
        address: formData.address,
        dob: formData.dob,
        bloodGroup: formData.bloodGroup,
      });
      setIsEditing(false);
      toast.success("Personal details updated successfully!");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update profile");
    }
  };

  const handlePhotoSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }
    setUploadingPhoto(true);
    try {
      const res = await deliveryApi.uploadProfileImage(file);
      const url = res.data?.result?.profileImage;
      if (url) setFormData((prev) => ({ ...prev, profileImage: url }));
      refreshUser?.();
      toast.success("Profile photo updated");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <div className="bg-white min-h-screen pb-28 relative overflow-hidden font-sans">
      
      {/* Brand Blue Header Banner */}
      <div className="bg-gradient-to-br from-[#09356E] via-[#0057B7] to-[#004494] text-white pt-4 pb-12 px-6 relative">
        <div className="flex items-center">
          <button 
            onClick={() => navigate(-1)} 
            className="p-2 rounded-full hover:bg-white/10 transition-colors mr-2 cursor-pointer"
            aria-label="Go Back"
          >
            <ArrowLeft size={18} className="text-white" />
          </button>
          <h1 className="text-lg font-black leading-tight tracking-tight">Personal Details</h1>
          <div className="ml-auto">
            {isEditing ? (
              <button 
                onClick={handleSave} 
                className="h-8 px-4 rounded-full bg-white text-[#0057B7] text-xs font-black hover:bg-gray-100 transition-colors cursor-pointer shadow-sm flex items-center gap-1"
              >
                <Save size={12} /> Save
              </button>
            ) : (
              <button 
                onClick={() => setIsEditing(true)} 
                className="h-8 px-4 rounded-full bg-white/10 border border-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area overlapping with rounded corners */}
      <div className="bg-white rounded-t-[32px] -mt-5 pt-3 px-5 space-y-4 relative z-10">
        
        {/* Profile Photo */}
        <div className="flex flex-col items-center justify-center py-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full p-0.5 bg-white shadow-md overflow-hidden">
              <DeliveryAvatar
                user={{
                  name: formData.name,
                  phone: formData.phone,
                  profileImage: formData.profileImage,
                }}
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoSelected}
            />
            {isEditing && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                aria-label="Change profile photo"
                className="absolute bottom-0 right-0 bg-[#0057B7] text-white p-1.5 rounded-full shadow-md hover:bg-[#004899] transition-colors cursor-pointer disabled:opacity-60"
              >
                {uploadingPhoto ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Camera size={12} />
                )}
              </button>
            )}
          </div>
          <p className="mt-2.5 text-[11px] font-bold text-gray-400">Delivery Partner ID: {formData.id ? formData.id.substring(0, 6).toUpperCase() : ""}</p>
        </div>

        {/* Form Fields */}
        <div className="space-y-3.5 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <Input
            label="Full Name"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            readOnly={!isEditing} 
            icon={User}
            className={!isEditing ? "bg-gray-50/60 border-transparent text-gray-700" : "focus:ring-[#0057B7]/15 focus:border-[#0057B7]"}
          />
          
          <Input
            label="Phone Number"
            value={formData.phone}
            readOnly={true} 
            icon={Phone}
            className="bg-gray-50 border-transparent text-gray-400"
            helperText="Contact support to change phone number"
          />

          <Input
            label="Email Address"
            value={formData.email}
            readOnly={!isEditing}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            icon={Mail}
            type="email"
            className={!isEditing ? "bg-gray-50/60 border-transparent text-gray-700" : "focus:ring-[#0057B7]/15 focus:border-[#0057B7]"}
          />

          <div className="relative">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 ml-1">Current Address</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <MapPin size={16} />
              </div>
              <textarea
                value={formData.address}
                readOnly={!isEditing}
                onChange={(e) => setFormData({...formData, address: e.target.value})}
                className={`w-full pl-9 pr-4 py-2 rounded-xl text-xs border outline-none transition-all resize-none ${
                  !isEditing 
                    ? "bg-gray-50/60 border-transparent text-gray-700" 
                    : "bg-white border-gray-200 focus:ring-2 focus:ring-[#0057B7]/15 focus:border-[#0057B7]"
                }`}
                rows={2}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <Input
              label="Date of Birth"
              value={formData.dob ? String(formData.dob).slice(0, 10) : ""}
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              onFocus={(e) =>
                // Native date popup opens below the field; bring the field
                // near the top so the calendar isn't clipped by the screen edge.
                e.currentTarget.scrollIntoView({ block: "start", behavior: "smooth" })
              }
              readOnly={!isEditing}
              onChange={(e) => setFormData({...formData, dob: e.target.value})}
              icon={Calendar}
              className={!isEditing ? "bg-gray-50 border-transparent text-gray-400" : "focus:ring-[#0057B7]/15 focus:border-[#0057B7]"}
            />
            <Input
              label="Blood Group"
              value={formData.bloodGroup}
              readOnly={!isEditing}
              onChange={(e) => setFormData({...formData, bloodGroup: e.target.value})}
              icon={Droplet}
              className={!isEditing ? "bg-gray-50/60 border-transparent text-gray-700" : "focus:ring-[#0057B7]/15 focus:border-[#0057B7]"}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersonalDetails;
