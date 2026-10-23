import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Truck, ShieldCheck, FileText, AlertCircle } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";

const VehicleInfo = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSettings();
  const appName = settings?.appName || "App";

  const vehicleDetails = {
    type: user?.vehicleType || "Not Specified",
    model: "N/A", // We don't have vehicle model in backend yet
    plateNumber: user?.vehicleNumber || "Not Assigned",
    color: "N/A",
    fuelType: "N/A",
  };

  const documents = [
    {
      title: "Driving License",
      number: user?.drivingLicenseNumber || "Not Available",
      expiry: "N/A",
      status: "Verified",
    },
    {
      title: "RC Book",
      number: user?.vehicleNumber || "Not Assigned",
      expiry: "Valid Forever",
      status: "Verified",
    },
  ];

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
          <h1 className="text-lg font-black leading-tight tracking-tight">Vehicle Information</h1>
        </div>
      </div>

      {/* Main Content Area overlapping with rounded corners */}
      <div className="bg-white rounded-t-[32px] -mt-5 pt-4 px-5 space-y-4 relative z-10">
        
        {/* Vehicle Card */}
        <Card className="p-4 bg-gradient-to-br from-[#09356E] via-[#0057B7] to-[#004494] text-white border-none shadow-md rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-6 -mt-6 blur-xl" />
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div>
              <p className="text-white/50 text-[9px] uppercase tracking-wider font-bold mb-0.5">Vehicle Plate Number</p>
              <h3 className="text-xl font-black tracking-wide">{vehicleDetails.plateNumber}</h3>
              <p className="text-xs text-white/70 mt-0.5">{vehicleDetails.type.toUpperCase()}</p>
            </div>
            <div className="bg-white/10 p-2 rounded-full backdrop-blur-sm">
              <Truck size={18} className="text-white" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/10 relative z-10">
            <div>
              <p className="text-white/40 text-[9px] uppercase font-bold tracking-wider">Color</p>
              <p className="text-xs font-semibold mt-0.5">{vehicleDetails.color}</p>
            </div>
            <div>
              <p className="text-white/40 text-[9px] uppercase font-bold tracking-wider">Fuel Type</p>
              <p className="text-xs font-semibold mt-0.5">{vehicleDetails.fuelType}</p>
            </div>
          </div>
        </Card>

        {/* Documents List */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider px-1">Vehicle Documents</h3>
          <div className="space-y-2.5">
            {documents.map((doc, index) => (
              <Card key={index} className="p-3 border border-gray-100 bg-white rounded-xl shadow-sm">
                <div className="flex justify-between items-center">
                  <div className="flex items-center min-w-0">
                    <div className="p-2 rounded-lg mr-2.5 bg-[#0057B7]/10 text-[#0057B7] shrink-0">
                      <FileText size={16} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-gray-800 text-xs truncate">{doc.title}</h4>
                      <p className="text-[10px] text-gray-500 mt-0.5 truncate">{doc.number}</p>
                      <p className="text-[9px] text-gray-400 mt-0.5 font-medium">
                        Expires: {doc.expiry}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0 border border-emerald-100/30">
                    <ShieldCheck size={11} className="mr-0.5" /> Verified
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-[#0057B7]/5 border border-[#0057B7]/15 p-3.5 rounded-xl flex items-start">
          <AlertCircle size={16} className="text-[#0057B7] mr-2.5 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[#0057B7] font-medium leading-relaxed">
            To change your vehicle details, please visit the nearest {appName} Partner Center with your original documents.
          </p>
        </div>
      </div>
    </div>
  );
};

export default VehicleInfo;
