"use client";

import { useState } from "react";
import { Droplets, Check } from "lucide-react";
import { useActiveAddress } from "@/hooks/useActiveAddress";
import { cn } from "@/lib/utils";

const FAUCET_URL = "https://faucet.circle.com";

type State = "idle" | "copied";

/**
 * "Get testnet USDC" for the connected wallet on Arc Testnet.
 *
 * The programmatic faucet path isn't available to our account (confirmed with
 * Circle support), so there's no server drip to attempt. A single click copies
 * the wallet address and opens Circle's public faucet in a new tab, address
 * ready to paste. Copy + open both fire in the same user gesture so the browser
 * doesn't block the tab.
 *
 * Lives on the dark balance card, so it wears the on-panel palette.
 */
export function FaucetButton({ className }: { className?: string }) {
  const { address } = useActiveAddress();
  const [state, setState] = useState<State>("idle");

  if (!address) return null;

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(address!);
      setState("copied");
      setTimeout(() => setState("idle"), 4000);
    } catch {
      // Clipboard blocked (insecure context / permissions): the faucet page
      // still lets them paste the address in by hand.
    }
    window.open(`${FAUCET_URL}/?address=${address}`, "_blank", "noopener,noreferrer");
  }

  const label = state === "copied" ? "Address copied · faucet opened" : "Get testnet USDC";
  const icon = state === "copied" ? <Check size={13} /> : <Droplets size={13} />;

  return (
    <button
      onClick={handleClick}
      title="Copies your address and opens Circle's faucet in a new tab"
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
