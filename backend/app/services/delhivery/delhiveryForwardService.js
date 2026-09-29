import Order from "../../models/order.js";
import Shipment from "../../models/shipment.js";
import logger from "../logger.js";
import { getDelhiveryConfig } from "./delhiveryConfig.js";
import { DelhiveryError, delhiveryRequest } from "./delhiveryClient.js";

function last10Digits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.slice(-10);
}

function requirePin(value, label) {
  const pin = String(value || "").trim();
  if (!/^\d{6}$/.test(pin)) {
    throw new DelhiveryError(`${label} must be a 6-digit pincode.`);
  }
  return pin;
}

function postalRecord(body, pin) {
  const rows = Array.isArray(body?.delivery_codes) ? body.delivery_codes : [];
  return rows.find((row) => String(row?.postal_code?.pin || "") === String(pin)) || null;
}

function isYes(value) {
  return String(value || "").toUpperCase() === "Y";
}

export async function checkDelhiveryPincode(pin) {
  const body = await delhiveryRequest({
    method: "GET",
    path: "/c/api/pin-codes/json/",
    params: { filter_codes: pin },
  });
  const record = postalRecord(body, pin);
  const postal = record?.postal_code || {};
  return {
    serviceable: Boolean(record),
    prepaid: isYes(postal.pre_paid),
    cod: isYes(postal.cash) || isYes(postal.cod),
    pickup: isYes(postal.pickup),
    raw: postal,
  };
}

function warehouseNameForSeller(seller, config) {
  const shop = String(seller.shopName || seller.name || "").trim();
  const fallback = config.fallbackPickupLocation;
  if (shop && fallback && fallback.toLowerCase().includes(shop.toLowerCase())) {
    return fallback;
  }
  return shop.slice(0, 100);
}

function alreadyExists(error) {
  const text = `${error?.message || ""} ${JSON.stringify(error?.details || "")}`.toLowerCase();
  return text.includes("already exist") || text.includes("duplicate");
}

async function ensureWarehouse({ seller, warehouseName, config }) {
  if (!config.autoRegisterSellerWarehouse) return warehouseName;
  if (warehouseName === config.fallbackPickupLocation) return warehouseName;

  const phone = last10Digits(seller.phone);
  const pin = requirePin(seller.pincode, "Seller pickup pincode");
  const address = String(seller.address || seller.locality || seller.shopName || "").trim();
  const city = String(seller.city || "").trim();
  const state = String(seller.state || "").trim();

  try {
    await delhiveryRequest({
      method: "POST",
      path: "/api/backend/clientwarehouse/create/",
      data: {
        name: warehouseName,
        registered_name: config.clientName || warehouseName,
        phone,
        email: seller.email || undefined,
        address,
        city,
        pin,
        country: "India",
        return_address: address,
        return_pin: pin,
        return_city: city,
        return_state: state,
        return_country: "India",
      },
    });
  } catch (error) {
    if (!alreadyExists(error)) throw error;
  }
  return warehouseName;
}

function pickupDate(cutoffHour) {
  const now = new Date();
  const date = new Date(now);
  if (now.getHours() >= cutoffHour) date.setDate(date.getDate() + 1);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

async function requestPickup({ warehouseName, config }) {
  if (!config.autoPickupRequest) return null;
  return delhiveryRequest({
    method: "POST",
    path: "/fm/request/new/",
    data: {
      pickup_time: config.pickupTime,
      pickup_date: pickupDate(config.pickupCutoffHour),
      pickup_location: warehouseName,
      expected_package_count: 1,
    },
  });
}

export async function createDelhiveryForwardShipment(orderId) {
  const config = getDelhiveryConfig();
  if (!config.forwardEnabled) {
    throw new DelhiveryError("Delhivery forward delivery is turned off.");
  }

  const order = await Order.findOne({ orderId })
    .populate("customer", "name phone email addresses")
    .populate("seller", "shopName name phone email address locality city state pincode")
    .populate("items.product", "name sku");

  if (!order) throw new DelhiveryError(`Order #${orderId} not found.`);

  const existing = await Shipment.findOne({
    internalOrderId: order.orderId,
    deliveryProvider: "delhivery",
    providerType: "forward",
  });
  if (existing?.awbNumber && existing.shipmentStatus !== "FAILED" && existing.shipmentStatus !== "CANCELLED") {
    return existing;
  }

  const seller = order.seller || {};
  const customer = order.customer || {};
  const address = order.address || {};
  const sellerPhone = last10Digits(seller.phone);
  const customerPhone = last10Digits(address.phone || customer.phone);
  const sellerPin = requirePin(seller.pincode, "Seller pickup pincode");
  const customerAddress = String(address.fullAddress || address.address || address.landmark || "").trim();
  const customerPinMatch = String(address.pincode || "").trim().match(/^\d{6}$/)
    ? String(address.pincode).trim()
    : (customerAddress.match(/\b\d{6}\b/) || [])[0];
  const customerPin = requirePin(customerPinMatch, "Customer delivery pincode");
  const customerCity = String(address.city || seller.city || "").trim();
  const customerState = String(address.state || seller.state || "").trim();
  if (!sellerPhone || sellerPhone.length !== 10) {
    throw new DelhiveryError("Seller phone must be a 10-digit number.");
  }
  if (!customerPhone || customerPhone.length !== 10) {
    throw new DelhiveryError("Customer phone must be a 10-digit number.");
  }
  if (!customerAddress || !customerCity || !customerState) {
    throw new DelhiveryError("Customer delivery address, city, and state are required.");
  }
  if (!String(seller.address || seller.locality || "").trim() || !seller.city || !seller.state) {
    throw new DelhiveryError("Seller pickup address, city, and state are required.");
  }

  const isCod = String(order.paymentMode || "").toUpperCase() === "COD"
    || String(order.payment?.method || "").toLowerCase() === "cash";
  const grandTotal = Number(order.paymentBreakdown?.payableAmount ?? order.paymentBreakdown?.grandTotal ?? order.pricing?.total ?? 0);

  if (config.autoServiceabilityCheck) {
    const [pickup, drop] = await Promise.all([
      checkDelhiveryPincode(sellerPin),
      checkDelhiveryPincode(customerPin),
    ]);
    if (!pickup.serviceable || !pickup.pickup) {
      throw new DelhiveryError(`Pickup pincode ${sellerPin} is not serviceable by Delhivery.`);
    }
    if (!drop.serviceable || (isCod ? !drop.cod : !drop.prepaid)) {
      throw new DelhiveryError(`Delivery pincode ${customerPin} is not serviceable by Delhivery.`);
    }
  }

  const warehouseName = await ensureWarehouse({
    seller,
    warehouseName: warehouseNameForSeller(seller, config),
    config,
  });

  const quantity = (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 1), 0) || 1;
  const description = (order.items || [])
    .map((item) => item.name || item.product?.name || "Item")
    .filter(Boolean)
    .join(", ")
    .slice(0, 200) || "Order items";

  const payload = {
    pickup_location: { name: warehouseName },
    shipments: [
      {
        name: address.name || customer.name || "Customer",
        add: customerAddress,
        pin: customerPin,
        city: customerCity,
        state: customerState,
        country: "India",
        phone: customerPhone,
        order: String(order.orderId),
        payment_mode: isCod ? "COD" : "Prepaid",
        cod_amount: isCod ? grandTotal : 0,
        total_amount: grandTotal,
        products_desc: description,
        quantity,
        weight: config.defaultWeightGrams,
        shipping_mode: config.shippingMode,
        address_type: "home",
        seller_name: seller.shopName || seller.name || config.clientName,
        seller_add: String(seller.address || seller.locality || "").trim(),
        return_name: seller.shopName || seller.name || config.clientName,
        return_add: String(seller.address || seller.locality || "").trim(),
        return_city: seller.city,
        return_state: seller.state,
        return_pin: sellerPin,
        return_phone: sellerPhone,
        return_country: "India",
      },
    ],
  };

  const shipment = existing || new Shipment({
    orderMongoId: order._id,
    internalOrderId: order.orderId,
    clientOrderId: order.orderId,
    deliveryProvider: "delhivery",
    providerType: "forward",
    shipmentStatus: "PENDING",
    environment: config.environment,
    pickupDetails: {
      name: warehouseName,
      phone: sellerPhone,
      address: seller.address,
      city: seller.city,
      state: seller.state,
      pincode: sellerPin,
    },
    dropDetails: {
      name: address.name || customer.name,
      phone: customerPhone,
      address: customerAddress,
      city: customerCity,
      state: customerState,
      pincode: customerPin,
    },
  });
  await shipment.save();

  try {
    const created = await delhiveryRequest({
      method: "POST",
      path: "/api/cmu/create.json",
      form: { format: "json", data: JSON.stringify(payload) },
    });
    const pkg = Array.isArray(created?.packages) ? created.packages[0] : null;
    const waybill = pkg?.waybill ? String(pkg.waybill) : "";
    const status = String(pkg?.status || "").toLowerCase();
    if (!waybill || (status && status !== "success")) {
      const remark = Array.isArray(pkg?.remarks) ? pkg.remarks.filter(Boolean).join("; ") : "";
      throw new DelhiveryError(remark || "Delhivery did not return a waybill.", created);
    }

    shipment.awbNumber = waybill;
    shipment.shipmentStatus = "ORDER_CREATED";
    shipment.providerStatus = pkg.status || "Success";
    shipment.serviceabilityStatus = "serviceable";
    shipment.failureReason = null;
    shipment.lastProviderResponse = created;
    shipment.lastProviderSyncAt = new Date();
    shipment.timeline.push({
      status: "ORDER_CREATED",
      providerStatus: shipment.providerStatus,
      description: `Delhivery shipment created (waybill ${waybill})`,
      source: "api",
      timestamp: new Date(),
    });
    await shipment.save();

    let pickupResult = null;
    try {
      pickupResult = await requestPickup({ warehouseName, config });
    } catch (pickupError) {
      logger.warn(`[Delhivery] Pickup request failed for #${order.orderId}`, { error: pickupError.message });
      shipment.timeline.push({
        status: "ORDER_CREATED",
        description: `Waybill created, pickup request failed: ${pickupError.message}`,
        source: "api",
        timestamp: new Date(),
      });
      await shipment.save();
    }
    if (pickupResult) {
      shipment.timeline.push({
        status: "DISPATCH_READY",
        description: "Delhivery pickup requested",
        source: "api",
        timestamp: new Date(),
      });
      await shipment.save();
    }

    order.deliveryProvider = "delhivery";
    order.awbNumber = waybill;
    order.deliveryFailureReason = null;
    if (typeof order.save === "function") await order.save().catch(() => {});
    return shipment;
  } catch (error) {
    shipment.shipmentStatus = "FAILED";
    shipment.failureReason = error.message;
    shipment.lastProviderResponse = error.details || { error: error.message };
    await shipment.save().catch(() => {});
    order.deliveryProvider = "delhivery";
    order.deliveryFailureReason = error.message;
    if (typeof order.save === "function") await order.save().catch(() => {});
    throw error;
  }
}
