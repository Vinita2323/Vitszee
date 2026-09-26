import axiosInstance from '@core/api/axios';

/**
 * Admin Delhivery Courier API
 */
export const adminDelhiveryApi = {
  getDelhiveryConfig: () => axiosInstance.get('/delhivery/config'),
  updateDelhiveryConfig: (data) => axiosInstance.put('/delhivery/config', data),
  testDelhiveryConnection: (data) => axiosInstance.post('/delhivery/test-connection', data),
  getDelhiveryShipments: (params) => axiosInstance.get('/delhivery/shipments', { params }),
  getDelhiveryShipmentDetail: (orderId) => axiosInstance.get(`/delhivery/shipments/${orderId}`),
  createDelhiveryShipment: (orderId) => axiosInstance.post(`/delhivery/shipments/${orderId}/create-forward`),
  cancelDelhiveryShipment: (orderId, reason) => axiosInstance.post(`/delhivery/shipments/${orderId}/cancel`, { reason }),
  syncDelhiveryShipment: (orderId) => axiosInstance.post(`/delhivery/shipments/${orderId}/sync`),
  requestDelhiveryPickup: (data) => axiosInstance.post('/delhivery/pickup-request', data),
  registerSellerPickupLocation: (sellerId) => axiosInstance.post(`/delhivery/sellers/${sellerId}/register-pickup`),
  trackDelhiveryShipment: (identifier) => axiosInstance.get(`/delhivery/track/${identifier}`),
};

export default adminDelhiveryApi;
