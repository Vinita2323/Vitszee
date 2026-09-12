import axiosInstance from '@core/api/axios';

/**
 * Admin Shadowfax Logistics API
 */
export const adminShadowfaxApi = {
  getShadowfaxConfig: () => axiosInstance.get('/shadowfax/config'),
  updateShadowfaxConfig: (data) => axiosInstance.put('/shadowfax/config', data),
  testShadowfaxConnection: (data) => axiosInstance.post('/shadowfax/test-connection', data),
  getShadowfaxShipments: (params) => axiosInstance.get('/shadowfax/shipments', { params }),
  getShadowfaxShipmentDetail: (orderId) => axiosInstance.get(`/shadowfax/shipments/${orderId}`),
  createShadowfaxForwardOrder: (orderId) => axiosInstance.post(`/shadowfax/shipments/${orderId}/create-forward`),
  markShadowfaxDispatchReady: (orderId) => axiosInstance.post(`/shadowfax/shipments/${orderId}/dispatch-ready`),
  cancelShadowfaxShipment: (orderId, reason) => axiosInstance.post(`/shadowfax/shipments/${orderId}/cancel`, { reason }),
  trackShadowfaxShipment: (identifier) => axiosInstance.get(`/shadowfax/track/${identifier}`),
};

export default adminShadowfaxApi;
