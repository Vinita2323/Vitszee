import axiosInstance from '@core/api/axios';

/**
 * Admin delivery-partner endpoints (lifecycle, active fleet).
 * Per-domain split (P4.5).
 */
export const adminDeliveryApi = {
    getDeliveryPartners: (params) =>
        axiosInstance.get('/admin/delivery-partners', { params }),
    updateDeliveryPartner: (id, data) =>
        axiosInstance.put(`/admin/delivery-partners/${id}`, data),
    approveDeliveryPartner: (id) =>
        axiosInstance.patch(`/admin/delivery-partners/approve/${id}`),
    rejectDeliveryPartner: (id) =>
        axiosInstance.delete(`/admin/delivery-partners/reject/${id}`),
    getActiveFleet: (params) =>
        axiosInstance.get('/admin/active-fleet', { params }),
    getDeliveryReviews: (params) =>
        axiosInstance.get('/delivery-reviews/admin', { params }),
};

export default adminDeliveryApi;
