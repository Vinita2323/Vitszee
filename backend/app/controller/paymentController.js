import handleResponse from "../utils/helper.js";
import {
  createPaymentOrderForOrderRef,
  verifyPaymentStatus as verifyPaymentStatusService,
  processWebhook,
} from "../services/paymentService.js";
import {
  createPaymentOrderSchema,
  verifyPaymentClientSchema,
  validateSchema,
} from "../validation/paymentValidation.js";
import logger from "../services/logger.js";

function resolvePaymentErrorMessage(error) {
  const directMessage = String(error?.message || "").trim();
  if (directMessage) return directMessage;

  const responseStatusText = String(error?.response?.statusText || "").trim();
  if (responseStatusText) return `Payment gateway error: ${responseStatusText}`;

  const razorpayErrorDescription = String(error?.error?.description || "").trim();
  if (razorpayErrorDescription) return `Razorpay error: ${razorpayErrorDescription}`;

  const causeCode = String(error?.cause?.code || error?.code || "").trim();
  if (causeCode) return `Payment gateway request failed (${causeCode})`;

  return "Unable to initiate payment right now";
}

export const createPaymentOrder = async (req, res) => {
  try {
    const payload = validateSchema(createPaymentOrderSchema, req.body || {});
    const result = await createPaymentOrderForOrderRef({
      orderRef: payload.orderRef || payload.orderId,
      userId: req.user?.id,
      idempotencyKey: req.headers["idempotency-key"] || null,
      correlationId: req.correlationId || null,
    });

    return handleResponse(
      res,
      result.duplicate ? 200 : 201,
      result.duplicate ? "Re-using existing payment" : "Payment initiated",
      {
        payment: result.payment,
        redirectUrl: result.redirectUrl,
        merchantOrderId: result.payment.gatewayOrderId,
      },
    );
  } catch (error) {
    logger.error("createPaymentOrder failed", {
      scope: "PaymentController.createPaymentOrder",
      message: error?.message,
      statusCode: error?.statusCode || error?.status || 500,
      code: error?.code || error?.cause?.code || null,
      responseStatus: error?.response?.status || null,
      responseStatusText: error?.response?.statusText || null,
      orderRef: req.body?.orderRef || req.body?.orderId || null,
      userId: req.user?.id || null,
      correlationId: req.correlationId || null,
    });
    return handleResponse(
      res,
      error.statusCode || error.status || 500,
      resolvePaymentErrorMessage(error),
    );
  }
};

export const verifyPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const merchantOrderId = id || req.query.merchantOrderId;
    
    if (!merchantOrderId) {
        return handleResponse(res, 400, "merchantOrderId is required");
    }

    const verification = await verifyPaymentStatusService({
      merchantOrderId,
      userId: req.user?.id,
      correlationId: req.correlationId || null,
    });

    return handleResponse(res, 200, "Payment status verified", {
      status: verification.status,
      payment: verification.payment,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const handlePhonePeWebhook = async (req, res) => {
  try {
    const authorization = req.headers["x-verify"] || req.headers["authorization"];
    const rawBody = req.body;

    if (!authorization) {
        logger.warn("PhonePe webhook missing verification header", {
          scope: "PaymentController.handlePhonePeWebhook",
          correlationId: req.correlationId || null,
          ip: req.ip,
        });
        return res.status(401).send("Unauthorized");
    }

    const result = await processWebhook({
      rawBody,
      authorization,
      correlationId: req.correlationId || null,
    });

    if (result.accepted) {
      return res.status(200).send("OK");
    }
    
    return res.status(400).send("Bad Request");
  } catch (error) {
    logger.error("PhonePe webhook processing failed", {
      scope: "PaymentController.handlePhonePeWebhook",
      correlationId: req.correlationId || null,
      message: error?.message,
      error,
    });
    return res.status(500).send("Internal Server Error");
  }
};

export const handleRazorpayWebhook = async (req, res) => {
  try {
    const authorization = req.headers["x-razorpay-signature"];
    const rawBody = req.body;

    if (!authorization) {
        logger.warn("Razorpay webhook missing signature header", {
          scope: "PaymentController.handleRazorpayWebhook",
          correlationId: req.correlationId || null,
          ip: req.ip,
        });
        return res.status(401).send("Unauthorized");
    }

    const result = await processWebhook({
      rawBody,
      authorization,
      correlationId: req.correlationId || null,
      webhookEventId: req.headers["x-razorpay-event-id"] || null,
    });

    if (result.accepted) {
      return res.status(200).send("OK");
    }
    
    return res.status(400).send("Bad Request");
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500);
    if (statusCode === 401 || statusCode === 400) {
      return res.status(statusCode).send(statusCode === 401 ? "Unauthorized" : "Bad Request");
    }
    logger.error("Razorpay webhook processing failed", {
      scope: "PaymentController.handleRazorpayWebhook",
      correlationId: req.correlationId || null,
      message: error?.message,
      error,
    });
    return res.status(500).send("Internal Server Error");
  }
};

export const getPaymentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const merchantOrderId = id;
    
        const verification = await verifyPaymentStatusService({
          merchantOrderId,
          userId: req.user?.id,
          correlationId: req.correlationId || null,
        });
    
        return handleResponse(res, 200, "Payment status retrieved", {
          status: verification.status,
          merchantOrderId: verification.payment.gatewayOrderId,
          amount: verification.payment.amount,
          currency: verification.payment.currency,
        });
      } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
      }
};
export const handleRazorpayMockBypass = async (req, res) => {
  try {
    const { merchantOrderId, redirect } = req.query;
    if (!merchantOrderId) return res.status(400).send('Missing merchantOrderId');

    const mockPayload = {
      event: 'payment_link.paid',
      payload: {
        payment_link: {
          entity: {
            reference_id: merchantOrderId,
            status: 'paid',
            id: 'plink_mock_' + Date.now(),
          }
        }
      }
    };

    req.headers['x-razorpay-signature'] = 'MOCK_SIGNATURE';
    req.body = Buffer.from(JSON.stringify(mockPayload));
    
    await processWebhook('razorpay', {
      rawBody: req.body,
      authorization: 'MOCK_SIGNATURE',
    });

    return res.redirect(redirect);
  } catch (error) {
    logger.error('Razorpay mock bypass failed', { error: error.message });
    return res.status(500).send('Mock bypass failed');
  }
};
