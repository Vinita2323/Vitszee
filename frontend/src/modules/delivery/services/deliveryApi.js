import axiosInstance from "@core/api/axios";

export const deliveryApi = {
  sendLoginOtp: (data) => axiosInstance.post("/delivery/send-login-otp", data),
  sendSignupOtp: (data) =>
    axiosInstance.post("/delivery/send-signup-otp", data),
  verifyOtp: (data) => axiosInstance.post("/delivery/verify-otp", data),
  getProfile: () => axiosInstance.get("/delivery/profile"),
  updateProfile: (data) => axiosInstance.put("/delivery/profile", data),
  uploadProfileImage: (file) => {
    const body = new FormData();
    body.append("profileImage", file);
    return axiosInstance.put("/delivery/profile", body, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  deleteAccount: () => axiosInstance.delete("/delivery/account"),
  getStats: () => axiosInstance.get("/delivery/stats"),
  getEarnings: (params) => axiosInstance.get("/delivery/earnings", { params }),
  getCodCashSummary: () => axiosInstance.get("/delivery/cod/summary"),
  payCodCashToAdmin: (data) => axiosInstance.post("/delivery/cod/pay", data),
  initiateCodDeposit: (data) => axiosInstance.post("/delivery/cod/deposit/initiate", data),
  verifyCodDeposit: (data) => axiosInstance.post("/delivery/cod/deposit/verify", data),
  getWalletSummary: () => axiosInstance.get("/delivery/wallet/summary"),
  getOrderHistory: (params, config = {}) =>
    axiosInstance.get("/delivery/order-history", { params, ...config }),
  getAvailableOrders: (params = {}, config = {}) =>
    axiosInstance.get("/orders/available", { params, ...config }),
  geocodeAddress: (address) =>
    axiosInstance.get("/maps/geocode", { params: { address } }),
  acceptOrder: (orderId, idempotencyKey) =>
    axiosInstance.put(
      `/orders/accept/${encodeURIComponent(String(orderId))}`,
      {},
      {
        headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
      },
    ),
  skipOrder: (orderId) =>
    axiosInstance.put(`/orders/skip/${encodeURIComponent(String(orderId))}`),
  postLocation: (body, config = {}) =>
    axiosInstance.post("/delivery/location", body, config),
  confirmPickup: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/pickup/confirm`, body),
  markArrivedAtStore: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/pickup/ready`, body),
  advanceDeliveryRiderUi: (orderId) =>
    axiosInstance.post(`/orders/workflow/${orderId}/rider/advance-ui`, {}),
  requestDeliveryOtp: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/otp/request`, body),
  verifyDeliveryOtp: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/otp/verify`, body),
  getCodPayment: (orderId) =>
    axiosInstance.get(`/orders/workflow/${encodeURIComponent(String(orderId))}/cod-payment`),
  createCodQr: (orderId, body = {}) =>
    axiosInstance.post(`/orders/workflow/${encodeURIComponent(String(orderId))}/cod-payment/qr`, body),
  verifyCodPayment: (orderId) =>
    axiosInstance.post(`/orders/workflow/${encodeURIComponent(String(orderId))}/cod-payment/verify`, {}),
  confirmCodCash: (orderId, body = {}) =>
    axiosInstance.post(`/orders/workflow/${encodeURIComponent(String(orderId))}/cod-payment/cash`, body),
  requestSellerPickupOtp: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/seller-pickup-otp/request`, body),
  verifySellerPickupOtp: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/seller-pickup-otp/verify`, body),
  getOrderRoute: (orderId, params, config = {}) =>
    axiosInstance.get(`/orders/workflow/${orderId}/route`, { params, ...config }),
  getOrderDetails: (orderId) =>
    axiosInstance.get(
      `/orders/details/${encodeURIComponent(String(orderId))}`,
    ),
  getNotifications: (config = {}) => axiosInstance.get("/notifications", config),
  markNotificationRead: (id) => axiosInstance.put(`/notifications/${id}/read`),
  markAllNotificationsRead: () =>
    axiosInstance.put("/notifications/mark-all-read"),
  getMyReviews: (params) => axiosInstance.get("/delivery-reviews/me", { params }),
  requestWithdrawal: (data) =>
    axiosInstance.post("/delivery/request-withdrawal", data),
  updateStatus: (orderId, data) =>
    axiosInstance.put(`/orders/status/${orderId}`, data),
  updateReturnStatus: (orderId, data) =>
    axiosInstance.put(`/orders/return-status/${orderId}`, data),
  acceptReturnPickup: (orderId) =>
    axiosInstance.put(`/orders/returns/${orderId}/accept-pickup`),
  rejectReturnPickup: (orderId) =>
    axiosInstance.put(`/orders/returns/${orderId}/reject-pickup`),
  requestReturnOtp: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/return-otp/request`, body),
  verifyReturnOtp: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/return-otp/verify`, body),
  uploadReturnPickupProof: (orderId, data) =>
    axiosInstance.post(`/orders/returns/${orderId}/pickup-proof`, data),
  requestReturnDropOtp: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/return-drop-otp/request`, body),
  verifyReturnDropOtp: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/return-drop-otp/verify`, body),
  // Cash Settlement & Shifts
  startShift: () => axiosInstance.post("/cash-settlement/shifts/start"),
  endShift: () => axiosInstance.post("/cash-settlement/shifts/end"),
  getCurrentShift: () => axiosInstance.get("/cash-settlement/shifts/current"),
  getCashSettlementOverview: () => axiosInstance.get("/cash-settlement/overview"),
  submitCashDeposit: (data, config = {}) =>
    axiosInstance.post("/cash-settlement/deposits", data, config),
};
