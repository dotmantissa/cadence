"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Plus, X, Radio, Clock, CheckCircle2, Hourglass, XCircle, ExternalLink } from "lucide-react";
import type { StreamMeta } from "@/hooks/usePayroll";
import { streamMath } from "@/lib/stream-math";
import { StreamTicker } from "./StreamTicker";
import { formatRunway, formatUsdc, rateToDaily, rateToMonthly, shortenAddress, streamExplorerUrl } from "@/lib/utils";
import { PAYROLL_ADDRESS } from "@/lib/contracts";
import { cn } from "@/lib/utils";

interface Props {
  /** Fully-decoded stream, batch-fetched by the parent — no per-card reads. */
  stream: StreamMeta;
  perspective: "employer" | "employee";
  onWithdraw?: () => void;
  onCancel?: () => void;
  onTopUp?: () => void;
  onOpenReceipt?: () => void;
}

export function StreamCard({ stream, perspective, onWithdraw, onCancel, onTopUp, onOpenReceipt }: Props) {
  const { id: streamId, employer, employee, ratePerSecond, startTime, active, invoiceRef } = stream;

  // A live clock so the "begins in" countdown ticks and a scheduled stream flips
  // to live on its own, without waiting for the next data poll. Only active
  // streams need it — settled cards are frozen — and it pauses while the tab is
  // hidden. Seeded once so the first paint already shows the right second.
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!active) return;
    const tick = () => setNowSec(Math.floor(Date.now() / 1000));
    tick();
    const id = setInterval(tick, 1000);
    const onVis = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [active]);

  // Accrued + runway are exact functions of the tuple we already have, so we
  // derive them locally instead of firing three more polling reads per card.
  const { notStarted, flowing, streaming, phase, unclaimed, streamedSoFar, remaining, committed, runwaySeconds, cancelled } =
    streamMath(stream, nowSec);
  const secondsUntilStart = Number(startTime) - nowSec;
  const lowRunway = streaming && runwaySeconds < 86400;
  const awaitingClaim = phase === "awaiting_claim";
  const claimed = phase === "claimed";

  // Only annualize when the commitment actually spans a month — a one-day stream
  // showing "$59.62/mo" invents a horizon that doesn't exist.
  const plannedSeconds = ratePerSecond > 0n ? committed / ratePerSecond : 0n;
  const showMonthly = plannedSeconds >= 2592000n; // 30 days

  // Employee card shows what they can cash out (unclaimed) while the stream is
  // still active; once it's settled (cancelled or fully claimed), show the total
  // streamed amount instead. Employer card always shows cumulative total streamed.
  // A scheduled stream hasn't paid anything yet, so both perspectives instead
  // show the committed (approved) amount it will stream once it starts, rather
  // than a bare $0.
  const tickerSeed = notStarted
    ? committed
    : perspective === "employee"
    ? (active ? unclaimed : streamedSoFar)
    : streamedSoFar;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      onClick={onOpenReceipt}
      role={onOpenReceipt ? "button" : undefined}
      className={cn(
        "group relative overflow-hidden rounded-none border p-6 transition-all duration-500 ease-liquid",
        onOpenReceipt && "cursor-pointer",
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
            {notStarted ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-panel-foreground/80">
                <Clock size={11} className="text-volt-bright" />
                scheduled
              </span>
            ) : streaming ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-panel-foreground/80">
                <Radio size={11} className="text-volt-bright" />
                live
              </span>
            ) : awaitingClaim ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-panel-foreground/80">
                <Hourglass size={11} className="text-volt-bright" />
                {perspective === "employee" ? "ready to claim" : "awaiting claim"}
              </span>
            ) : cancelled ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/[0.06] px-2.5 py-1 text-xs font-medium text-red-500/90">
                <XCircle size={11} className="text-red-500" />
                cancelled
              </span>
            ) : claimed ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-ink/[0.03] px-2.5 py-1 text-xs font-medium text-ink/55">
                <CheckCircle2 size={11} className="text-volt" />
                claimed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-ink/[0.03] px-2.5 py-1 text-xs font-medium text-ink/50">
                <span className="h-1.5 w-1.5 rounded-full bg-ink/30" />
                complete
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
          {showMonthly && (
            <div className="font-mono">${rateToMonthly(ratePerSecond)}<span className="opacity-50">/mo</span></div>
          )}
        </div>
      </div>

      <div className="relative mt-6">
        <p className={cn("text-xs uppercase tracking-widest", active ? "text-panel-foreground/40" : "text-ink/40")}>
          {notStarted
            ? "scheduled to stream"
            : awaitingClaim
            ? perspective === "employee"
              ? "ready to withdraw"
              : "final amount owed"
            : claimed || cancelled
            ? "total streamed"
            : perspective === "employee"
            ? "ready to withdraw"
            : "streamed"}
        </p>
        <div className="mt-1.5">
          <StreamTicker
            initialAccrued={tickerSeed}
            ratePerSecond={ratePerSecond}
            active={streaming}
            tone={active ? "ink" : "paper"}
          />
        </div>
        {!notStarted && !claimed && remaining > 0n && (
          <p className={cn("mt-1.5 font-mono text-xs", active ? "text-panel-foreground/40" : "text-ink/40")}>
            ${formatUsdc(remaining)} <span className="opacity-60">left</span>
          </p>
        )}
      </div>

      <div
        className={cn(
          "relative mt-5 flex items-center justify-between border-t pt-4 text-sm",
          active ? "border-white/10" : "border-ink/10"
        )}
      >
        <span className={active ? "text-panel-foreground/50" : "text-ink/45"}>
          {notStarted ? "begins in" : awaitingClaim || claimed || cancelled ? "status" : "runway"}
        </span>
        <span
          className={cn(
            "font-mono",
            !active
              ? cancelled
                ? "text-red-500/80"
                : claimed
                ? "text-volt"
                : "text-ink/40"
              : awaitingClaim
              ? "text-volt-bright"
              : lowRunway
              ? "text-red-400"
              : "text-volt-bright"
          )}
        >
          {notStarted
            ? formatRunway(Math.max(0, secondsUntilStart))
            : streaming
            ? formatRunway(runwaySeconds)
            : awaitingClaim
            ? perspective === "employee"
              ? "ready to claim"
              : "awaiting claim"
            : cancelled
            ? "cancelled"
            : claimed
            ? "claimed"
            : "complete"}
        </span>
      </div>

      <div className="relative mt-5 flex gap-2.5">
        {perspective === "employee" && flowing && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={(e) => {
              e.stopPropagation();
              onWithdraw?.();
            }}
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
              onClick={(e) => {
                e.stopPropagation();
                onTopUp?.();
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white/10 py-3 text-sm font-medium text-panel-foreground transition-colors hover:bg-white/15"
            >
              <Plus size={15} /> Top up
            </motion.button>
            {active && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel?.();
                }}
                className="flex items-center justify-center gap-1.5 rounded-full border border-red-400/30 px-4 py-3 text-sm font-medium text-red-400 transition-colors hover:border-red-400/60 hover:bg-red-400/10"
              >
                <X size={15} /> Cancel
              </motion.button>
            )}
          </>
        )}
      </div>

      <div className="relative mt-4 flex justify-end">
        <a
          href={streamExplorerUrl(PAYROLL_ADDRESS, streamId)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex items-center gap-1 text-xs transition-colors",
            active
              ? "text-panel-foreground/40 hover:text-panel-foreground/70"
              : "text-ink/35 hover:text-ink/60"
          )}
        >
          View on explorer <ExternalLink size={11} />
        </a>
      </div>
    </motion.div>
  );
}
