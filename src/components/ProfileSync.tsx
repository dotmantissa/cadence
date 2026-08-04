"use client";

import { useProfile } from "@/hooks/useProfile";

/**
 * Invisible sync point. Mounting `useProfile` here means the moment anyone is
 * authenticated with Privy, GET /api/me runs and upserts their Neon users row
 * (creating it on first login, syncing email/wallet after). Rendered once at the
 * provider level so every page benefits without wiring it in per-route.
 */
export function ProfileSync() {
  useProfile();
  return null;
}
