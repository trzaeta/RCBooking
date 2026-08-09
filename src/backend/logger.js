import { now } from "./utils.js";

export function createActionLog(actionLogger) {
  return (action, user, details = {}) => {
    const detailText = Object.entries(details)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join(" ");
    const actor = user ? `${user.role}:${user.id}` : "system";
    actionLogger(`[RCBooking] ${now()} ${actor} ${action}${detailText ? ` ${detailText}` : ""}`);
  };
}
