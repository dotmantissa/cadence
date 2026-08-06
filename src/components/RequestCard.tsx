"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Check, X, Clock, CalendarClock, Hourglass, RotateCcw } from "lucide-react";
import { ReqStatus, type RequestMeta } from "@/hooks/usePayroll";
import { formatRunway, formatUsdc, rateToDaily, rateToMonthly, shortenAddress, cn } from "@/lib/utils";

/** Which side of the negotiation the viewer is on. */
export type ReqPerspective = "payer" | "payee";

interface Props {
  request: RequestMeta;
  perspective: ReqPerspective;
  counterpartyName?: string | null;
  /** Payer, pending: open the accept/counter modal. */
  onRespond?: () => void;
  /** Payer, pending: decline outright. */
  onDecline?: () => void;
  /** Payer, expired counter: pull the escrow back. */
  onReclaim?: () => void;
  /** Payee, pending: cancel own request. */
  onCancel?: () => void;
  /** Payee, countered: accept the counter (instant, no funds). */
  onAcceptCounter?: () => void;
  /** Payee, countered: reject the counter (refunds the payer). */
  onRejectCounter?: () => void;
  /** True while a tx for this card is in flight. */
  busy?: boolean;
}

const BADGE: Record<number, { label: string; cls: string }> = {
  [ReqStatus.Pending]: { label: "pending", cls: "border-volt/25 bg-volt-wash text-volt" },
  [ReqStatus.Countered]: { label: "counter offer", cls: "border-amber-500/25 bg-amber-500/10 text-amber-600" },
  [ReqStatus.Accepted]: { label: "accepted", cls: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600" },
  [ReqStatus.Rejected]: { label: "declined", cls: "border-ink/10 bg-ink/[0.03] text-ink/50" },
  [ReqStatus.Cancelled]: { label: "cancelled", cls: "border-ink/10 bg-ink/[0.03] text-ink/50" },
  [ReqStatus.Expired]: { label: "expired", cls: "border-ink/10 bg-ink/[0.03] text-ink/50" },
};

/** Re-render every second while a countdown is live. */
function useTick(active: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
}

export function RequestCard({
  request,
  perspective,
  counterpartyName,
  onRespond,
  onDecline,
  onReclaim,
  onCancel,
  onAcceptCounter,
  onRejectCounter,
  busy,
}: Props) {
  const { status, ratePerSecond, deposit, startAt, counterDeadline, invoiceRef } = request;
  const isCountered = status === ReqStatus.Countered;
  useTick(isCountered);

  const nowSec = Math.floor(Date.now() / 1000);
  const secondsLeft = Number(counterDeadline) - nowSec;
  const counterExpired = isCountered && secondsLeft <= 0;
  const badge = BADGE[status];

  // Only annualize when the requested commitment spans a month or more.
  const plannedSeconds = ratePerSecond > 0n ? deposit / ratePerSecond : 0n;
  const showMonthly = plannedSeconds >= 2592000n; // 30 days

  const counterparty = perspective === "payer" ? request.payee : request.payer;
  const cpLabel = counterpartyName ? `@${counterpartyName}` : shortenAddress(counterparty);
  const scheduled = startAt > 0n && Number(startAt) > nowSec;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-none border border-ink/10 bg-paper-warm p-6 text-ink"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                badge.cls
              )}
            >
              {status === ReqStatus.Accepted ? (
                <Check size={11} />
              ) : isCountered ? (
                <Hourglass size={11} />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
              )}
              {badge.label}
            </span>
            <span className="font-mono text-xs text-ink/40">#{request.id.toString()}</span>
            {invoiceRef && (
              <span className="rounded-md bg-ink/5 px-2 py-0.5 font-mono text-xs text-ink/50">
                {invoiceRef}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-ink/40">
            {perspective === "payer" ? "requested by" : "asking"}{" "}
            <span className="font-mono">{cpLabel}</span>
          </p>
        </div>
        <div className="text-right text-xs text-ink/45">
          <div className="font-mono">
            ${rateToDaily(ratePerSecond)}<span className="opacity-50">/day</span>
          </div>
          {showMonthly && (
            <div className="font-mono">
              ${rateToMonthly(ratePerSecond)}<span className="opacity-50">/mo</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs uppercase tracking-widest text-ink/40">
          {isCountered ? "countered deposit" : "requested deposit"}
        </p>
        <p className="mt-1.5 font-mono text-3xl font-semibold tracking-tight text-ink">
          ${formatUsdc(deposit)}
        </p>
        {scheduled && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-ink/45">
            <CalendarClock size={12} /> starts {new Date(Number(startAt) * 1000).toLocaleString()}
          </p>
        )}
      </div>

      {/* Countdown on a live counter offer. */}
      {isCountered && (
        <div
          className={cn(
            "mt-5 flex items-center justify-between border-t border-ink/10 pt-4 text-sm",
            counterExpired && "opacity-70"
          )}
        >
          <span className="inline-flex items-center gap-1.5 text-ink/50">
            <Clock size={13} /> {counterExpired ? "window closed" : "time to decide"}
          </span>
          <span className={cn("font-mono", counterExpired ? "text-ink/40" : "text-amber-600")}>
            {counterExpired ? "expired" : formatRunway(Math.max(0, secondsLeft))}
          </span>
        </div>
      )}

      {/* Accepted → point at the resulting stream. */}
      {status === ReqStatus.Accepted && (
        <div className="mt-5 flex items-center justify-between border-t border-ink/10 pt-4 text-sm">
          <span className="text-ink/50">Opened stream</span>
          <span className="font-mono text-emerald-600">#{request.streamId.toString()}</span>
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex gap-2.5">
        {perspective === "payer" && status === ReqStatus.Pending && (
          <>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              disabled={busy}
              onClick={onRespond}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-volt py-3 text-sm font-medium text-white transition-colors hover:bg-volt-bright disabled:opacity-40"
            >
              Review <ArrowUpRight size={16} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              disabled={busy}
              onClick={onDecline}
              className="flex items-center justify-center gap-1.5 rounded-full border border-red-400/30 px-4 py-3 text-sm font-medium text-red-500 transition-colors hover:border-red-400/60 hover:bg-red-400/10 disabled:opacity-40"
            >
              <X size={15} /> Decline
            </motion.button>
          </>
        )}

        {perspective === "payer" && isCountered && (
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-sm text-ink/50">
              {counterExpired ? "Escrow ready to reclaim" : "Waiting on their response"}
            </span>
            {counterExpired && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                disabled={busy}
                onClick={onReclaim}
                className="inline-flex items-center gap-1.5 rounded-full border border-volt/30 bg-volt-wash px-4 py-2.5 text-sm font-medium text-volt transition-colors hover:bg-volt/10 disabled:opacity-40"
              >
                <RotateCcw size={15} /> Reclaim escrow
              </motion.button>
            )}
          </div>
        )}

        {perspective === "payee" && status === ReqStatus.Pending && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            disabled={busy}
            onClick={onCancel}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-ink/15 py-3 text-sm font-medium text-ink/70 transition-colors hover:border-ink/30 hover:bg-ink/[0.04] disabled:opacity-40"
          >
            <X size={15} /> Cancel request
          </motion.button>
        )}

        {perspective === "payee" && isCountered && !counterExpired && (
          <>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              disabled={busy}
              onClick={onAcceptCounter}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-volt py-3 text-sm font-medium text-white transition-colors hover:bg-volt-bright disabled:opacity-40"
            >
              Accept counter <Check size={16} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              disabled={busy}
              onClick={onRejectCounter}
              className="flex items-center justify-center gap-1.5 rounded-full border border-red-400/30 px-4 py-3 text-sm font-medium text-red-500 transition-colors hover:border-red-400/60 hover:bg-red-400/10 disabled:opacity-40"
            >
              <X size={15} /> Reject
            </motion.button>
          </>
        )}

        {perspective === "payee" && counterExpired && (
          <span className="text-sm text-ink/45">Counter offer expired — the escrow was returned.</span>
        )}
      </div>
    </motion.div>
  );
}
