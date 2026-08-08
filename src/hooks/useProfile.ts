"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrivy, useLogout } from "@privy-io/react-auth";
import { useApi, ApiError } from "./useApi";
import type { User } from "@/db/schema";

/**
 * Syncs the current Privy user into Neon on login and exposes their profile.
 * The first GET /api/me upserts the row (server-side), so simply mounting this
 * anywhere behind auth is enough to guarantee an account exists.
 */
export function useProfile() {
  const { ready, authenticated } = usePrivy();
  const { logout } = useLogout();
  const { api } = useApi();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  // Set when a login is refused because its email belongs to another account.
  // Surfaced globally so the connect screen can explain what to do.
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) {
      setUser(null);
      return;
    }
    let alive = true;
    setLoading(true);
    api
      .getMe()
      .then((r) => {
        if (!alive) return;
        setUser(r.user);
        setAuthError(null);
      })
      .catch((e) => {
        if (!alive) return;
        // Someone signed in with an email that is bound to a different account.
        // Kick them back out and explain, rather than leaving a half-account.
        if (e instanceof ApiError && e.code === "email_bound_elsewhere") {
          setAuthError(e.message);
          logout();
          return;
        }
        // Non-fatal: the app still works without the off-chain profile.
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // api is recreated each render but its behaviour is stable; key on auth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated]);

  /**
   * Persist which dashboard the user is working in. Fire-and-forget: we update
   * local state optimistically and don't block the UI on the write.
   */
  const setRole = useCallback(
    (role: "employer" | "employee") => {
      setUser((u) => (u ? { ...u, role } : u));
      api.updateProfile({ role }).then(
        (r) => setUser(r.user),
        () => {
          /* ignore: role is a convenience, not a security boundary */
        }
      );
    },
    [api]
  );

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return { user, loading, setRole, setUser, authError, clearAuthError };
}
