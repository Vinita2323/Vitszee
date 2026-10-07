import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_ROLES,
  ROLE_TO_RECIPIENT_MODEL,
} from "./notification.constants.js";

function normalizeId(value) {
  if (!value) return null;
  if (typeof value === "object" && value._id) {
    return String(value._id);
  }
  return String(value);
}

function normalizeIdList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeId).filter(Boolean);
  }
  const single = normalizeId(value);
  return single ? [single] : [];
}

function truncateText(text, maxLen = 140) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (value.length <= maxLen) return value;
  return `${value.slice(0, Math.max(0, maxLen - 3))}...`;
}

function getFrontendBaseUrl() {
  const explicit =
    process.env.FRONTEND_URL ||
    process.env.WEB_APP_URL ||
    "http://localhost:5174";
  return String(explicit).trim().replace(/\/+$/, "");
}

function buildOrderLink(orderId) {
  const id = String(orderId || "").trim();
  const baseUrl = getFrontendBaseUrl();
  if (!id) return `${baseUrl}/orders`;
  return `${baseUrl}/orders/${encodeURIComponent(id)}`;
}

function buildDeliveryOrderLink(orderId) {
  const id = String(orderId || "").trim();
  const baseUrl = getFrontendBaseUrl();
  if (!id) return `${baseUrl}/delivery/dashboard`;
  return `${baseUrl}/delivery/order-details/${encodeURIComponent(id)}`;
}

function buildCustomerSupportLink(ticketId) {
  const baseUrl = getFrontendBaseUrl();
  const id = String(ticketId || "").trim();
  return id ? `${baseUrl}/chat?ticketId=${encodeURIComponent(id)}` : `${baseUrl}/chat`;
}

function buildAdminSupportLink(ticketId) {
  const baseUrl = getFrontendBaseUrl();
  const id = String(ticketId || "").trim();
  return id
    ? `${baseUrl}/admin/support-tickets?ticketId=${encodeURIComponent(id)}`
    : `${baseUrl}/admin/support-tickets`;
}

function buildSellerInventoryLink(productId) {
  const baseUrl = getFrontendBaseUrl();
  const id = String(productId || "").trim();
  return id
    ? `${baseUrl}/seller/inventory?productId=${encodeURIComponent(id)}`
    : `${baseUrl}/seller/inventory`;
}

function eventDefinition(eventType) {
  switch (eventType) {
    case NOTIFICATION_EVENTS.ORDER_PLACED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Order Placed",
        body: () => "Your order has been placed successfully.",
      };
    case NOTIFICATION_EVENTS.PAYMENT_SUCCESS:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Payment Successful",
        body: () => "Payment received for your order.",
      };
    case NOTIFICATION_EVENTS.ORDER_CONFIRMED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Order Confirmed",
        body: (payload) => payload.isPaymentPending 
          ? "Seller accepted your order! Please choose Pay Online or COD to dispatch it." 
          : "Seller has confirmed your order.",
      };
    case NOTIFICATION_EVENTS.ORDER_PACKED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Order Packed",
        body: () => "Your order is packed and ready.",
      };
    case NOTIFICATION_EVENTS.OUT_FOR_DELIVERY:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Out For Delivery",
        body: () => "Your order is on the way.",
      };
    case NOTIFICATION_EVENTS.ORDER_DELIVERED:
      return {
        multi: true,
        definitions: [
          {
            role: NOTIFICATION_ROLES.CUSTOMER,
            recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
            title: () => "Order Delivered",
            body: () => "Your order has been delivered.",
          },
          {
            role: NOTIFICATION_ROLES.SELLER,
            recipientIds: (payload) => normalizeIdList(payload.sellerId),
            title: () => "Order Delivered ✅",
            body: (payload) =>
              payload.orderId
                ? `Order #${payload.orderId} has been delivered to the customer.`
                : "Your order has been delivered to the customer.",
          },
          {
            role: NOTIFICATION_ROLES.DELIVERY,
            recipientIds: (payload) => normalizeIdList(payload.deliveryId),
            title: () => "Delivery Completed! 🏁",
            body: (payload) =>
              payload.orderId
                ? `You have successfully delivered order #${payload.orderId}.`
                : "Delivery completed successfully.",
          },
        ],
      };
    case NOTIFICATION_EVENTS.ORDER_CANCELLED:
      return {
        multi: true,
        definitions: [
          {
            role: NOTIFICATION_ROLES.CUSTOMER,
            recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
            title: () => "Order Cancelled",
            body: (payload) => payload.customerMessage || "Your order has been cancelled.",
          },
          {
            role: NOTIFICATION_ROLES.SELLER,
            recipientIds: (payload) => normalizeIdList(payload.sellerId || payload.sellerIds),
            title: () => "Order Cancelled",
            body: (payload) =>
              payload.sellerMessage ||
              (payload.orderId
                ? `Order #${payload.orderId} has been cancelled.`
                : "An order has been cancelled."),
          },
        ],
      };
    case NOTIFICATION_EVENTS.REFUND_INITIATED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Refund Initiated",
        body: () => "Refund has been initiated for your order.",
      };
    case NOTIFICATION_EVENTS.REFUND_COMPLETED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Refund Completed",
        body: () => "Refund has been completed.",
      };
    case NOTIFICATION_EVENTS.NEW_ORDER:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) =>
          normalizeIdList(payload.sellerId || payload.sellerIds),
        title: () => "New Order",
        body: (payload) =>
          payload.orderId
            ? `New order #${payload.orderId} received.`
            : "You have received a new order.",
      };
    case NOTIFICATION_EVENTS.SELLER_DELIVERY_ARRIVED:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => normalizeIdList(payload.sellerId),
        title: () => "Delivery Partner Arrived 🚚",
        body: (payload) =>
          payload.orderId
            ? `The delivery partner has arrived at your store to pickup order #${payload.orderId}.`
            : "The delivery partner has arrived at your store for pickup.",
      };
    case NOTIFICATION_EVENTS.CUSTOMER_RIDER_ASSIGNED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Rider Assigned 🛵",
        body: (payload) => {
          const r = payload.data?.rider || {};
          return r.name
            ? `${r.name}${r.vehicleNumber ? ` (${r.vehicleNumber})` : ""} is assigned to deliver your order${r.phone ? `. Call ${r.phone}` : ""}.`
            : "A rider has been assigned to your order.";
        },
      };
    case NOTIFICATION_EVENTS.SELLER_RIDER_ASSIGNED:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => normalizeIdList(payload.sellerId),
        title: () => "Rider Assigned 🛵",
        body: (payload) => {
          const r = payload.data?.rider || {};
          const ord = payload.orderId ? ` for order #${payload.orderId}` : "";
          return r.name
            ? `${r.name}${r.vehicleNumber ? ` (${r.vehicleNumber})` : ""} will pick up${ord}${r.phone ? `. Call ${r.phone}` : ""}.`
            : `A rider has been assigned${ord}.`;
        },
      };
    case NOTIFICATION_EVENTS.SELLER_DELIVERY_PICKED:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => normalizeIdList(payload.sellerId),
        title: () => "Order Picked Up 📦",
        body: (payload) =>
          payload.orderId
            ? `The rider has picked up order #${payload.orderId}.`
            : "The rider has picked up the order.",
      };
    case NOTIFICATION_EVENTS.SELLER_PICKUP_OTP:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => normalizeIdList(payload.sellerId),
        title: () => "Pickup Verification OTP 🔐",
        body: (payload) =>
          payload.data?.otp
            ? `Your pickup verification OTP is ${payload.data.otp}. Share this with the delivery partner.`
            : "Your pickup verification OTP has been sent.",
      };
    case NOTIFICATION_EVENTS.CUSTOMER_DELIVERY_OTP:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Delivery OTP 🔐",
        body: (payload) =>
          payload.data?.otp
            ? `Your delivery OTP for order #${payload.orderId || ''} is ${payload.data.otp}. Share this with the delivery partner.`
            : "Your delivery OTP has been sent.",
      };
    case NOTIFICATION_EVENTS.RETURN_PICKUP_OTP:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Return Pickup OTP 🔐",
        body: (payload) =>
          payload.data?.otp
            ? `Your return pickup OTP for order #${payload.orderId || ''} is ${payload.data.otp}. Share this with the delivery partner.`
            : "Your return pickup OTP has been sent.",
      };
    case NOTIFICATION_EVENTS.RETURN_DROP_OTP:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => normalizeIdList(payload.sellerId),
        title: () => "Return Drop OTP 🔐",
        body: (payload) =>
          payload.data?.otp
            ? `Return drop OTP for order #${payload.orderId || ''} is ${payload.data.otp}. Share with delivery partner to confirm receipt.`
            : "Your return drop OTP has been sent.",
      };
    case NOTIFICATION_EVENTS.DELIVERY_ASSIGNED:
      return {
        role: NOTIFICATION_ROLES.DELIVERY,
        recipientIds: (payload) => normalizeIdList(payload.deliveryId),
        title: () => "Delivery Assigned",
        body: (payload) =>
          payload.orderId
            ? `You have been assigned order #${payload.orderId}.`
            : "A new delivery has been assigned to you.",
      };
    case NOTIFICATION_EVENTS.NEW_DELIVERY_BROADCAST:
      return {
        role: NOTIFICATION_ROLES.DELIVERY,
        recipientIds: (payload) => normalizeIdList(payload.deliveryIds),
        title: () => "New Delivery Request 🛍️",
        body: (payload) =>
          payload.orderId
            ? `New order #${payload.orderId} is available nearby.`
            : "A new delivery request is available nearby.",
      };
    case NOTIFICATION_EVENTS.ORDER_READY:
      return {
        role: NOTIFICATION_ROLES.DELIVERY,
        recipientIds: (payload) => normalizeIdList(payload.deliveryId),
        title: () => "Order Ready",
        body: (payload) =>
          payload.orderId
            ? `Order #${payload.orderId} is ready for pickup.`
            : "An order is ready for pickup.",
      };
    // ── Return Workflow Events ──────────────────────────────────────────────
    case NOTIFICATION_EVENTS.RETURN_REQUESTED:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => normalizeIdList(payload.sellerId),
        title: () => "Return Request Received",
        body: (payload) =>
          payload.orderId
            ? `Customer has requested a return for order #${payload.orderId}.`
            : "A new return request has been received.",
      };
    case NOTIFICATION_EVENTS.RETURN_APPROVED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) =>
          normalizeIdList(payload.customerId || payload.userId),
        title: () => "Return Approved ✅",
        body: (payload) =>
          payload.orderId
            ? `Your return request for order #${payload.orderId} has been approved. A delivery partner will collect the product.`
            : "Your return request has been approved.",
      };
    case NOTIFICATION_EVENTS.RETURN_REJECTED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) =>
          normalizeIdList(payload.customerId || payload.userId),
        title: () => "Return Request Rejected",
        body: (payload) =>
          `Your return request for order #${payload.orderId || ""} was rejected.${
            payload.data?.reason ? " Reason: " + payload.data.reason : ""
          }`,
      };
    case NOTIFICATION_EVENTS.NEW_RETURN_BROADCAST:
      return {
        role: NOTIFICATION_ROLES.DELIVERY,
        recipientIds: (payload) => normalizeIdList(payload.deliveryIds),
        title: () => "New Return Pickup Task 📦",
        body: (payload) =>
          payload.orderId
            ? `Return pickup for order #${payload.orderId} is available nearby.`
            : "A new return pickup task is available nearby.",
      };
    case NOTIFICATION_EVENTS.RETURN_PICKUP_ASSIGNED:
      return {
        role: NOTIFICATION_ROLES.DELIVERY,
        recipientIds: (payload) => normalizeIdList(payload.deliveryId),
        title: () => "Return Pickup Assigned",
        body: (payload) =>
          `Return pickup for order #${payload.orderId || ""}.${
            payload.data?.commission
              ? " Commission: ₹" + payload.data.commission + "."
              : ""
          } Check app for details.`,
      };
    case NOTIFICATION_EVENTS.RETURN_PICKUP_OTP:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) =>
          normalizeIdList(payload.customerId || payload.userId),
        title: () => "Your Return Pickup OTP 🔐",
        body: (payload) =>
          payload.data?.otp
            ? `Your return pickup OTP is ${payload.data.otp}. Share this with the delivery partner. Valid for 10 mins.`
            : "Your return pickup OTP has been sent.",
      };
    case NOTIFICATION_EVENTS.RETURN_DROP_OTP:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => normalizeIdList(payload.sellerId),
        title: () => "Return Drop OTP 🔐",
        body: (payload) =>
          payload.data?.otp
            ? `Return drop OTP for order #${payload.orderId}: ${payload.data.otp}. Share with delivery partner.`
            : "A return drop OTP has been generated.",
      };
    case NOTIFICATION_EVENTS.RETURN_COMPLETED:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => normalizeIdList(payload.sellerId),
        title: () => "Product Returned to Store",
        body: (payload) =>
          `Product for order #${payload.orderId || ""} has been returned. Admin QC is pending.`,
      };
    case NOTIFICATION_EVENTS.RETURN_QC_PASSED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) =>
          normalizeIdList(payload.customerId || payload.userId),
        title: () => "QC Passed — Refund Initiated 💸",
        body: (payload) =>
          `Quality check passed for order #${payload.orderId || ""}. Refund of ₹${
            payload.data?.refundAmount || 0
          } credited to your wallet.`,
      };
    case NOTIFICATION_EVENTS.RETURN_QC_FAILED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) =>
          normalizeIdList(payload.customerId || payload.userId),
        title: () => "QC Failed — No Refund",
        body: (payload) =>
          `Quality check failed for order #${payload.orderId || ""}. No refund will be issued.${
            payload.data?.note ? " Note: " + payload.data.note : ""
          }`,
      };
    case NOTIFICATION_EVENTS.SUPPORT_TICKET_MESSAGE:
      return {
        multi: true,
        definitions: [
          {
            role: NOTIFICATION_ROLES.ADMIN,
            recipientIds: (payload) => {
              const fromRole = String(payload.fromRole || "").toLowerCase();
              if (fromRole === "admin") return [];
              return normalizeIdList(payload.adminIds);
            },
            title: (payload) => {
              const name = String(payload.userName || "Customer").trim() || "Customer";
              return `Support message from ${name}`;
            },
            body: (payload) => truncateText(payload.messageText || "New message"),
          },
          {
            role: NOTIFICATION_ROLES.CUSTOMER,
            recipientIds: (payload) => {
              const fromRole = String(payload.fromRole || "").toLowerCase();
              if (fromRole !== "admin") return [];
              return normalizeIdList(payload.userId || payload.customerId);
            },
            title: () => "Support reply",
            body: (payload) => truncateText(payload.messageText || "New message"),
          },
        ],
      };
    case NOTIFICATION_EVENTS.PRODUCT_MODERATION_REQUEST:
      return {
        role: NOTIFICATION_ROLES.ADMIN,
        recipientIds: (payload) => normalizeIdList(payload.adminIds),
        title: () => "Product Moderation Request",
        body: (payload) =>
          `Seller requested ${payload.action === 'update' ? 'an update to' : 'to create'} product: ${truncateText(payload.productName)}. Pending admin approval.`,
      };
    case NOTIFICATION_EVENTS.LOW_STOCK_ALERT:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => normalizeIdList(payload.sellerId),
        title: (payload) => {
          const productName = String(payload.productName || "Product").trim() || "Product";
          return `${productName} is running low`;
        },
        body: (payload) => {
          const variantName = String(payload.variantName || "").trim();
          const currentStock = Number(payload.currentStock || 0);
          const itemLabel = variantName ? `${variantName}` : "this item";
          return `Only ${currentStock} left for ${itemLabel}. Restock soon.`;
        },
      };
    case NOTIFICATION_EVENTS.GENERIC_ALERT:
      return {
        role: payload.role || NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => {
            const ids = normalizeIdList(payload.userId || payload.customerId || payload.adminId);
            if (ids.length === 0 && payload.role === NOTIFICATION_ROLES.ADMIN) {
                return ['admin_broadcast'];
            }
            return ids;
        },
        title: (payload) => payload.title || "Alert",
        body: (payload) => payload.message || payload.body || "You have a new alert.",
      };
    case NOTIFICATION_EVENTS.BIRTHDAY_REWARD:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId || payload.recipientId),
        title: (payload) => payload.title || "Happy Birthday! 🎉",
        body: (payload) => payload.message || "We have a special birthday gift for you!",
      };
    case NOTIFICATION_EVENTS.MILESTONE_UNLOCKED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: (payload) => payload.title || "Congratulations! Milestone Reached 🎉",
        body: (payload) => payload.message || "You have unlocked a new milestone reward!",
      };
    case NOTIFICATION_EVENTS.CUSTOMER_REGISTRATION:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: (payload) => payload.title || "Welcome to Noyo-kart!",
        body: (payload) => payload.message || "Thank you for registering. Start shopping today!",
      };
    case NOTIFICATION_EVENTS.CUSTOMER_LOGIN:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: (payload) => payload.title || "New Login Alert",
        body: (payload) => payload.message || "A new login to your account was detected.",
      };
    case NOTIFICATION_EVENTS.CUSTOMER_OTP_VERIFIED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: (payload) => payload.title || "OTP Verified",
        body: (payload) => payload.message || "Your OTP has been successfully verified.",
      };
    case NOTIFICATION_EVENTS.CUSTOMER_WALLET_CREDIT:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: (payload) => payload.title || "Wallet Credited 💸",
        body: (payload) => payload.message || (payload.data?.amount ? `₹${payload.data.amount} has been added to your wallet.` : "Your wallet has been credited."),
      };
    case NOTIFICATION_EVENTS.CUSTOMER_WALLET_DEBIT:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: (payload) => payload.title || "Wallet Debited",
        body: (payload) => payload.message || (payload.data?.amount ? `₹${payload.data.amount} has been deducted from your wallet.` : "Funds have been deducted from your wallet."),
      };
    case NOTIFICATION_EVENTS.CUSTOMER_COUPON_EARNED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: (payload) => payload.title || "New Coupon Earned! 🎫",
        body: (payload) => payload.message || "You've earned a new coupon. Check your rewards!",
      };
    case NOTIFICATION_EVENTS.CUSTOMER_OFFER_NOTIFICATION:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: (payload) => payload.title || "Special Offer for You! 🎁",
        body: (payload) => payload.message || "Check out our latest offers tailored just for you.",
      };
    case NOTIFICATION_EVENTS.CUSTOMER_SUBSCRIPTION_UPDATE:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: (payload) => payload.title || "Subscription Update",
        body: (payload) => payload.message || "There has been an update to your subscription plan.",
      };
    case NOTIFICATION_EVENTS.CUSTOMER_PAYMENT_FAILED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: (payload) => payload.title || "Payment Failed ❌",
        body: (payload) => payload.message || "Your recent payment attempt failed. Please try again.",
      };
    case NOTIFICATION_EVENTS.CUSTOMER_WITHDRAWAL_UPDATE:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: (payload) => payload.title || "Withdrawal Update",
        body: (payload) => payload.message || "There is an update regarding your withdrawal request.",
      };
    case NOTIFICATION_EVENTS.CUSTOMER_REVIEW_REMINDER:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: (payload) => payload.title || "Rate your recent purchase ⭐",
        body: (payload) => payload.message || "How was your recent order? Leave a review and let us know!",
      };
    case NOTIFICATION_EVENTS.CUSTOMER_LOW_WALLET_BALANCE:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: (payload) => payload.title || "Low Wallet Balance",
        body: (payload) => payload.message || "Your wallet balance is running low. Recharge now!",
      };
    case NOTIFICATION_EVENTS.CUSTOMER_ADDRESS_VERIFIED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: (payload) => payload.title || "Address Verified",
        body: (payload) => payload.message || "Your new delivery address has been verified successfully.",
      };
    case NOTIFICATION_EVENTS.CUSTOMER_PRODUCT_BACK_IN_STOCK:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: (payload) => payload.title || "Back in Stock! 📦",
        body: (payload) => payload.message || "An item you wishlisted is now back in stock. Grab it fast!",
      };
    case NOTIFICATION_EVENTS.CUSTOMER_PRICE_DROP:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: (payload) => payload.title || "Price Drop Alert! 📉",
        body: (payload) => payload.message || "Great news! A product you've been watching just got cheaper.",
      };
    default:
      if (eventType && typeof eventType === 'string') {
        const roleStr = roleFromEvent(eventType) || NOTIFICATION_ROLES.CUSTOMER;
        return {
          role: roleStr,
          recipientIds: (payload) => {
             if (roleStr === NOTIFICATION_ROLES.CUSTOMER) return normalizeIdList(payload.userId || payload.customerId);
             if (roleStr === NOTIFICATION_ROLES.SELLER) return normalizeIdList(payload.sellerId || payload.sellerIds);
             if (roleStr === NOTIFICATION_ROLES.DELIVERY) return normalizeIdList(payload.deliveryId || payload.deliveryIds);
             if (roleStr === NOTIFICATION_ROLES.ADMIN) {
                 if (payload.adminIds) return normalizeIdList(payload.adminIds);
                 return ['admin_broadcast'];
             }
             return normalizeIdList(payload.userId);
          },
          title: (payload) => payload.title || eventType.replace(/_/g, ' '),
          body: (payload) => payload.message || payload.body || `New event: ${eventType.replace(/_/g, ' ')}`,
        };
      }
      return null;
  }
}

function eventData(eventType, payload = {}, role) {
  if (eventType === NOTIFICATION_EVENTS.LOW_STOCK_ALERT) {
    const productId = String(payload.productId || "").trim() || undefined;
    return {
      eventType,
      productId,
      currentStock: Number(payload.currentStock || 0),
      threshold: Number(payload.threshold || 0),
      variantSku: String(payload.variantSku || "").trim() || undefined,
      variantName: String(payload.variantName || "").trim() || undefined,
      imageUrl: String(payload.imageUrl || "").trim() || undefined,
      link: buildSellerInventoryLink(productId),
      ...(payload.data || {}),
    };
  }

  if (eventType === NOTIFICATION_EVENTS.SUPPORT_TICKET_MESSAGE) {
    const ticketId = String(payload.ticketId || "").trim() || undefined;
    const link =
      role === NOTIFICATION_ROLES.ADMIN
        ? buildAdminSupportLink(ticketId)
        : buildCustomerSupportLink(ticketId);

    return {
      eventType,
      ticketId,
      link,
      ...(payload.data || {}),
    };
  }



  const orderId = String(payload.orderId || "").trim() || undefined;
  const checkoutGroupId = String(payload.checkoutGroupId || "").trim() || undefined;
  
  let link = buildOrderLink(orderId);
  if (role === NOTIFICATION_ROLES.DELIVERY) {
    link = buildDeliveryOrderLink(orderId);
  } else if (role === NOTIFICATION_ROLES.SELLER) {
    const baseUrl = getFrontendBaseUrl();
    link = orderId ? `${baseUrl}/seller/orders?search=${encodeURIComponent(orderId)}` : `${baseUrl}/seller/orders`;
  }

  return {
    eventType,
    orderId,
    checkoutGroupId,
    link,
    ...(payload.data || {}),
  };
}

export function buildNotification(eventType, payload = {}) {
  const result = eventDefinition(eventType);
  if (!result) return [];

  const definitions = result.multi ? result.definitions : [result];
  const notifications = [];

  for (const def of definitions) {
    const recipientIds = def.recipientIds(payload);
    if (!recipientIds.length) continue;

    const role = def.role;
    const title = def.title(payload);
    const body = def.body(payload);
    const data = eventData(eventType, payload, role);

    recipientIds.forEach((recipientId) => {
      notifications.push({
        userId: recipientId,
        role,
        recipient: recipientId,
        recipientModel: ROLE_TO_RECIPIENT_MODEL[role],
        type: eventType,
        title,
        body,
        message: body,
        data,
        channel: "push",
        provider: "fcm",
      });
    });
  }

  return notifications;
}

export default {
  buildNotification,
};
