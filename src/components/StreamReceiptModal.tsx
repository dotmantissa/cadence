"use client";

import { Radio, ArrowRight, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Modal } from "./Modal";
import { StreamMeta, useAccrued } from "@/hooks/usePayroll";
import {
  formatUsdc,
  rateToDaily,
  rateToMonthly,
  shortenAddress,
  formatTimestamp,
  cn,
} from "@/lib/utils";

interface Props {
  stream: StreamMeta;
  perspective: "employer" | "employee";
  onClose: () => void;
}

function Row({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="shrink-0 text-xs uppercase tracking-wide text-ink/45">{label}</span>
      <span className={cn("text-right text-sm text-ink", mono && "font-mono")}>{children}</span>
    </div>
  );
}

/**
 * A shareable receipt for a single stream: parties, terms, running total, and
 * the timestamps that matter. Read from the on-chain struct, generated on open.
 */
export function StreamReceiptModal({ stream, perspective, onClose }: Props) {
  const { data: accruedRaw } = useAccrued(stream.id);
  const [copied, setCopied] = useState(false);

  const counterparty = perspective === "employer" ? stream.employee : stream.employer;
  const generatedAt = formatTimestamp(BigInt(Math.floor(Date.now() / 1000)));

  async function copyId() {
    try {
      await navigator.clipboard.writeText(`Stream #${stream.id.toString()}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Modal title="Stream receipt" onClose={onClose}>
      <div className="-mt-1">
        {/* Header: id + status */}
        <div className="flex items-center justify-between border-b border-ink/10 pb-4">
          <button
            onClick={copyId}
            title="Copy stream id"
            className="group inline-flex items-center gap-1.5 font-mono text-sm text-ink/70 transition-colors hover:text-ink"
          >
            #{stream.id.toString()}
            {copied ? (
              <Check size={13} className="text-volt" />
            ) : (
              <Copy size={13} className="text-ink/30 group-hover:text-ink/60" />
            )}
          </button>
          {stream.active ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-volt/20 bg-volt-wash px-2.5 py-1 text-xs font-medium text-volt">
              <Radio size={11} /> Live
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-ink/[0.03] px-2.5 py-1 text-xs font-medium text-ink/50">
              <span className="h-1.5 w-1.5 rounded-full bg-ink/30" /> Ended
            </span>
          )}
        </div>

        {/* Parties */}
        <div className="flex items-center justify-between gap-3 py-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-ink/45">From</p>
            <p className="truncate font-mono text-sm text-ink">
              {shortenAddress(stream.employer)}
              {perspective === "employer" && <span className="text-ink/40"> (you)</span>}
            </p>
          </div>
          <ArrowRight size={16} className="shrink-0 text-ink/30" />
          <div className="min-w-0 text-right">
            <p className="text-xs uppercase tracking-wide text-ink/45">To</p>
            <p className="truncate font-mono text-sm text-ink">
              {shortenAddress(stream.employee)}
              {perspective === "employee" && <span className="text-ink/40"> (you)</span>}
            </p>
          </div>
        </div>

        {/* Streamed so far */}
        <div className="rounded-2xl border border-ink/10 bg-volt-wash px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-ink/45">Streamed so far</p>
          <p className="mt-0.5 font-mono text-2xl font-semibold tracking-tight text-ink">
            ${formatUsdc(accruedRaw ?? 0n)}
          </p>
        </div>

        {/* Terms */}
        <div className="mt-2 divide-y divide-ink/[0.06]">
          <Row label="Rate" mono>
            ${rateToDaily(stream.ratePerSecond)}/day · ${rateToMonthly(stream.ratePerSecond)}/mo
          </Row>
          <Row label="Deposited" mono>
            ${formatUsdc(stream.deposit)}
          </Row>
          <Row label="Counterparty" mono>
            {shortenAddress(counterparty)}
          </Row>
          {stream.invoiceRef && <Row label="Remark">{stream.invoiceRef}</Row>}
          <Row label="Opened">{formatTimestamp(stream.startTime)}</Row>
          <Row label="Last withdrawal">
            {stream.lastClaimTime > stream.startTime
              ? formatTimestamp(stream.lastClaimTime)
              : "none yet"}
          </Row>
          <Row label="Receipt generated">{generatedAt}</Row>
        </div>

        <p className="mt-4 text-center text-[11px] text-ink/35">
          Figures read live from the Arc contract. Amounts in USDC.
        </p>
      </div>
    </Modal>
  );
}
