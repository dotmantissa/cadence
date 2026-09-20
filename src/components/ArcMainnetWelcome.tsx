"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Radio, Waves } from "lucide-react";

export function ArcMainnetWelcome() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden border border-ink/10 bg-panel px-5 py-4 text-panel-foreground shadow-[0_18px_55px_-28px_rgba(16,24,40,0.65)] sm:px-6"
    >
      <motion.div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-volt/20 to-transparent"
        animate={{ x: ["-120%", "420%"] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "linear" }}
      />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-volt/30 bg-volt/10 text-volt-bright">
            <Radio size={18} />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-panel-foreground/45">
              live network
            </p>
            <p className="mt-1 text-base font-semibold tracking-tight text-panel-foreground sm:text-lg">
              Welcome to Arc Mainnet with Cadence!
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-panel-foreground/50">
          <Waves size={15} className="text-volt-bright" />
          <span>USDC streams are live</span>
          <ArrowUpRight size={14} />
        </div>
      </div>
    </motion.div>
  );
}
