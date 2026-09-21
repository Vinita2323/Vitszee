const fs = require('fs');
const file = 'backend/app/controller/orderFinanceController.js';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('import { emitNotificationEvent }')) {
  content = content.replace(
    'import { buildCheckoutPricingSnapshot } from "../services/checkoutPricingService.js";',
    'import { buildCheckoutPricingSnapshot } from "../services/checkoutPricingService.js";\nimport { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";\nimport { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";'
  );
}

const emitCode = `
    const returnData = updatedWithCod || updated;
    emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_DELIVERED, {
      orderId: returnData.orderId,
      customerId: returnData.customer,
      userId: returnData.customer,
      sellerId: returnData.seller,
    });`;

if (!content.includes('NOTIFICATION_EVENTS.ORDER_DELIVERED')) {
  content = content.replace(
    'return handleResponse(res, 200, "Order delivered and COD cash collected", updatedWithCod);',
    `${emitCode}\n      return handleResponse(res, 200, "Order delivered and COD cash collected", updatedWithCod);`
  );
  
  content = content.replace(
    'return handleResponse(res, 200, "Order delivered and settlement queued", updated);',
    `${emitCode}\n    return handleResponse(res, 200, "Order delivered and settlement queued", updated);`
  );
}

fs.writeFileSync(file, content);
console.log('patched orderFinanceController');
