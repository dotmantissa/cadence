"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Radio } from "lucide-react";
import { useLiveCounter } from "@/hooks/useLiveCounter";
import { TiltCard } from "../motion/primitives";

/** Marketing-only live counter. Shows the vibe: money that never stops moving. */
export function LiveMoneyCard() {
  const value = useLiveCounter(1284.42, 0.017361); // ~$1.5k/day feel
  const whole = Math.floor(value);
  const frac = String(Math.floor((value % 1) * 1_000_000)).padStart(6, "0");

  return (
    <TiltCard max={8} className="relative w-full max-w-md [transform-style:preserve-3d]">
      <div className="relative overflow-hidden rounded-4xl border border-black/10 bg-ink p-7 text-paper shadow-[0_30px_80px_-30px_rgba(23,22,24,0.6)]">
        {/* volt glow */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-volt/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-volt-bright/20 blur-3xl" />

        <div className="relative flex items-center justify-between">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-paper/80">
            <Radio size={12} className="text-volt-bright" />
            streaming now
          </div>
          <span className="font-mono text-xs text-paper/40">stream #0042</span>
        </div>

        <div className="relative mt-8">
          <p className="text-xs uppercase tracking-widest text-paper/40">
            earned this month
          </p>
          <div className="mt-2 flex items-baseline font-mono tabular-nums">
            <span className="text-5xl font-semibold tracking-tight sm:text-6xl">
              ${whole.toLocaleString()}
            </span>
            <span className="text-2xl font-semibold text-volt-bright sm:text-3xl">
              .{frac}
            </span>
          </div>
        </div>

        <div className="relative mt-8 grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-paper/40">rate</p>
            <p className="mt-1 font-mono text-sm">$1,500 / day</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-paper/40">runway</p>
            <p className="mt-1 font-mono text-sm text-volt-bright">27d 14h</p>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="relative mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-volt py-3.5 text-sm font-medium text-white transition-colors hover:bg-volt-bright"
        >
          Cash out <ArrowUpRight size={16} />
        </motion.button>
        <p className="relative mt-3 text-center text-xs text-paper/35">
          lands in your wallet in about 350ms
        </p>
      </div>
    </TiltCard>
  );
}
