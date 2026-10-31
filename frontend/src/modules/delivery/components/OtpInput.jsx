import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertCircle, CheckCircle, Camera, X } from "lucide-react";
import { toast } from "sonner";
import { deliveryApi } from "../services/deliveryApi";
import { getCurrentPositionWithCache } from "../utils/deliveryLastLocation";

/**
 * OtpInput Component
 * 
 * A 4-digit OTP input component for delivery personnel to validate delivery completion.
 * Features auto-focus, numeric keyboard on mobile, validation error handling, and
 * attempts remaining counter.
 * 
 * Requirements: 5.1, 5.2, 6.5
 * 
 * @param {Object} props
 * @param {string} props.orderId - The order ID for OTP validation
 * @param {Function} props.onSuccess - Callback when OTP is successfully validated
 * @param {Function} props.onError - Callback when validation fails
 * @param {Function} props.onCancel - Optional callback for cancel action
 */
const calculateRemainingTime = (expiresAt) => {
  if (!expiresAt) return 0;
  const now = new Date().getTime();
  const expiry = new Date(expiresAt).getTime();
  const diff = Math.floor((expiry - now) / 1000);
  return Math.max(0, diff);
};

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const OtpInput = ({ orderId, isReturn = false, isReturnDrop = false, isSellerPickup = false, initialExpiresAt = null, onSuccess, onError, onCancel }) => {
  const navigate = useNavigate();
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [lastErrorCode, setLastErrorCode] = useState(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [isStartingShift, setIsStartingShift] = useState(false);
  
  // Timer state
  const [expiresAtStr, setExpiresAtStr] = useState(initialExpiresAt);
  const [remainingSeconds, setRemainingSeconds] = useState(
    initialExpiresAt ? calculateRemainingTime(initialExpiresAt) : 0
  );
  const timerRef = useRef(null);

  const inputRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];
  
  // Photo upload state
  const [images, setImages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const requirePhotos = isSellerPickup || (!isReturn && !isReturnDrop);

  // Auto-focus first input on mount
  useEffect(() => {
    if (inputRefs[0].current) {
      inputRefs[0].current.focus();
    }
  }, []);

  // Reset component when orderId changes
  useEffect(() => {
    setOtp(["", "", "", ""]);
    setError(null);
    setLastErrorCode(null);
    setAttemptsRemaining(3);
    setIsLoading(false);
    setIsGenerating(false);
    setImages([]);
    setExpiresAtStr(initialExpiresAt);
    setRemainingSeconds(initialExpiresAt ? calculateRemainingTime(initialExpiresAt) : 0);
    if (inputRefs[0].current) {
      inputRefs[0].current.focus();
    }
  }, [orderId, initialExpiresAt]);

  // Countdown timer logic using dynamic calculation to prevent drift
  useEffect(() => {
    if (!expiresAtStr) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const tick = () => {
      const remaining = calculateRemainingTime(expiresAtStr);
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
      }
    };

    tick(); // initial calculation
    timerRef.current = setInterval(tick, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [expiresAtStr]);

  const handleImageSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remaining = 3 - images.length;
    const toProcess = files.slice(0, remaining);

    setIsUploading(true);
    const newImages = [];

    for (const file of toProcess) {
      try {
        const preview = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        let url = preview;
        try {
          const { default: axiosInstance } = await import("@core/api/axios");
          const uploadForm = new FormData();
          uploadForm.append("file", file);
          const uploadRes = await axiosInstance.post("/media/upload", uploadForm, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          url = uploadRes.data?.result?.url || uploadRes.data?.data?.url || uploadRes.data?.url || preview;
        } catch {
          url = preview;
        }

        newImages.push({ url, preview });
      } catch (err) {
        toast.error("Failed to process image");
      }
    }

    setImages((prev) => [...prev, ...newImages].slice(0, 3));
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  /**
   * Handle input change for a specific digit
   * Implements auto-focus to next field on digit entry
   * Requirement 5.2: Accept exactly 4 numeric digits
   */
  const handleChange = (index, value) => {
    // Only allow numeric input
    if (value && !/^\d$/.test(value)) {
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError(null);

    // Auto-focus next field if digit entered
    if (value && index < 3) {
      inputRefs[index + 1].current?.focus();
    }
  };

  /**
   * Handle keydown events for backspace navigation
   * Auto-focus previous field on backspace when current field is empty
   */
  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
  };

  /**
   * Handle paste event to fill all fields at once
   */
  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").trim();

    // Only accept 4-digit numeric paste
    if (/^\d{4}$/.test(pastedData)) {
      const newOtp = pastedData.split("");
      setOtp(newOtp);
      setError(null);
      // Focus last input
      inputRefs[3].current?.focus();
    }
  };

  /**
   * Clear all input fields
   * Requirement 6.5: Clear input fields after failed validation
   */
  const clearInputs = () => {
    setOtp(["", "", "", ""]);
    setError(null);
    inputRefs[0].current?.focus();
  };

  const handleGenerateOtp = async () => {
    if (!orderId) return;

    setIsGenerating(true);
    try {
      const response = isSellerPickup
        ? await deliveryApi.requestSellerPickupOtp(orderId, {})
        : isReturnDrop
          ? await deliveryApi.requestReturnDropOtp(orderId, {})
          : isReturn
            ? await deliveryApi.requestReturnOtp(orderId, {})
            : await deliveryApi.requestDeliveryOtp(orderId, {});
      toast.success(response.data?.message || "OTP generated successfully");
      setError(null);
      setLastErrorCode(null);
      
      const newExpiresAt = response.data?.result?.expiresAt || response.data?.expiresAt;
      if (newExpiresAt) {
        setExpiresAtStr(newExpiresAt);
        setRemainingSeconds(calculateRemainingTime(newExpiresAt));
      }
      
      clearInputs();
    } catch (err) {
      const errorMessage =
        err.response?.data?.error?.message ||
        err.message ||
        "Failed to generate OTP";
      toast.error(errorMessage);
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * Submit OTP for validation
   * Requirement 5.1: Display OTP input field for delivery person
   * Requirement 6.5: Show attempts remaining counter
   */
  const handleSubmit = async () => {
    const otpString = otp.join("");

    // Validate OTP format before submission
    if (otpString.length !== 4) {
      setError("Please enter all 4 digits");
      return;
    }
    
    if (requirePhotos && images.length === 0) {
      setError("Please upload at least 1 product photo");
      return;
    }

    setIsLoading(true);
    setError(null);
    setLastErrorCode(null);

    try {
      let locationData = {};
      if (isSellerPickup) {
        try {
          const loc = await new Promise((resolve, reject) => {
            getCurrentPositionWithCache(resolve, reject, {
              maxCacheAgeMs: 5 * 60 * 1000,
            });
          });
          locationData = { lat: loc.lat, lng: loc.lng };
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn("GPS failed, using fallback location for testing");
            locationData = { lat: 22.7196, lng: 75.8577 }; // fallback
          } else {
            throw new Error("Location unavailable. Please enable GPS to proceed.");
          }
        }
      }

      // Call appropriate validation endpoint
      const response = isSellerPickup
        ? await deliveryApi.verifySellerPickupOtp(orderId, { enteredCode: otpString, ...locationData, images: images.map(img => img.url) })
        : isReturnDrop
          ? await deliveryApi.verifyReturnDropOtp(orderId, { code: otpString })
          : isReturn
            ? await deliveryApi.verifyReturnOtp(orderId, { otp: otpString })
            : await deliveryApi.verifyDeliveryOtp(orderId, { code: otpString, images: images.map(img => img.url) });

      // Success
      toast.success(
        response.data?.message ||
        (isSellerPickup
          ? "Seller confirmed! Order picked up."
          : isReturnDrop
            ? "Seller confirmed! Return complete."
            : isReturn
              ? "Return pickup verified!"
              : "Order delivered successfully!")
      );

      if (onSuccess) {
        onSuccess(response.data);
      }
    } catch (err) {
      // Handle validation errors. The canonical workflow endpoint puts
      // the structured payload under `result.error` (because handleResponse
      // wraps data inside `result`), but historically clients also read
      // `data.error` directly. Read both for forward-compat.
      const respData = err.response?.data || {};
      const errorData =
        (respData.result && respData.result.error) ||
        (typeof respData.error === "object" ? respData.error : null) ||
        {};
      const errorCode = errorData.code;
      const errorMessage =
        errorData.message ||
        respData.message ||
        err.message ||
        "Failed to validate OTP";
      const remainingAttempts = errorData.attemptsRemaining;

      setLastErrorCode(errorCode || null);

      // Update attempts remaining if provided
      if (typeof remainingAttempts === "number") {
        setAttemptsRemaining(remainingAttempts);
      }

      // Display appropriate error message
      if (errorCode === "OTP_MISMATCH") {
        setError(`Incorrect OTP. ${remainingAttempts} attempt${remainingAttempts !== 1 ? "s" : ""} remaining.`);
        toast.error(`Incorrect OTP. ${remainingAttempts} attempt${remainingAttempts !== 1 ? "s" : ""} remaining.`);
        clearInputs();
      } else if (errorCode === "OTP_EXPIRED") {
        setError("OTP has expired. Please generate a new one.");
        toast.error("OTP has expired. Please generate a new one.");
      } else if (errorCode === "OTP_CONSUMED") {
        setError("OTP was already used. Please generate a new one.");
        toast.error("OTP was already used. Please generate a new one.");
      } else if (errorCode === "MAX_ATTEMPTS_EXCEEDED") {
        setError("Maximum attempts exceeded. Please contact supervisor.");
        toast.error("Maximum attempts exceeded. Please contact supervisor.", {
          duration: 6000,
        });
      } else if (errorCode === "OTP_INVALID_FORMAT") {
        setError("Invalid OTP format. Please enter 4 digits.");
        toast.error("Invalid OTP format. Please enter 4 digits.");
        clearInputs();
      } else if (errorCode === "OTP_NOT_FOUND") {
        setError("No active OTP found. Please generate one first.");
        toast.error("No active OTP found. Please generate one first.");
      } else {
        setError(errorMessage);
        toast.error(errorMessage);
      }

      if (onError) {
        onError(err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartShiftQuick = async () => {
    try {
      setIsStartingShift(true);
      const res = await deliveryApi.startShift();
      toast.success(res.data?.message || "Shift started! Validating delivery OTP...");
      setError(null);
      setLastErrorCode(null);
      // Immediately retry OTP validation
      await handleSubmit();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || "Failed to start shift";
      toast.error(msg);
      setError(msg);
    } finally {
      setIsStartingShift(false);
    }
  };

  // Check if all 4 digits are entered
  const isComplete = otp.every((digit) => digit !== "");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-bold text-gray-900 mb-1">
          {isSellerPickup ? "Enter Seller OTP" : isReturnDrop ? "Enter Seller OTP" : isReturn ? "Enter Return OTP" : "Enter Delivery OTP"}
        </h3>
        <p className="text-sm text-gray-600">
          {isSellerPickup || isReturnDrop
            ? "Ask the seller for the 4-digit confirmation code"
            : "Ask the customer for the 4-digit code"}
        </p>
      </div>

      {/* Photo Upload Section */}
      {requirePhotos && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-bold text-gray-800">
              Product Photos <span className="text-red-500">*</span>
            </p>
            <p className="text-xs text-gray-500">{images.length}/3 uploaded</p>
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            {images.map((img, index) => (
              <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200">
                <img src={img.preview || img.url} alt={`proof-${index}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeImage(index)}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
            {images.length < 3 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center bg-white hover:bg-gray-50 transition-colors"
              >
                {isUploading ? (
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                ) : (
                  <>
                    <Camera className="w-6 h-6 text-gray-400" />
                    <span className="text-xs text-gray-400 mt-1">Add Photo</span>
                  </>
                )}
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={handleImageSelect}
            className="hidden"
          />
        </div>
      )}

      {/* OTP Input Fields */}
      <div className="flex justify-center gap-3">
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={inputRefs[index]}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={index === 0 ? handlePaste : undefined}
            disabled={isLoading}
            className={`w-14 h-16 text-center text-2xl font-bold font-mono border-2 rounded-xl transition-all duration-200 outline-none focus:outline-none focus:ring-2 focus:ring-offset-0 ${error
                ? "border-red-300 bg-red-50 text-red-900 focus:border-red-500 focus:ring-red-500"
                : digit
                  ? "border-primary bg-primary/10 text-slate-900 focus:border-primary focus:ring-primary"
                  : "border-gray-300 bg-white text-gray-900 focus:border-brand-500 focus:ring-brand-500"
              } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
            aria-label={`Digit ${index + 1}`}
          />
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 font-medium">{error}</p>
        </div>
      )}

      {/* Quick Shift Starter if blocked by SHIFT_REQUIRED */}
      {(lastErrorCode === "SHIFT_REQUIRED" || (typeof error === "string" && error.includes("Start your shift"))) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                Active Shift Required for COD
              </p>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                You must have an active shift to collect cash on delivery. Start your shift right now with 1 tap to proceed!
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={isStartingShift}
              onClick={handleStartShiftQuick}
              className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex-1 shadow-sm flex items-center justify-center gap-1.5 transition"
            >
              {isStartingShift ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Starting Shift & Retrying...
                </>
              ) : (
                "⚡ Start Shift Now & Confirm"
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate("/delivery/profile/shifts")}
              className="bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 text-gray-700 font-bold text-xs py-2.5 px-3 rounded-xl transition"
            >
              Shifts & Limits
            </button>
          </div>
        </div>
      )}

      {/* Attempts Remaining Counter */}
      {/* Requirement 6.5: Show attempts remaining counter */}
      {attemptsRemaining < 3 && attemptsRemaining > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <p className="text-sm text-amber-800 font-medium">
            {attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""} remaining
          </p>
        </div>
      )}
      
      {/* Countdown Timer (Only show if we have an active timer) */}
      {remainingSeconds > 0 && (
        <div
          className={`border rounded-xl p-4 flex items-center justify-between transition-colors duration-300 ${
            remainingSeconds <= 120
              ? "bg-amber-50 border-amber-200"
              : "bg-gray-50 border-gray-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <svg
              className={`w-5 h-5 ${remainingSeconds <= 120 ? "text-amber-500" : "text-gray-500"}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className={`text-sm font-medium ${remainingSeconds <= 120 ? "text-amber-900" : "text-gray-700"}`}>
              Valid For
            </p>
          </div>
          <p className={`text-lg font-bold font-mono tracking-wider ${remainingSeconds <= 120 ? "text-amber-700" : "text-gray-900"}`}>
            {formatTime(remainingSeconds)}
          </p>
        </div>
      )}

      {["OTP_NOT_FOUND", "OTP_EXPIRED", "OTP_CONSUMED"].includes(lastErrorCode) && (
        <button
          onClick={handleGenerateOtp}
          disabled={isLoading || isGenerating}
          className="w-full h-10 rounded-xl font-semibold text-primary-foreground bg-black  hover:bg-brand-700 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Generating OTP...</span>
            </>
          ) : (
            <span>Generate New OTP</span>
          )}
        </button>
      )}

      {/* Submit Button */}
      {/* Enable submit button only when 4 digits entered and photos (if required) are uploaded */}
      <button
        onClick={handleSubmit}
        disabled={!isComplete || isLoading || isGenerating || (requirePhotos && images.length === 0)}
        className={`w-full h-12 rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-2 outline-none focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 ${!isComplete || isLoading || isGenerating || (requirePhotos && images.length === 0)
            ? "bg-gray-200 text-gray-600 cursor-not-allowed"
            : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 shadow-md hover:shadow-lg"
          }`}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Validating...</span>
          </>
        ) : (
          <>
            <CheckCircle className="w-5 h-5" />
            <span>{isReturnDrop ? "Confirm Return Delivery" : isReturn ? "Confirm Pickup" : "Confirm Delivery"}</span>
          </>
        )}
      </button>

      {/* Clear Button */}
      <button
        onClick={clearInputs}
        disabled={isLoading || otp.every((d) => !d)}
        className="w-full h-10 rounded-xl font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all duration-200 outline-none focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Clear
      </button>

      {/* Resend OTP Button */}
      <button
        onClick={handleGenerateOtp}
        disabled={isLoading || isGenerating}
        className="w-full h-10 rounded-xl font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 active:scale-95 transition-all duration-200 outline-none focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Sending...</span>
          </>
        ) : (
          <span>Resend OTP</span>
        )}
      </button>

      {/* Cancel Button (Optional) */}
      {onCancel && (
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="w-full h-10 rounded-xl font-medium text-gray-600 hover:text-gray-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
      )}

      {/* Help Text */}
      <div className="bg-brand-50 border border-brand-200 rounded-xl p-3">
        <p className="text-xs text-brand-800 text-center">
          💡 The {isSellerPickup || isReturnDrop ? "seller" : "customer"} will see this OTP on their app when you're nearby
        </p>
      </div>
    </div>
  );
};

export default OtpInput;
