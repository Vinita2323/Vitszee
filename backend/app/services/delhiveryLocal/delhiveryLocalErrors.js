/**
 * Error hierarchy for the Delhivery Local (intracity) integration.
 * `code` is a stable machine code; `httpStatus` is what the API returned; `details`
 * carries the raw provider body for logging/debugging.
 */
export class DelhiveryLocalError extends Error {
  constructor(message, code = "DELHIVERY_LOCAL_ERROR", httpStatus = 502, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export class DelhiveryLocalConfigError extends DelhiveryLocalError {
  constructor(message, details = null) {
    super(message, "DELHIVERY_LOCAL_CONFIG", 500, details);
  }
}

export class DelhiveryLocalAuthError extends DelhiveryLocalError {
  constructor(message, details = null) {
    super(message, "DELHIVERY_LOCAL_AUTH", 401, details);
  }
}

export class DelhiveryLocalClientValidationError extends DelhiveryLocalError {
  constructor(message, details = null) {
    super(message, "DELHIVERY_LOCAL_CLIENT_VALIDATION", 403, details);
  }
}

export class DelhiveryLocalInvalidRequestError extends DelhiveryLocalError {
  constructor(message, details = null) {
    super(message, "DELHIVERY_LOCAL_INVALID_REQUEST", 422, details);
  }
}

export class DelhiveryLocalServiceabilityError extends DelhiveryLocalError {
  constructor(message, details = null) {
    super(message, "DELHIVERY_LOCAL_SERVICEABILITY", 424, details);
  }
}

export class DelhiveryLocalOrderCreationFailedError extends DelhiveryLocalError {
  constructor(message, details = null) {
    super(message, "DELHIVERY_LOCAL_ORDER_CREATION_FAILED", 502, details);
  }
}

export class DelhiveryLocalCancellationFailedError extends DelhiveryLocalError {
  constructor(message, details = null) {
    super(message, "DELHIVERY_LOCAL_CANCELLATION_FAILED", 502, details);
  }
}

export class DelhiveryLocalTrackingFailedError extends DelhiveryLocalError {
  constructor(message, details = null) {
    super(message, "DELHIVERY_LOCAL_TRACKING_FAILED", 502, details);
  }
}

export class DelhiveryLocalTimeoutError extends DelhiveryLocalError {
  constructor(message, details = null) {
    super(message, "DELHIVERY_LOCAL_TIMEOUT", 504, details);
  }
}

export class DelhiveryLocalWebhookError extends DelhiveryLocalError {
  constructor(message, details = null) {
    super(message, "DELHIVERY_LOCAL_WEBHOOK", 400, details);
  }
}
