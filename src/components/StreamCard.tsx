"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Plus, X, Radio } from "lucide-react";
import { useStream, useAccrued, useRunway } from "@/hooks/usePayroll";
import { StreamTicker } from "./StreamTicker";
import { formatRunway, rateToDaily, rateToMonthly, shortenAddress } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  streamId: bigint;
  perspective: "employer" | "employee";
  onWithdraw?: () => void;
  onCancel?: () => void;
  onTopUp?: () => void;
}

export function StreamCard({ streamId, perspective, onWithdraw, onCancel, onTopUp }: Props) {
  const { data: stream } = useStream(streamId);
  const { data: accruedRaw } = useAccrued(streamId);
  const { data: runwayRaw } = useRunway(streamId);

  if (!stream) {
    return <div className="skeleton h-56 rounded-4xl" />;
  }

  const [employer, employee, ratePerSecond, , , , active, invoiceRef] = stream;
  const runwaySec = Number(runwayRaw ?? 0n);
  const lowRunway = active && runwaySec < 86400;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group relative overflow-hidden rounded-4xl border p-6 transition-all duration-500 ease-liquid",
        active
          ? "border-ink/10 bg-panel text-panel-foreground shadow-[0_24px_70px_-30px_rgba(23,22,24,0.55)]"
          : "border-ink/10 bg-paper-warm text-ink opacity-80"
      )}
    >
      {active && (
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-volt/30 blur-3xl transition-transform duration-700 ease-liquid group-hover:scale-125" />
      )}

      <div className="relative flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            {active ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-panel-foreground/80">
                <Radio size={11} className="text-volt-bright" />
                live
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-ink/[0.03] px-2.5 py-1 text-xs font-medium text-ink/50">
                <span className="h-1.5 w-1.5 rounded-full bg-ink/30" />
                ended
              </span>
            )}
            <span className={cn("font-mono text-xs", active ? "text-panel-foreground/40" : "text-ink/40")}>
              #{streamId.toString()}
            </span>
            {invoiceRef && (
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 font-mono text-xs",
                  active ? "bg-white/10 text-panel-foreground/60" : "bg-ink/5 text-ink/50"
                )}
              >
                {invoiceRef}
              </span>
            )}
          </div>
          <p className={cn("mt-2 text-xs", active ? "text-panel-foreground/40" : "text-ink/40")}>
            {perspective === "employer" ? "paying" : "from"}{" "}
            <span className="font-mono">
              {shortenAddress(perspective === "employer" ? employee : employer)}
            </span>
          </p>
        </div>
        <div className={cn("text-right text-xs", active ? "text-panel-foreground/50" : "text-ink/45")}>
          <div className="font-mono">${rateToDaily(ratePerSecond)}<span className="opacity-50">/day</span></div>
          <div className="font-mono">${rateToMonthly(ratePerSecond)}<span className="opacity-50">/mo</span></div>
        </div>
      </div>

      <div className="relative mt-6">
        <p className={cn("text-xs uppercase tracking-widest", active ? "text-panel-foreground/40" : "text-ink/40")}>
          {perspective === "employee" ? "ready to withdraw" : "streamed so far"}
        </p>
        <div className="mt-1.5">
          <StreamTicker
            initialAccrued={accruedRaw ?? 0n}
            ratePerSecond={ratePerSecond}
            active={active}
            tone={active ? "ink" : "paper"}
          />
        </div>
      </div>

      <div
        className={cn(
          "relative mt-5 flex items-center justify-between border-t pt-4 text-sm",
          active ? "border-white/10" : "border-ink/10"
        )}
      >
        <span className={active ? "text-panel-foreground/50" : "text-ink/45"}>runway</span>
        <span
          className={cn(
            "font-mono",
            !active
              ? "text-ink/40"
              : lowRunway
              ? "text-red-400"
              : "text-volt-bright"
          )}
        >
          {active ? formatRunway(runwaySec) : "done"}
        </span>
      </div>

      <div className="relative mt-5 flex gap-2.5">
        {perspective === "employee" && active && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={onWithdraw}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-volt py-3 text-sm font-medium text-white transition-colors hover:bg-volt-bright"
          >
            Cash out <ArrowUpRight size={16} />
          </motion.button>
        )}
        {perspective === "employer" && (
          <>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onTopUp}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white/10 py-3 text-sm font-medium text-panel-foreground transition-colors hover:bg-white/15"
            >
              <Plus size={15} /> Top up
            </motion.button>
            {active && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={onCancel}
                className="flex items-center justify-center gap-1.5 rounded-full border border-red-400/30 px-4 py-3 text-sm font-medium text-red-400 transition-colors hover:border-red-400/60 hover:bg-red-400/10"
              >
                <X size={15} /> Cancel
              </motion.button>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
