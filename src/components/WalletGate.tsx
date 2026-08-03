"use client";

import { motion } from "framer-motion";
import { Wallet } from "lucide-react";
import { ConnectWallet } from "./ConnectWallet";

interface Props {
  headline: string;
  sub: string;
}

/** Shown on app pages before a wallet is connected. */
export function WalletGate({ headline, sub }: Props) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-5 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-volt-wash text-volt">
          <Wallet size={26} />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tightest text-ink">{headline}</h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink/55">{sub}</p>
        <div className="mt-7">
          <ConnectWallet />
        </div>
      </motion.div>
    </div>
  );
}
