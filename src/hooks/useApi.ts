"use client";

import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import type { Payee, StreamDraft, User } from "@/db/schema";

/**
 * Error thrown by the API client. Carries the HTTP status and, when the server
 * sent one, a machine-readable `code` so callers can branch on the reason (for
 * example logging out on `email_bound_elsewhere`) instead of matching strings.
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

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
      if (!token) throw new ApiError("not authenticated", 401);
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
        let code: string | undefined;
        try {
          const j = await res.json();
          if (j?.error) message = j.error;
          if (j?.code) code = j.code;
        } catch {
          // non-json error body, keep the status message
        }
        throw new ApiError(message, res.status, code);
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

    /** Bind a notification-only email to the current (wallet) account. */
    setNotificationEmail: (email: string) =>
      request<{ user: User }>("/api/me/email", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    /** Remove the notification email from the current account. */
    removeNotificationEmail: () =>
      request<{ user: User }>("/api/me/email", { method: "DELETE" }),

    checkUsername: (u: string) =>
      request<{ available: boolean; reason?: string }>(
        `/api/username?u=${encodeURIComponent(u)}`
      ),
    setUsername: (username: string) =>
      request<{ user: User }>("/api/username", {
        method: "POST",
        body: JSON.stringify({ username }),
      }),
    resolveUsername: (u: string) =>
      request<{
        walletAddress: string;
        username: string | null;
        displayName: string | null;
      }>(`/api/resolve?u=${encodeURIComponent(u)}`),
    resolveAddresses: (addresses: string[]) =>
      request<{
        identities: Record<string, { username: string | null; displayName: string | null }>;
      }>("/api/resolve-addresses", {
        method: "POST",
        body: JSON.stringify({ addresses }),
      }),

    /**
     * Resolve a mixed batch of recipient entries (raw addresses and/or @handles)
     * to wallets in one round-trip, for batch payments. Results come back in the
     * same order they were sent, each tagged resolved / not_found / invalid.
     */
    resolveBatch: (entries: string[]) =>
      request<{
        results: {
          input: string;
          kind: "address" | "username";
          status: "resolved" | "not_found" | "invalid";
          walletAddress: string | null;
          username: string | null;
          displayName: string | null;
          error?: string;
        }[];
      }>("/api/resolve-batch", {
        method: "POST",
        body: JSON.stringify({ entries }),
      }),

    /**
     * Ask the server to drip Arc testnet USDC to `address`. Resolves to one of:
     * `{ dripped }` (funded server-side), `{ rateLimited }` (funded recently),
     * or `{ fallback }` (client should open the public faucet).
     */
    faucet: (address: string) =>
      request<{
        dripped?: boolean;
        rateLimited?: boolean;
        fallback?: boolean;
        reason?: string;
      }>("/api/faucet", {
        method: "POST",
        body: JSON.stringify({ address }),
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
