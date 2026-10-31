import { emitNotificationEvent } from "../../modules/notifications/notification.emitter.js";
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_ROLES,
} from "../../modules/notifications/notification.constants.js";

/**
 * Thin wrapper over the existing notification pipeline (GENERIC_ALERT).
 * `token` makes the notification key unique per business event, so the
 * pipeline's own de-duplication drops repeats; callers additionally use
 * atomic "already notified" flags on the documents.
 */
export function notifyCaptain(captainId, { title, message, token }) {
  if (!captainId) return;
  emitNotificationEvent(NOTIFICATION_EVENTS.GENERIC_ALERT, {
    role: NOTIFICATION_ROLES.DELIVERY,
    userId: String(captainId),
    title,
    message,
    orderId: token,
    kind: "CASH_SETTLEMENT",
  });
}

export function notifyAdmins({ title, message, token }) {
  emitNotificationEvent(NOTIFICATION_EVENTS.GENERIC_ALERT, {
    role: NOTIFICATION_ROLES.ADMIN,
    title,
    message,
    orderId: token,
    kind: "CASH_SETTLEMENT",
  });
}
