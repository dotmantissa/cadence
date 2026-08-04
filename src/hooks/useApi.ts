"use client";

import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import type { Payee, StreamDraft, User } from "@/db/schema";

/**
 * Thin client for our own /api routes. Every call carries the Privy access
 * token as a bearer, which the server verifies before touching Neon. The token
 * is fetched fresh per call (Privy rotates it), and nothing here ever sees the
 * app secret or the database URL — those stay server-side.
 */
export function useApi() {
  const { getAccessToken, authenticated, ready } = usePrivy();

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const token = await getAccessToken();
      if (!token) throw new Error("not authenticated");
      const res = await fetch(path, {
        ...init,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          ...(init?.headers ?? {}),
        },
      });
      if (!res.ok) {
        let message = `request failed (${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) message = j.error;
        } catch {
          // non-json error body, keep the status message
        }
        throw new Error(message);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    },
    [getAccessToken]
  );

  const api = {
    getMe: () => request<{ user: User }>("/api/me"),
    updateProfile: (patch: {
      displayName?: string | null;
      role?: "employer" | "employee" | null;
      settings?: Record<string, unknown>;
    }) =>
      request<{ user: User }>("/api/me", {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),

    checkUsername: (u: string) =>
      request<{ available: boolean; reason?: string }>(
        `/api/username?u=${encodeURIComponent(u)}`
      ),
    setUsername: (username: string) =>
      request<{ user: User }>("/api/username", {
        method: "POST",
        body: JSON.stringify({ username }),
      }),

    listPayees: () => request<{ payees: Payee[] }>("/api/payees"),
    addPayee: (input: {
      label: string;
      address: string;
      role?: string | null;
      note?: string | null;
    }) =>
      request<{ payee: Payee }>("/api/payees", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    deletePayee: (id: string) =>
      request<{ ok: true }>(`/api/payees/${id}`, { method: "DELETE" }),

    listDrafts: () => request<{ drafts: StreamDraft[] }>("/api/drafts"),
    saveDraft: (input: {
      id?: string;
      payeeLabel?: string | null;
      payeeAddress?: string | null;
      ratePerSecond?: string | null;
      depositAmount?: string | null;
      invoiceRef?: string | null;
      status?: "draft" | "committed";
      onchainStreamId?: string | null;
    }) =>
      request<{ draft: StreamDraft }>("/api/drafts", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    deleteDraft: (id: string) =>
      request<{ ok: true }>(`/api/drafts/${id}`, { method: "DELETE" }),
  };

  return { ready, authenticated, api };
}
