import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileCheck, UploadCloud, XCircle, Clock } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { toast } from "sonner";

const Documents = () => {
  const navigate = useNavigate();

  const [docs, setDocs] = useState([
    {
      id: 1,
      title: "Aadhar Card",
      status: "Verified",
      uploadedOn: "12 Jan 2024",
      fileName: "aadhar_front_back.pdf",
    },
    {
      id: 2,
      title: "PAN Card",
      status: "Verified",
      uploadedOn: "12 Jan 2024",
      fileName: "pan_card.jpg",
    },
    {
      id: 3,
      title: "Driving License",
      status: "Verified",
      uploadedOn: "15 Jan 2024",
      fileName: "dl_front.jpg",
    },
    {
      id: 4,
      title: "Police Clearance",
      status: "Pending",
      uploadedOn: "20 Feb 2024",
      fileName: "pcc_receipt.pdf",
    },
    {
      id: 5,
      title: "Bank Passbook",
      status: "Rejected",
      reason: "Image blurry, please re-upload",
      fileName: null,
    },
  ]);

  const handleUpload = (id) => {
    toast.info("Upload functionality would open file picker here");
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "Verified":
        return (
          <span className="flex items-center text-emerald-600 bg-emerald-50 border border-emerald-100/30 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">
            <FileCheck size={11} className="mr-0.5" /> Verified
          </span>
        );
      case "Pending":
        return (
          <span className="flex items-center text-amber-600 bg-amber-50 border border-amber-100/30 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">
            <Clock size={11} className="mr-0.5" /> Pending
          </span>
        );
      case "Rejected":
        return (
          <span className="flex items-center text-rose-600 bg-rose-50 border border-rose-100/30 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">
            <XCircle size={11} className="mr-0.5" /> Rejected
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white min-h-screen pb-28 relative overflow-hidden font-sans">
      
      {/* Sticky Brand Blue Header Banner */}
      <div className="bg-gradient-to-br from-[#09356E] via-[#0057B7] to-[#004494] text-white py-3 px-5 sticky top-0 z-40 shadow-sm flex items-center">
        <button 
          onClick={() => navigate(-1)} 
          className="p-1.5 rounded-full hover:bg-white/10 transition-colors mr-2 cursor-pointer"
          aria-label="Go Back"
        >
          <ArrowLeft size={18} className="text-white" />
        </button>
        <h1 className="text-sm font-black leading-tight tracking-tight">My Documents</h1>
      </div>

      {/* Main Content Area overlapping with rounded corners */}
      <div className="bg-white rounded-t-[32px] -mt-5 pt-4 px-4 space-y-3 relative z-10">
        {docs.map((doc) => (
          <Card key={doc.id} className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm">
            <div className="flex justify-between items-center mb-1.5">
              <h4 className="font-bold text-gray-800 text-xs">{doc.title}</h4>
              {getStatusBadge(doc.status)}
            </div>

            {doc.fileName && (
              <p className="text-[10px] text-gray-400 mb-2.5 flex items-center">
                <span className="truncate max-w-[200px] font-medium">{doc.fileName}</span>
                <span className="mx-1.5">•</span>
                <span className="font-medium">{doc.uploadedOn}</span>
              </p>
            )}

            {doc.status === "Rejected" && (
              <div className="bg-rose-50/60 border border-rose-100/50 text-rose-700 text-[10px] p-2 rounded-lg mb-2.5 font-medium leading-normal">
                Reason: {doc.reason}
              </div>
            )}

            <div className="flex space-x-2">
              {doc.status !== "Verified" && (
                <Button 
                  size="sm" 
                  className="w-full text-[10px] h-7 bg-[#0057B7] hover:bg-[#004899] text-white border-none rounded-lg font-bold flex justify-center items-center gap-1" 
                  onClick={() => handleUpload(doc.id)}
                >
                  <UploadCloud size={12} /> 
                  {doc.status === "Rejected" ? "Re-upload" : "Update"}
                </Button>
              )}
              {doc.fileName && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full text-[10px] h-7 border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg font-bold"
                  onClick={() => toast.success("Downloading document...")}
                >
                  View File
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Documents;
