import Shipment from "../../models/shipment.js";
import {
  checkForwardServiceability,
  createForwardOrder,
  updateForwardOrder,
  markDispatchReady as markForwardDispatchReady,
  cancelForwardOrder,
  trackForwardOrder,
} from "./shadowfaxForwardService.js";
import {
  checkReverseServiceability,
  createReversePickup,
  cancelReversePickup,
  trackReversePickup,
} from "./shadowfaxReverseService.js";
import { getShadowfaxConfig } from "./shadowfaxConfig.js";

/**
 * Universal Delivery Provider Adapter.
 * Routes logistics requests to Shadowfax or Internal Captain Flow.
 */
export class DeliveryProviderAdapter {
  /**
   * Check route serviceability.
   */
  static async checkServiceability(params, provider = "shadowfax") {
    if (provider === "shadowfax") {
      return checkForwardServiceability(params);
    }
    // Internal captain is always locally serviceable within defined radius
    return { serviceable: true, provider: "internal" };
  }

  /**
   * Create forward shipment.
   */
  static async createShipment(orderId, provider = "shadowfax", options = {}) {
    if (provider === "shadowfax") {
      return createForwardOrder(orderId, options);
    }
    // For internal provider, return internal tracking placeholder
    return {
      provider: "internal",
      internalOrderId: orderId,
      status: "DELIVERY_SEARCH",
    };
  }

  /**
   * Update shipment details.
   */
  static async updateShipment(orderId, payload, provider = "shadowfax") {
    if (provider === "shadowfax") {
      return updateForwardOrder(orderId, payload);
    }
    return { success: true };
  }

  /**
   * Mark dispatch ready (packed).
   */
  static async markDispatchReady(orderId, provider = "shadowfax") {
    if (provider === "shadowfax") {
      return markForwardDispatchReady(orderId);
    }
    return { success: true };
  }

  /**
   * Cancel shipment.
   */
  static async cancelShipment(orderId, reason, provider = "shadowfax") {
    if (provider === "shadowfax") {
      return cancelForwardOrder(orderId, reason);
    }
    return { success: true };
  }

  /**
   * Track forward shipment.
   */
  static async trackShipment(orderIdOrAwb, provider = "shadowfax") {
    if (provider === "shadowfax") {
      return trackForwardOrder(orderIdOrAwb);
    }
    const shipment = await Shipment.findOne({ internalOrderId: orderIdOrAwb });
    return shipment || { provider: "internal", status: "UNKNOWN" };
  }

  /**
   * Check reverse serviceability.
   */
  static async checkReverseServiceability(params, provider = "shadowfax") {
    if (provider === "shadowfax") {
      return checkReverseServiceability(params);
    }
    return { serviceable: true, provider: "internal" };
  }

  /**
   * Create reverse pickup.
   */
  static async createReversePickup(orderId, options = {}, provider = "shadowfax") {
    if (provider === "shadowfax") {
      return createReversePickup(orderId, options);
    }
    return { provider: "internal", internalOrderId: orderId, status: "return_approved" };
  }

  /**
   * Cancel reverse pickup.
   */
  static async cancelReversePickup(orderId, reason, provider = "shadowfax") {
    if (provider === "shadowfax") {
      return cancelReversePickup(orderId, reason);
    }
    return { success: true };
  }

  /**
   * Track reverse pickup.
   */
  static async trackReversePickup(orderIdOrRequestId, provider = "shadowfax") {
    if (provider === "shadowfax") {
      return trackReversePickup(orderIdOrRequestId);
    }
    return { provider: "internal", status: "UNKNOWN" };
  }
}
