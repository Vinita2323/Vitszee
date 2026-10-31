import React, { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DeliveryLayout from "../layout/DeliveryLayout";
import { setActiveRole, ROLES } from "@core/auth/activeRoleStore";
import Splash from "../pages/Splash";
import DeliveryAuth from "../pages/DeliveryAuth";
import Dashboard from "../pages/Dashboard";
import OrderDetails from "../pages/OrderDetails";
import Navigation from "../pages/Navigation";
import DeliveryConfirmation from "../pages/DeliveryConfirmation";
import EarningsPage from "../pages/EarningsPage";
import CodCash from "../pages/CodCash";
import OrderHistory from "../pages/OrderHistory";
import Profile from "../pages/Profile";
import PersonalDetails from "../pages/profile/PersonalDetails";
import VehicleInfo from "../pages/profile/VehicleInfo";
import BankAccount from "../pages/profile/BankAccount";
import Documents from "../pages/profile/Documents";
import Settings from "../pages/profile/Settings";
import ShiftsAndSettlement from "../pages/profile/ShiftsAndSettlement";
// import Withdrawals from "../pages/profile/Withdrawals"; // wallet temporarily disabled
import Notifications from "../pages/Notifications";
import ReviewsPage from "../pages/ReviewsPage";

const DeliveryRoutes = () => {
  useEffect(() => {
    setActiveRole(ROLES.DELIVERY);
  }, []);

  return (
    <Routes>
      <Route element={<DeliveryLayout />}>
        <Route path="splash" element={<Splash />} />

        <Route path="auth" element={<DeliveryAuth />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="order-details/:orderId" element={<OrderDetails />} />
        <Route path="navigation" element={<Navigation />} />
        <Route path="confirm-delivery/:orderId" element={<DeliveryConfirmation />} />
        <Route path="earnings" element={<EarningsPage />} />
        <Route path="cod-cash" element={<CodCash />} />
        <Route path="history" element={<OrderHistory />} />
        <Route path="profile" element={<Profile />} />
        <Route path="profile/personal-details" element={<PersonalDetails />} />
        <Route path="profile/vehicle-info" element={<VehicleInfo />} />
        <Route path="profile/bank-account" element={<BankAccount />} />
        <Route path="profile/documents" element={<Documents />} />
        <Route path="profile/shifts" element={<ShiftsAndSettlement />} />
        <Route path="shifts" element={<Navigate to="/delivery/profile/shifts" replace />} />
        <Route path="profile/safety-privacy" element={<Navigate to="/delivery/profile" replace />} />
        <Route path="profile/settings" element={<Settings />} />
        <Route path="profile/help-support" element={<Navigate to="/delivery/support" replace />} />
        <Route path="support" element={<Navigate to="/delivery/support" replace />} />
        {/* Wallet / money request temporarily disabled */}
        <Route path="profile/withdrawals" element={<Navigate to="/delivery/profile" replace />} />
        {/* <Route path="profile/withdrawals" element={<Withdrawals />} /> */}
        <Route path="notifications" element={<Notifications />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="/" element={<Navigate to="dashboard" replace />} />
      </Route>
    </Routes>
  );
};

export default DeliveryRoutes;
