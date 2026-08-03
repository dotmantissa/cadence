"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, LogOut, Check } from "lucide-react";
import { shortenAddress } from "@/lib/utils";

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [hover, setHover] = useState(false);

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="group inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-4 py-2 font-mono text-sm text-ink transition-colors hover:border-black/20"
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
              <LogOut size={13} /> Disconnect
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
      onClick={() => connect({ connector: injected() })}
      disabled={isPending}
      className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink-soft disabled:opacity-50"
    >
      {isPending ? (
        <>
          <Check size={15} className="animate-spin" /> Waking the wallet
        </>
      ) : (
        <>
          <Wallet size={15} /> Connect wallet
        </>
      )}
    </motion.button>
  );
}
