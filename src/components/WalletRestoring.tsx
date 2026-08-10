"use client";

import { Loader2 } from "lucide-react";

/**
 * Shown in place of the connect gate while a returning user's session is still
 * rehydrating (Privy is authenticated but wagmi hasn't surfaced the address
 * yet). Holding this instead of <WalletGate /> is what stops the connect button
 * from flashing for a second on refresh before the dashboard appears. It mirrors
 * the gate's centred layout so there's no jump when it swaps out.
 */
export function WalletRestoring() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-5 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-volt-wash text-volt">
        <Loader2 size={26} className="animate-spin" />
      </div>
      <p className="mt-6 font-mono text-sm text-ink/45">restoring your session…</p>
    </div>
  );
}
