"use client";

import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";

/**
 * Client for account-activity emails. Every call posts to /api/notify with the
 * Privy bearer, and the server decides who to email and what to say.
 *
 * Callers may await this after a confirmed chain action. A notification failure
 * still resolves to false and never changes the outcome of the chain action,
 * but awaiting the request prevents a modal close/navigation from abandoning
 * the request before the server can process it.
 */

export type NotifyEvent =
  | "welcome"
  | "signin"
  | "stream_started"
  | "stream_activated"
  | "stream_claimed"
  | "stream_topped_up"
  | "stream_cancelled"
  | "request_received"
  | "counter_offer"
  | "receipt";

export interface NotifyPayload {
  /** Counterparty wallet address; the server resolves their email from it. */
  counterpartyAddress?: string | null;
  /** Counterparty display name, for a receipt where no address is involved. */
  counterpartyName?: string | null;
  /** Deposit in 6-decimal USDC base units, as a string. */
  amount?: string | null;
  /** Pay rate per second in 6-decimal USDC base units, as a string. */
  rate?: string | null;
  /** Invoice or memo reference. */
  reference?: string | null;
  /** Formatted "starts" date for a scheduled stream. */
  starts?: string | null;
  /** Formatted timestamp for a receipt. */
  when?: string | null;
  /**
   * The caller's role in this stream, so activation and other two-sided events
   * can route the correctly-worded email to each party regardless of which side
   * fired the notify. "employer" = payer, "employee" = payee.
   */
  perspective?: "employer" | "employee";
  /** Amount already streamed, in 6-decimal USDC base units, for a cancellation. */
  streamed?: string | null;
  /** Amount refunded to the payer, in 6-decimal USDC base units, for a cancellation. */
  refund?: string | null;
  /**
   * Whether to also email the caller their own copy. Defaults to true on the
   * server. Batch streams set this false on all but the first recipient so the
   * payer gets a single confirmation instead of one per payee.
   */
  notifySelf?: boolean;
}

export function useNotify() {
  const { getAccessToken } = usePrivy();

  const notify = useCallback(
    async (event: NotifyEvent, payload: NotifyPayload = {}): Promise<boolean> => {
      try {
        const token = await getAccessToken();
        if (!token) return false;
        const response = await fetch("/api/notify", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ event, ...payload }),
          keepalive: true,
        });
        let body: { ok?: boolean; sent?: number } = {};
        try {
          body = (await response.json()) as typeof body;
        } catch {
          // The status code still tells us whether the request was accepted.
        }
        if (!response.ok || body.ok !== true) {
          console.warn("[notify] request failed", {
            event,
            status: response.status,
          });
          return false;
        }
        return (body.sent ?? 0) > 0;
      } catch (error) {
        console.warn("[notify] request unavailable", {
          event,
          error: error instanceof Error ? error.message : "unknown error",
        });
        return false;
      }
    },
    [getAccessToken]
  );

  return { notify };
}
