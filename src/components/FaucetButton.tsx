"use client";

import { useState } from "react";
import { Droplets, Loader2, Check, ExternalLink } from "lucide-react";
import { useActiveAddress } from "@/hooks/useActiveAddress";
import { useApi } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

const FAUCET_URL = "https://faucet.circle.com";

type State = "idle" | "loading" | "dripped" | "rate-limited" | "manual" | "error";

/**
 * "Get testnet USDC" for the connected wallet on Arc Testnet.
 *
 * First it asks our server to drip via Circle (no redirect, no tab switch). If
 * Circle can't serve the drip (the account isn't entitled to the programmatic
 * faucet, which is the norm for testnet keys), we DON'T yank the user out to a
 * new tab. Instead we copy their address and switch the button into a "manual"
 * state: a second, deliberate click opens the public faucet with the address
 * ready to paste. The redirect only ever happens on an explicit user action.
 *
 * Lives on the dark balance card, so it wears the on-panel palette.
 */
export function FaucetButton({ className }: { className?: string }) {
  const { address } = useActiveAddress();
  const { api, authenticated } = useApi();
  const [state, setState] = useState<State>("idle");

  if (!address) return null;

  function flash(next: State, ms = 6000) {
    setState(next);
    setTimeout(() => setState("idle"), ms);
  }

  /** Copy the address and arm the manual faucet link (no auto-open). */
  async function armManual() {
    try {
      await navigator.clipboard.writeText(address!);
    } catch {
      // Clipboard blocked (insecure context / permissions): the faucet page
      // still lets them paste the address in by hand.
    }
    setState("manual");
  }

  async function handleClick() {
    if (state === "loading") return;

    // Manual state is already armed: this click is the user's explicit request
    // to open the faucet, so a new tab here is expected, not a surprise.
    if (state === "manual") {
      window.open(`${FAUCET_URL}/?address=${address}`, "_blank", "noopener,noreferrer");
      return;
    }

    // Not signed in to our API (shouldn't happen on a gated page): go straight
    // to the manual path rather than burning an unauthenticated request.
    if (!authenticated) {
      await armManual();
      return;
    }

    setState("loading");
    try {
      const res = await api.faucet(address!);
      if (res.dripped) {
        flash("dripped");
      } else if (res.rateLimited) {
        flash("rate-limited");
      } else {
        // fallback === true: Circle declined the programmatic drip. Arm the
        // manual link instead of redirecting.
        await armManual();
      }
    } catch {
      // Our route itself errored: still give them a usable path to funds.
      await armManual();
    }
  }

  const label =
    state === "loading"
      ? "Requesting…"
      : state === "dripped"
      ? "USDC on the way"
      : state === "rate-limited"
      ? "Already funded — try later"
      : state === "manual"
      ? "Address copied · open faucet"
      : state === "error"
      ? "Try again"
      : "Get testnet USDC";

  const icon =
    state === "loading" ? (
      <Loader2 size={13} className="animate-spin" />
    ) : state === "dripped" || state === "rate-limited" ? (
      <Check size={13} />
    ) : state === "manual" ? (
      <ExternalLink size={13} />
    ) : (
      <Droplets size={13} />
    );

  return (
    <button
      onClick={handleClick}
      disabled={state === "loading"}
      title={
        state === "manual"
          ? "Address copied — opens Circle's faucet in a new tab"
          : "Fund this wallet with Arc Testnet USDC"
      }
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-panel-foreground/80 backdrop-blur transition-colors hover:bg-white/10 hover:text-panel-foreground disabled:opacity-60",
        className
      )}
    >
      {icon}
      {label}
    </button>
  );
}
