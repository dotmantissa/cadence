"use client";

import { useState } from "react";
import { usePrivy, useLogin, useLogout, useWallets } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, LogOut, Loader2 } from "lucide-react";
import { shortenAddress } from "@/lib/utils";

/**
 * Privy-backed connect button. One entry point for both routes: connecting an
 * external wallet and logging in with email. The generate-or-import choice for
 * email users is handled globally by <WalletOnboarding />.
 */
export function ConnectWallet() {
  const { ready, authenticated } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();
  const { wallets } = useWallets();
  const { address: wagmiAddress } = useAccount();
  const [hover, setHover] = useState(false);

  const address =
    wagmiAddress ?? (wallets[0]?.address as `0x${string}` | undefined);

  if (!ready) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-paper/50 px-4 py-2 text-sm text-ink/40">
        <Loader2 size={14} className="animate-spin" />
        <span className="font-mono">warming up</span>
      </span>
    );
  }

  if (authenticated && address) {
    return (
      <button
        onClick={() => logout()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="group inline-flex items-center gap-2 rounded-full border border-ink/10 bg-paper/60 px-4 py-2 font-mono text-sm text-ink transition-colors hover:border-ink/20"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-volt/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-volt" />
        </span>
        <AnimatePresence mode="wait" initial={false}>
          {hover ? (
            <motion.span
              key="dc"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="inline-flex items-center gap-1.5"
            >
              <LogOut size={13} /> Sign out
            </motion.span>
          ) : (
            <motion.span
              key="addr"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
            >
              {shortenAddress(address)}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    );
  }

  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={() => login()}
      className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink-soft"
    >
      <Wallet size={15} /> Connect
    </motion.button>
  );
}
