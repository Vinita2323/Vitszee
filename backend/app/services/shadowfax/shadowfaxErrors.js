/**
 * Standardized Shadowfax Error Hierarchy
 */

export class ShadowfaxError extends Error {
  constructor(message, code = "SHADOWFAX_ERROR", statusCode = 500, details = null) {
    super(message);
    this.name = "ShadowfaxError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ShadowfaxAuthError extends ShadowfaxError {
  constructor(message = "Shadowfax authentication failed. Check API credentials.", details = null) {
    super(message, "SHADOWFAX_AUTH_ERROR", 401, details);
    this.name = "ShadowfaxAuthError";
  }
}

export class ShadowfaxServiceabilityError extends ShadowfaxError {
  constructor(message = "Shadowfax delivery is currently unavailable for this location.", details = null) {
    super(message, "SHADOWFAX_SERVICEABILITY_ERROR", 400, details);
    this.name = "ShadowfaxServiceabilityError";
  }
}

export class ShadowfaxInvalidRequestError extends ShadowfaxError {
  constructor(message = "Invalid payload provided for Shadowfax operation.", details = null) {
    super(message, "SHADOWFAX_INVALID_REQUEST", 400, details);
    this.name = "ShadowfaxInvalidRequestError";
  }
}

export class ShadowfaxOrderCreationFailedError extends ShadowfaxError {
  constructor(message = "Failed to create shipment order with Shadowfax.", details = null) {
    super(message, "SHADOWFAX_ORDER_CREATION_FAILED", 502, details);
    this.name = "ShadowfaxOrderCreationFailedError";
  }
}

export class ShadowfaxOrderUpdateFailedError extends ShadowfaxError {
  constructor(message = "Failed to update shipment order with Shadowfax.", details = null) {
    super(message, "SHADOWFAX_ORDER_UPDATE_FAILED", 502, details);
    this.name = "ShadowfaxOrderUpdateFailedError";
  }
}

export class ShadowfaxTrackingFailedError extends ShadowfaxError {
  constructor(message = "Failed to retrieve shipment tracking information from Shadowfax.", details = null) {
    super(message, "SHADOWFAX_TRACKING_FAILED", 502, details);
    this.name = "ShadowfaxTrackingFailedError";
  }
}

export class ShadowfaxCancellationFailedError extends ShadowfaxError {
  constructor(message = "Cancellation could not be completed with delivery partner.", details = null) {
    super(message, "SHADOWFAX_CANCELLATION_FAILED", 400, details);
    this.name = "ShadowfaxCancellationFailedError";
  }
}

export class ShadowfaxWebhookError extends ShadowfaxError {
  constructor(message = "Shadowfax webhook processing error.", details = null) {
    super(message, "SHADOWFAX_WEBHOOK_ERROR", 400, details);
    this.name = "ShadowfaxWebhookError";
  }
}

export class ShadowfaxTimeoutError extends ShadowfaxError {
  constructor(message = "Shadowfax API request timed out.", details = null) {
    super(message, "SHADOWFAX_TIMEOUT", 504, details);
    this.name = "ShadowfaxTimeoutError";
  }
}

export class ShadowfaxRateLimitError extends ShadowfaxError {
  constructor(message = "Shadowfax API rate limit reached. Please try again later.", details = null) {
    super(message, "SHADOWFAX_RATE_LIMITED", 429, details);
    this.name = "ShadowfaxRateLimitError";
  }
}

export class ShadowfaxReversePickupFailedError extends ShadowfaxError {
  constructor(message = "Failed to create reverse pickup request with Shadowfax.", details = null) {
    super(message, "SHADOWFAX_REVERSE_PICKUP_FAILED", 502, details);
    this.name = "ShadowfaxReversePickupFailedError";
  }
}

export class ShadowfaxQcFailedError extends ShadowfaxError {
  constructor(message = "Doorstep Quality Check failed for reverse pickup.", details = null) {
    super(message, "SHADOWFAX_QC_FAILED", 400, details);
    this.name = "ShadowfaxQcFailedError";
  }
}
