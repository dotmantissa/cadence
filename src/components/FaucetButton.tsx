"use client";

import { useState } from "react";
import { Droplets, Loader2, Check, ExternalLink } from "lucide-react";
import { useActiveAddress } from "@/hooks/useActiveAddress";
import { useApi } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

const FAUCET_URL = "https://faucet.circle.com";

type State = "idle" | "loading" | "dripped" | "rate-limited" | "opened" | "error";

/**
 * "Get testnet USDC" — one click to fund the connected wallet on Arc Testnet.
 * Tries a server-side Circle drip first (no redirect); if that isn't available
 * it copies the address and opens Circle's public faucet so the user can paste
 * and claim. Lives on the dark balance card, so it wears the on-panel palette.
 */
export function FaucetButton({ className }: { className?: string }) {
  const { address } = useActiveAddress();
  const { api, authenticated } = useApi();
  const [state, setState] = useState<State>("idle");

  if (!address) return null;

  function flash(next: State, ms = 5000) {
    setState(next);
    setTimeout(() => setState("idle"), ms);
  }

  async function openPublicFaucet() {
    try {
      await navigator.clipboard.writeText(address!);
    } catch {
      // Clipboard blocked (insecure context / permissions) — the faucet page
      // still lets them paste the address in manually.
    }
    window.open(
      `${FAUCET_URL}/?address=${address}`,
      "_blank",
      "noopener,noreferrer"
    );
    flash("opened");
  }

  async function handleClick() {
    if (state === "loading") return;
    // Not signed in to our API (shouldn't happen on a gated page) — just open the
    // public faucet directly.
    if (!authenticated) {
      await openPublicFaucet();
      return;
    }

    setState("loading");
    try {
      const res = await api.faucet(address!);
      if (res.dripped) {
        flash("dripped", 6000);
      } else if (res.rateLimited) {
        flash("rate-limited", 6000);
      } else {
        // fallback === true
        await openPublicFaucet();
      }
    } catch {
      // Our route itself errored — still get them to the faucet.
      await openPublicFaucet();
    }
  }

  const label =
    state === "loading"
      ? "Requesting…"
      : state === "dripped"
      ? "USDC on the way"
      : state === "rate-limited"
      ? "Already funded — try later"
      : state === "opened"
      ? "Faucet opened · address copied"
      : "Get testnet USDC";

  const icon =
    state === "loading" ? (
      <Loader2 size={13} className="animate-spin" />
    ) : state === "dripped" || state === "rate-limited" ? (
      <Check size={13} />
    ) : state === "opened" ? (
      <ExternalLink size={13} />
    ) : (
      <Droplets size={13} />
    );

  return (
    <button
      onClick={handleClick}
      disabled={state === "loading"}
      title="Fund this wallet with Arc Testnet USDC"
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
