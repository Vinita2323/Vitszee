import axiosInstance from '@core/api/axios';

/**
 * Admin catalog endpoints: categories and products (moderation included).
 * Per-domain split (P4.5).
 */
export const adminCatalogApi = {
    // Category Management
    getCategories: (params) => axiosInstance.get('/admin/categories', { params }),
    getCategoryTree: () => axiosInstance.get('/admin/categories?tree=true'),
    createCategory: (formData) =>
        axiosInstance.post('/admin/categories', formData),
    updateCategory: (id, formData) =>
        axiosInstance.put(`/admin/categories/${id}`, formData),
    deleteCategory: (id) => axiosInstance.delete(`/admin/categories/${id}`),
    getParentUnits: () => axiosInstance.get('/admin/categories?flat=true'),

    // Header Categories Management
    getHeaderCategories: () => axiosInstance.get('/header-categories/admin'),
    createHeaderCategory: (data) => axiosInstance.post('/header-categories/admin', data),
    updateHeaderCategory: (id, data) => axiosInstance.put(`/header-categories/admin/${id}`, data),
    deleteHeaderCategory: (id) => axiosInstance.delete(`/header-categories/admin/${id}`),
    reorderHeaderCategories: (orderedIds) => axiosInstance.post('/header-categories/admin/reorder', { orderedIds }),

    // Product Management
    getProducts: (params) => axiosInstance.get('/products', { params }),
    getProductModerationList: (params) =>
        axiosInstance.get('/products/moderation', { params }),
    approveProductModeration: (id, data = {}) =>
        axiosInstance.patch(`/products/moderation/${id}/approve`, data),
    rejectProductModeration: (id, data = {}) =>
        axiosInstance.patch(`/products/moderation/${id}/reject`, data),
    createProduct: (formData) => axiosInstance.post('/products', formData),
    updateProduct: (id, formData) =>
        axiosInstance.put(`/products/${id}`, formData),
    deleteProduct: (id) => axiosInstance.delete(`/products/${id}`),
};

export default adminCatalogApi;
