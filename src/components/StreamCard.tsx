"use client";

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
    return (
      <div className="rounded-xl border border-arc-border bg-arc-card p-6 animate-pulse h-48" />
    );
  }

  const [employer, employee, ratePerSecond, , , , active, invoiceRef] = stream;
  const runwaySec = Number(runwayRaw ?? 0n);

  return (
    <div className={cn(
      "rounded-xl border bg-arc-card p-6 space-y-4 transition-all",
      active ? "border-arc-blue/40" : "border-arc-border opacity-60"
    )}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", active ? "bg-green-400 animate-pulse" : "bg-gray-500")} />
            <span className="text-sm font-medium text-gray-400">
              Stream #{streamId.toString()}
            </span>
            {invoiceRef && (
              <span className="text-xs px-2 py-0.5 rounded bg-arc-border text-gray-400 font-mono">
                {invoiceRef}
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {perspective === "employer" ? (
              <>Employee: <span className="font-mono text-gray-400">{shortenAddress(employee)}</span></>
            ) : (
              <>Employer: <span className="font-mono text-gray-400">{shortenAddress(employer)}</span></>
            )}
          </div>
        </div>
        <div className="text-right text-xs text-gray-500">
          <div>${rateToDaily(ratePerSecond)}<span className="text-gray-600">/day</span></div>
          <div>${rateToMonthly(ratePerSecond)}<span className="text-gray-600">/mo</span></div>
        </div>
      </div>

      {/* Live ticker */}
      <div className="py-2">
        <div className="text-xs text-gray-500 mb-1">
          {perspective === "employee" ? "Ready to withdraw" : "Owed so far"}
        </div>
        <StreamTicker
          initialAccrued={accruedRaw ?? 0n}
          ratePerSecond={ratePerSecond}
          active={active}
        />
      </div>

      {/* Runway */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">Runway</span>
        <span className={cn("font-mono", runwaySec < 3600 ? "text-red-400" : "text-gray-300")}>
          {active ? formatRunway(runwaySec) : "—"}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {perspective === "employee" && active && (
          <button
            onClick={onWithdraw}
            className="flex-1 py-2 rounded-lg bg-arc-blue hover:bg-blue-600 text-white text-sm font-medium transition-colors"
          >
            Withdraw Now
          </button>
        )}
        {perspective === "employer" && (
          <>
            <button
              onClick={onTopUp}
              className="flex-1 py-2 rounded-lg bg-arc-border hover:bg-arc-border/70 text-white text-sm font-medium transition-colors"
            >
              Top Up
            </button>
            {active && (
              <button
                onClick={onCancel}
                className="py-2 px-4 rounded-lg border border-red-500/30 hover:border-red-500 text-red-400 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
