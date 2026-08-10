/**
 * The single source of truth for email-notification categories, shared by the
 * client (the profile toggles) and the server (the per-recipient send gate).
 *
 * This module is deliberately free of any server-only import so both sides can
 * use it. Preferences live under `users.settings.notifications` as a flat map of
 * category key -> boolean. The rule everywhere: a category is ON unless the user
 * has explicitly turned it off, so new categories and existing accounts default
 * to receiving mail.
 */

export interface NotificationCategoryDef {
  key: string;
  /** Short label for the profile toggle. */
  label: string;
  /** One-line explanation under the label. */
  description: string;
}

export const NOTIFICATION_CATEGORIES = [
  {
    key: "signin",
    label: "Sign-in alerts",
    description: "When your account is signed in to.",
  },
  {
    key: "streams",
    label: "Stream activity",
    description: "When a stream to or from you opens or goes live.",
  },
  {
    key: "claims",
    label: "Withdrawals",
    description: "When money is claimed from a stream you are part of.",
  },
  {
    key: "topups",
    label: "Top-ups",
    description: "When a stream you are part of is topped up.",
  },
  {
    key: "cancellations",
    label: "Cancellations",
    description: "When a stream you are part of is cancelled.",
  },
  {
    key: "requests",
    label: "Requests and offers",
    description: "When someone requests a stream or counters your terms.",
  },
  {
    key: "receipts",
    label: "Receipts",
    description: "When you generate a stream receipt.",
  },
] as const satisfies readonly NotificationCategoryDef[];

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]["key"];

/** Pull the `{ [category]: boolean }` map out of a user's settings jsonb. */
export function readNotificationPrefs(settings: unknown): Record<string, boolean> {
  if (settings && typeof settings === "object") {
    const n = (settings as Record<string, unknown>).notifications;
    if (n && typeof n === "object") return n as Record<string, boolean>;
  }
  return {};
}

/**
 * Whether a given category should fire for a user with these settings. Unset or
 * unparseable preferences mean "on" — email is opt-out, not opt-in, so we never
 * silently stop mailing someone who never touched the toggles.
 */
export function notificationEnabled(settings: unknown, key: NotificationCategory): boolean {
  const prefs = readNotificationPrefs(settings);
  return prefs[key] !== false;
}

/**
 * Merge a settings object with an updated notification map, preserving any other
 * keys (theme, default rates, etc.) already stored under settings.
 */
export function withNotificationPrefs(
  settings: unknown,
  prefs: Record<string, boolean>
): Record<string, unknown> {
  const base = settings && typeof settings === "object" ? { ...(settings as Record<string, unknown>) } : {};
  base.notifications = prefs;
  return base;
}
