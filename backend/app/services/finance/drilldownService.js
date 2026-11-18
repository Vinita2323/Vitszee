import Order from "../../models/order.js";
import Payout from "../../models/payout.js";
import LedgerEntry from "../../models/ledgerEntry.js";
import { PAYOUT_STATUS, PAYOUT_TYPE } from "../../constants/finance.js";

/**
 * Provides raw, paginated records that make up the aggregated stats on the Admin Wallet.
 */
export async function getFinanceDrilldown({ metricType, page = 1, limit = 10 }) {
  console.log("[DRILLDOWN] Start with metricType:", metricType);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
  const skip = (safePage - 1) * safeLimit;

  let query = {};
  let model = null;
  let populateOptions = [];
  let sortOption = { createdAt: -1 };
  
  // Define columns returned for the frontend generic table
  let columns = [];
  
  // Format the document to the table schema
  let mapper = (doc) => doc;

  switch (metricType) {
    case "Total Platform Earning":
      model = Order;
      query = { status: "delivered" };
      populateOptions = [
        { path: "seller", select: "shopName name" }
      ];
      columns = [
        { key: "id", label: "Order ID" },
        { key: "date", label: "Date" },
        { key: "vendor", label: "Vendor" },
        { key: "paymentMode", label: "Payment Mode" },
        { key: "amount", label: "Gross Total (₹)" }
      ];
      mapper = (doc) => ({
        id: doc.orderId,
        date: new Date(doc.createdAt).toLocaleDateString('en-GB'),
        vendor: doc.seller?.shopName || doc.seller?.name || "System",
        paymentMode: doc.paymentMode,
        amount: doc.paymentBreakdown?.grandTotal || doc.pricing?.total || 0,
        rawId: doc._id
      });
      break;

    case "Total Admin Earning":
      model = Order;
      query = { 
        status: "delivered", 
        $or: [
          { paymentMode: "ONLINE" },
          { paymentMode: "COD", "financeFlags.codMarkedCollected": true }
        ]
      };
      populateOptions = [
        { path: "seller", select: "shopName name" }
      ];
      columns = [
        { key: "id", label: "Order ID" },
        { key: "date", label: "Date" },
        { key: "vendor", label: "Vendor" },
        { key: "amount", label: "Admin Earning (₹)" }
      ];
      mapper = (doc) => ({
        id: doc.orderId,
        date: new Date(doc.createdAt).toLocaleDateString('en-GB'),
        vendor: doc.seller?.shopName || doc.seller?.name || "N/A",
        amount: doc.paymentBreakdown?.platformTotalEarning || 0,
        rawId: doc._id
      });
      break;

    case "Product Commission":
      model = Order;
      query = { status: "delivered", "paymentBreakdown.adminProductCommissionTotal": { $gt: 0 } };
      populateOptions = [
        { path: "seller", select: "shopName name" }
      ];
      columns = [
        { key: "id", label: "Order ID" },
        { key: "date", label: "Date" },
        { key: "vendor", label: "Vendor" },
        { key: "amount", label: "Commission (₹)" }
      ];
      mapper = (doc) => ({
        id: doc.orderId,
        date: new Date(doc.createdAt).toLocaleDateString('en-GB'),
        vendor: doc.seller?.shopName || doc.seller?.name || "N/A",
        amount: doc.paymentBreakdown?.adminProductCommissionTotal || 0,
        rawId: doc._id
      });
      break;

    case "Handling Fees":
      model = Order;
      query = { status: "delivered", "paymentBreakdown.handlingFeeCharged": { $gt: 0 } };
      populateOptions = [
        { path: "seller", select: "shopName name" }
      ];
      columns = [
        { key: "id", label: "Order ID" },
        { key: "date", label: "Date" },
        { key: "vendor", label: "Vendor" },
        { key: "amount", label: "Handling Fee (₹)" }
      ];
      mapper = (doc) => ({
        id: doc.orderId,
        date: new Date(doc.createdAt).toLocaleDateString('en-GB'),
        vendor: doc.seller?.shopName || doc.seller?.name || "N/A",
        amount: doc.paymentBreakdown?.handlingFeeCharged || 0,
        rawId: doc._id
      });
      break;

    case "Delivery Fees":
      model = Order;
      query = { status: "delivered", "paymentBreakdown.deliveryFeeCharged": { $gt: 0 } };
      populateOptions = [
        { path: "seller", select: "shopName name" },
        { path: "deliveryBoy", select: "name" }
      ];
      columns = [
        { key: "id", label: "Order ID" },
        { key: "date", label: "Date" },
        { key: "vendor", label: "Vendor" },
        { key: "amount", label: "Delivery Fee (₹)" }
      ];
      mapper = (doc) => ({
        id: doc.orderId,
        date: new Date(doc.createdAt).toLocaleDateString('en-GB'),
        vendor: doc.seller?.shopName || doc.seller?.name || "N/A",
        amount: doc.paymentBreakdown?.deliveryFeeCharged || 0,
        rawId: doc._id
      });
      break;

    case "Seller Pending Payouts":
      model = Payout;
      query = { status: { $in: [PAYOUT_STATUS.PENDING, PAYOUT_STATUS.PROCESSING] }, payoutType: PAYOUT_TYPE.SELLER };
      populateOptions = [
        { path: "beneficiaryId", select: "shopName name phone", model: "Seller" }
      ];
      columns = [
        { key: "id", label: "Payout ID" },
        { key: "date", label: "Request Date" },
        { key: "vendor", label: "Vendor" },
        { key: "status", label: "Status" },
        { key: "amount", label: "Amount (₹)" }
      ];
      mapper = (doc) => ({
        id: doc.payoutId || doc._id.toString().substring(0, 8).toUpperCase(),
        date: new Date(doc.createdAt).toLocaleDateString('en-GB'),
        vendor: doc.beneficiaryId?.shopName || doc.beneficiaryId?.name || "N/A",
        status: doc.status,
        amount: doc.amount,
        rawId: doc._id
      });
      break;

    case "Delivery Pending Payouts":
      model = Payout;
      query = { status: { $in: [PAYOUT_STATUS.PENDING, PAYOUT_STATUS.PROCESSING] }, payoutType: PAYOUT_TYPE.DELIVERY_PARTNER };
      populateOptions = [
        { path: "beneficiaryId", select: "name phone", model: "Delivery" }
      ];
      columns = [
        { key: "id", label: "Payout ID" },
        { key: "date", label: "Request Date" },
        { key: "vendor", label: "Rider" },
        { key: "status", label: "Status" },
        { key: "amount", label: "Amount (₹)" }
      ];
      mapper = (doc) => ({
        id: doc.payoutId || doc._id.toString().substring(0, 8).toUpperCase(),
        date: new Date(doc.createdAt).toLocaleDateString('en-GB'),
        vendor: doc.beneficiaryId?.name || "N/A",
        status: doc.status,
        amount: doc.amount,
        rawId: doc._id
      });
      break;

    case "Total Refunds":
      model = LedgerEntry;
      query = { type: "REFUND", direction: "CREDIT" };
      columns = [
        { key: "id", label: "Ref ID" },
        { key: "date", label: "Date" },
        { key: "description", label: "Description" },
        { key: "amount", label: "Amount (₹)" }
      ];
      mapper = (doc) => ({
        id: doc.reference || doc.transactionId || doc._id.toString().substring(0, 8).toUpperCase(),
        date: new Date(doc.createdAt).toLocaleDateString('en-GB'),
        description: doc.description || "Refund Processed",
        amount: doc.amount,
        rawId: doc._id
      });
      break;
      
      default:
      console.log("[DRILLDOWN] Unsupported metricType:", metricType);
      return {
        items: [],
        columns: [],
        page: safePage,
        limit: safeLimit,
        total: 0,
        totalPages: 0,
        unsupported: true
      };
  }
  console.log("[DRILLDOWN] Executing query:", JSON.stringify(query));

  const [rawItems, total] = await Promise.all([
    model.find(query)
      .populate(populateOptions)
      .sort(sortOption)
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    model.countDocuments(query)
  ]);

  console.log("[DRILLDOWN] Result total:", total, "rawItems:", rawItems.length);

  const items = rawItems.map(mapper);

  return {
    items,
    columns,
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.ceil(total / safeLimit) || 1,
  };
}
