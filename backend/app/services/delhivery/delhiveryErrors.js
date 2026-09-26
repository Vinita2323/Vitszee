/**
 * Standardized Delhivery Error Hierarchy
 */

export class DelhiveryError extends Error {
  constructor(message, code = "DELHIVERY_ERROR", statusCode = 500, details = null) {
    super(message);
    this.name = "DelhiveryError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class DelhiveryAuthError extends DelhiveryError {
  constructor(message = "Delhivery authentication failed. Check the API token.", details = null) {
    super(message, "DELHIVERY_AUTH_ERROR", 401, details);
    this.name = "DelhiveryAuthError";
  }
}

export class DelhiveryInvalidRequestError extends DelhiveryError {
  constructor(message = "Invalid payload provided for Delhivery operation.", details = null) {
    super(message, "DELHIVERY_INVALID_REQUEST", 400, details);
    this.name = "DelhiveryInvalidRequestError";
  }
}

export class DelhiveryServiceabilityError extends DelhiveryError {
  constructor(message = "Delhivery does not deliver to this location.", details = null) {
    super(message, "DELHIVERY_SERVICEABILITY_ERROR", 400, details);
    this.name = "DelhiveryServiceabilityError";
  }
}

export class DelhiveryOrderCreationFailedError extends DelhiveryError {
  constructor(message = "Failed to create the shipment with Delhivery.", details = null) {
    super(message, "DELHIVERY_ORDER_CREATION_FAILED", 502, details);
    this.name = "DelhiveryOrderCreationFailedError";
  }
}

export class DelhiveryWarehouseError extends DelhiveryError {
  constructor(message = "Failed to register the pickup location with Delhivery.", details = null) {
    super(message, "DELHIVERY_WAREHOUSE_FAILED", 502, details);
    this.name = "DelhiveryWarehouseError";
  }
}

export class DelhiveryPickupRequestError extends DelhiveryError {
  constructor(message = "Failed to raise a pickup request with Delhivery.", details = null) {
    super(message, "DELHIVERY_PICKUP_REQUEST_FAILED", 502, details);
    this.name = "DelhiveryPickupRequestError";
  }
}

export class DelhiveryTrackingFailedError extends DelhiveryError {
  constructor(message = "Failed to retrieve tracking information from Delhivery.", details = null) {
    super(message, "DELHIVERY_TRACKING_FAILED", 502, details);
    this.name = "DelhiveryTrackingFailedError";
  }
}

export class DelhiveryCancellationFailedError extends DelhiveryError {
  constructor(message = "Cancellation could not be completed with Delhivery.", details = null) {
    super(message, "DELHIVERY_CANCELLATION_FAILED", 400, details);
    this.name = "DelhiveryCancellationFailedError";
  }
}

export class DelhiveryTimeoutError extends DelhiveryError {
  constructor(message = "Delhivery API request timed out.", details = null) {
    super(message, "DELHIVERY_TIMEOUT", 504, details);
    this.name = "DelhiveryTimeoutError";
  }
}

export class DelhiveryRateLimitError extends DelhiveryError {
  constructor(message = "Delhivery API rate limit reached. Please try again later.", details = null) {
    super(message, "DELHIVERY_RATE_LIMITED", 429, details);
    this.name = "DelhiveryRateLimitError";
  }
}

export class DelhiveryWebhookError extends DelhiveryError {
  constructor(message = "Delhivery webhook processing error.", details = null) {
    super(message, "DELHIVERY_WEBHOOK_ERROR", 400, details);
    this.name = "DelhiveryWebhookError";
  }
}
