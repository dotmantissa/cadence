"use client";

import { useState } from "react";
import { usePrivy, useLogin, useLogout, useWallets } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, LogOut, Loader2, Copy, Check } from "lucide-react";
import { shortenAddress } from "@/lib/utils";
import { Modal } from "./Modal";
import { Button } from "./Button";

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
  const [copied, setCopied] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);

  // Works for every login route: wagmi covers external wallets, and Privy's
  // embedded wallet (email/social signups) surfaces here through `wallets`.
  const address =
    wagmiAddress ?? (wallets[0]?.address as `0x${string}` | undefined);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context / permissions); nothing to do.
    }
  }

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
      <>
        <div className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-paper/60 p-0.5 pl-3 font-mono text-sm text-ink">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-volt/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-volt" />
          </span>

          {/* Address — click to copy. Available to every signup method. */}
          <button
            onClick={copyAddress}
            title="Copy wallet address"
            aria-label={copied ? "Address copied" : "Copy wallet address"}
            className="group inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 transition-colors hover:bg-ink/5"
          >
            <span>{shortenAddress(address)}</span>
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span
                  key="ok"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  className="text-volt"
                >
                  <Check size={13} />
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  className="text-ink/35 transition-colors group-hover:text-ink/70"
                >
                  <Copy size={13} />
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* Sign out — always confirms first. */}
          <button
            onClick={() => setConfirmOut(true)}
            title="Sign out"
            aria-label="Sign out"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <LogOut size={14} />
          </button>
        </div>

        {confirmOut && (
          <Modal title="Sign out?" onClose={() => setConfirmOut(false)}>
            <p className="text-sm leading-relaxed text-ink/60">
              You&apos;ll be disconnected from Cadence. Your streams keep running
              on-chain, and you can sign back in anytime to pick up where you
              left off.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setConfirmOut(false)}>
                Cancel
              </Button>
              <Button
                variant="volt"
                onClick={() => {
                  setConfirmOut(false);
                  logout();
                }}
              >
                <LogOut size={15} /> Sign out
              </Button>
            </div>
          </Modal>
        )}
      </>
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
