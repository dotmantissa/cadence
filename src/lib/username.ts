/**
 * Username rules, shared by the API, the query layer, and the client so the
 * three never drift. Handles are @-style: lowercase letters, digits, and
 * underscores, 3 to 20 characters. Always stored and compared lowercase.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/**
 * Words we won't hand out. Mostly existing/near-future route segments so a
 * `/@handle` router can never collide with a real page, plus a few we'd rather
 * keep for ourselves.
 */
export const PROFILE_RESERVED = new Set<string>([
  "admin",
  "api",
  "app",
  "cadence",
  "dashboard",
  "employee",
  "employer",
  "help",
  "login",
  "logout",
  "me",
  "new",
  "profile",
  "root",
  "settings",
  "signup",
  "stream",
  "streams",
  "support",
  "team",
  "user",
  "users",
  "wallet",
]);

export type UsernameCheck =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Normalize and validate a raw handle. Returns the canonical lowercase value on
 * success, or a human-readable reason on failure. Does not touch the database;
 * availability is a separate check.
 */
export function validateUsername(raw: string): UsernameCheck {
  const value = raw.trim().toLowerCase();
  if (value.length < USERNAME_MIN) {
    return { ok: false, error: `at least ${USERNAME_MIN} characters` };
  }
  if (value.length > USERNAME_MAX) {
    return { ok: false, error: `at most ${USERNAME_MAX} characters` };
  }
  if (!USERNAME_RE.test(value)) {
    return { ok: false, error: "lowercase letters, numbers, and _ only" };
  }
  if (PROFILE_RESERVED.has(value)) {
    return { ok: false, error: "that handle is reserved" };
  }
  return { ok: true, value };
}
