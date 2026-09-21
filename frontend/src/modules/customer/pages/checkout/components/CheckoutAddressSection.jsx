import React from "react";
import { Check, Contact2, MapPin, Navigation, UserPlus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * CheckoutAddressSection
 *
 * Props:
 *   currentAddress       – the active delivery address object
 *   savedRecipient       – "order for someone else" recipient object or null
 *   savedAddresses       – array of saved addresses from LocationContext
 *   onSelectAddress      – () => void  — opens the address-selection modal
 *   onEditAddress        – () => void  — opens the edit-address modal
 *   onUseCurrentLocation – () => void  — triggers live-location detection
 *   isFetchingLocation   – boolean
 *   showRecipientForm    – boolean
 *   onToggleRecipientForm – () => void
 *   recipientData        – object
 *   onRecipientDataChange – (data) => void
 *   onSaveRecipient      – () => void
 *   onRemoveRecipient    – () => void
 *   displayName          – string
 *   displayPhone         – string
 *   displayAddress       – string
 */
const CheckoutAddressSection = React.memo(function CheckoutAddressSection({
  currentAddress,
  savedRecipient,
  savedAddresses,
  onSelectAddress,
  onEditAddress,
  onUseCurrentLocation,
  isFetchingLocation,
  showRecipientForm,
  onToggleRecipientForm,
  recipientData,
  onRecipientDataChange,
  onSaveRecipient,
  onRemoveRecipient,
  displayName,
  displayPhone,
  displayAddress,
}) {
  return (
    <motion.div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200/80">
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#1A4516] flex items-center justify-center font-bold">
            <MapPin size={17} />
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-sm sm:text-base tracking-tight">
              Delivery Address
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              Order will be delivered to this location
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleRecipientForm}
          className="text-xs font-bold text-[#1A4516] hover:text-emerald-700 hover:underline flex items-center gap-1 transition-colors">
          <UserPlus size={14} />
          <span>{showRecipientForm ? "Close" : savedRecipient ? "Change Details" : "Ordering for someone else?"}</span>
        </button>
      </div>

      {/* Saved recipient notification card */}
      {savedRecipient && !showRecipientForm && (
        <div className="mb-4 p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl flex items-start justify-between">
          <div className="flex gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-100/80 flex items-center justify-center text-[#1A4516] shrink-0">
              <Contact2 size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-slate-800">{savedRecipient.name}</p>
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                  Recipient
                </span>
              </div>
              <p className="text-xs text-[#1A4516] font-bold mt-0.5">{savedRecipient.phone}</p>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                {savedRecipient.completeAddress}
                {savedRecipient.landmark && `, ${savedRecipient.landmark}`}
                {savedRecipient.pincode && ` - ${savedRecipient.pincode}`}
              </p>
            </div>
          </div>
          <button
            onClick={onRemoveRecipient}
            className="text-red-500 text-xs font-bold hover:underline shrink-0 ml-2">
            Remove
          </button>
        </div>
      )}

      {/* Recipient form (Accordion) */}
      <AnimatePresence>
        {showRecipientForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden mb-4">
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-800 mb-2">
                  Enter Delivery Address Details
                </h4>
                <div className="space-y-2.5">
                  <Input
                    placeholder="Enter complete address*"
                    value={recipientData.completeAddress}
                    onChange={(e) =>
                      onRecipientDataChange({ ...recipientData, completeAddress: e.target.value })
                    }
                    className="h-11 rounded-xl bg-white border-slate-200 focus:ring-[#1A4516] focus:border-[#1A4516] text-sm"
                  />
                  <Input
                    placeholder="Landmark (e.g. Near City Hospital) - optional"
                    value={recipientData.landmark}
                    onChange={(e) =>
                      onRecipientDataChange({ ...recipientData, landmark: e.target.value })
                    }
                    className="h-11 rounded-xl bg-white border-slate-200 focus:ring-[#1A4516] focus:border-[#1A4516] text-sm"
                  />
                  <Input
                    placeholder="Pincode (e.g. 452001) - optional"
                    value={recipientData.pincode}
                    onChange={(e) =>
                      onRecipientDataChange({ ...recipientData, pincode: e.target.value })
                    }
                    className="h-11 rounded-xl bg-white border-slate-200 focus:ring-[#1A4516] focus:border-[#1A4516] text-sm"
                  />
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-800 mb-1">
                  Receiver Contact
                </h4>
                <p className="text-[11px] text-slate-500 mb-2.5">
                  Delivery partner will contact receiver at this phone number
                </p>
                <div className="space-y-2.5">
                  <Input
                    placeholder="Receiver's name*"
                    value={recipientData.name}
                    onChange={(e) =>
                      onRecipientDataChange({ ...recipientData, name: e.target.value })
                    }
                    className="h-11 rounded-xl bg-white border-slate-200 focus:ring-[#1A4516] focus:border-[#1A4516] text-sm"
                  />
                  <div className="relative">
                    <Input
                      placeholder="Receiver's 10-digit phone number*"
                      value={recipientData.phone}
                      onChange={(e) =>
                        onRecipientDataChange({ ...recipientData, phone: e.target.value })
                      }
                      className="h-11 rounded-xl bg-white border-slate-200 focus:ring-[#1A4516] focus:border-[#1A4516] text-sm pr-10"
                    />
                    <Contact2
                      size={18}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </div>
              </div>

              <Button
                onClick={onSaveRecipient}
                className="w-full h-11 bg-[#1A4516] hover:bg-[#143d11] text-white font-bold rounded-xl shadow-sm">
                Save Recipient Details
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Address Card */}
      <div className="border-2 rounded-2xl p-4 mb-3 transition-all border-[#1A4516]/40 bg-[#F5FBF5]/70 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <div className="h-6 w-6 rounded-full bg-[#1A4516] flex items-center justify-center shadow-sm shrink-0">
              <Check size={14} className="text-white stroke-[3]" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <div>
                <h4 className="font-bold text-slate-800 text-sm sm:text-base">{displayName}</h4>
                {displayPhone && (
                  <p className="text-xs text-slate-500 font-medium mt-0.5">{displayPhone}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEditAddress(); }}
                  className="text-slate-600 text-xs font-bold hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-lg hover:border-slate-300 transition-colors">
                  Edit
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSelectAddress(); }}
                  className="text-[#1A4516] text-xs font-bold hover:bg-emerald-100 bg-white border border-[#1A4516]/30 px-2.5 py-1 rounded-lg transition-colors">
                  Change
                </button>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed font-medium">
              {displayAddress}
            </p>
          </div>
        </div>
      </div>

      {/* Use Current Live Location Button */}
      <button
        type="button"
        onClick={onUseCurrentLocation}
        disabled={isFetchingLocation}
        className="w-full py-2.5 px-4 rounded-xl border border-dashed border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-emerald-500 transition-all flex items-center justify-center gap-2">
        <Navigation size={14} className={`text-emerald-700 ${isFetchingLocation ? "animate-spin" : ""}`} />
        <span>{isFetchingLocation ? "Detecting live location..." : "Use current live location"}</span>
      </button>
    </motion.div>
  );
});

export default CheckoutAddressSection;
