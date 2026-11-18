import React from "react";
import { motion } from "framer-motion";
import { CheckCircle, Circle, Clock, Truck, Home } from "lucide-react";
import { getLegacyStatusFromOrder } from "@/shared/utils/orderStatus";

const STATUS_TO_STAGE = {
  pending: "confirmed",
  confirmed: "confirmed",
  packed: "confirmed",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
};

const OrderProgressTracker = ({
  order,
  estimatedArrivalText = "12:45 PM",
  arrivingInText = "8 mins",
  totalDistanceText = "—",
}) => {
  const status = getLegacyStatusFromOrder(order);
  const currentStage = STATUS_TO_STAGE[status] || "confirmed";

  const steps = [
    {
      id: "confirmed",
      label: "Order Confirmed",
      icon: CheckCircle,
      statuses: ["confirmed"],
    },
    {
      id: "out_for_delivery",
      label: "Out for delivery",
      icon: Truck,
      statuses: ["out_for_delivery", "delivered"],
    },
    {
      id: "delivered",
      label: "Delivered",
      icon: Home,
      statuses: ["delivered"],
    },
  ];

  const getStepStatus = (step) => {
    if (status === "cancelled") return "cancelled";

    const stepIndex = steps.findIndex((s) => s.id === step.id);

    if (status === "pending") {
      return stepIndex === 0 ? "active" : "pending";
    }

    if (status === "confirmed" || status === "packed") {
      return stepIndex === 0 ? "completed" : "pending";
    }

    if (status === "out_for_delivery") {
      if (stepIndex === 0) return "completed";
      if (stepIndex === 1) return "active";
      return "pending";
    }

    if (status === "delivered") {
      return "completed";
    }

    return step.id === "confirmed" ? "active" : "pending";
  };

  if (status === "cancelled") {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5">
        <p className="text-center text-rose-700 font-semibold">Order Cancelled</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-4">
        {steps.map((step, index) => {
          const stepStatus = getStepStatus(step);
          const Icon = step.icon;
          const isCompleted = stepStatus === "completed";
          const isActive = stepStatus === "active";
          const isPending = stepStatus === "pending";

          return (
            <div
              key={step.id}
              className="relative transition-opacity duration-200">
              <div className="flex items-center gap-4">
                {/* Icon Circle */}
                <div
                  className={`relative z-10 h-12 w-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isCompleted
                      ? "bg-[#1A4516] text-white shadow-lg shadow-[#1A4516]/20"
                      : isActive
                      ? "bg-[#F5FBF5] text-[#1A4516] border-2 border-[#1A4516]"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle size={24} className="fill-current" />
                  ) : isActive ? (
                    <div className="animate-spin">
                      <Icon size={22} />
                    </div>
                  ) : (
                    <Circle size={22} />
                  )}
                </div>

                {/* Label */}
                <div className="flex-1">
                  <p
                    className={`text-sm font-bold ${
                      isCompleted
                        ? "text-[#1A4516]"
                        : isActive
                        ? "text-[#1A4516]"
                        : "text-slate-400"
                    }`}
                  >
                    {step.label}
                  </p>
                  {isActive && (
                    <p className="text-xs text-[#1A4516]/80 font-medium mt-0.5">
                      In progress...
                    </p>
                  )}
                </div>

                {/* Status Indicator */}
                {isCompleted && (
                  <div className="h-6 w-6 rounded-full bg-[#1A4516]/10 flex items-center justify-center transition-opacity duration-200">
                    <CheckCircle size={14} className="text-[#1A4516]" />
                  </div>
                )}
              </div>

              {/* Connecting Line */}
              {index < steps.length - 1 && (
                <div className="absolute left-6 top-12 bottom-0 w-0.5 -mb-4">
                  <div
                    className={`h-full w-full ${
                      isCompleted ? "bg-[#1A4516]" : "bg-slate-200"
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </motion.div>

      {/* ETA Display */}
      {status !== "delivered" && (
        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-[#F5FBF5] rounded-2xl p-3 gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-[#1A4516]/10 rounded-xl flex items-center justify-center shrink-0">
                <Clock size={20} className="text-[#1A4516]" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#1A4516]/80 uppercase tracking-wider">
                  Estimated Time
                </p>
                <p className="text-base font-black text-[#1A4516]">{estimatedArrivalText}</p>
              </div>
            </div>
            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-0 border-[#1A4516]/10">
              <div className="flex flex-col sm:items-end">
                <p className="text-[11px] text-[#1A4516]/80 font-semibold">Arriving in</p>
                <p className="text-xl font-black text-[#1A4516] leading-none mt-0.5">{arrivingInText}</p>
              </div>
              <div className="inline-flex items-center rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-[#1A4516] ring-1 ring-[#1A4516]/20 whitespace-nowrap">
                Total distance: {totalDistanceText}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderProgressTracker;
