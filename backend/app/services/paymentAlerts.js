import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_ROLES,
} from "../modules/notifications/notification.constants.js";

/**
 * Admin alert for payment problems that need a person (reconciliation,
 * failed refunds, repeatedly failing webhooks). `token` makes the
 * notification unique per business event so the pipeline de-duplicates it.
 */
export function alertAdmins({ title, message, token }) {
  emitNotificationEvent(NOTIFICATION_EVENTS.GENERIC_ALERT, {
    role: NOTIFICATION_ROLES.ADMIN,
    title,
    message,
    orderId: token,
    kind: "PAYMENT_ALERT",
  });
}
