import axiosInstance from '@core/api/axios';

export const adminBirthdayApi = {
    getTodayBirthdays: async () => {
        return axiosInstance.get("/admin/birthdays/today");
    },
    getBirthdayAnalytics: async () => {
        return axiosInstance.get("/admin/birthdays/analytics");
    },
    sendBirthdayReward: async (data) => {
        return axiosInstance.post("/admin/birthdays/reward", data);
    }
};
