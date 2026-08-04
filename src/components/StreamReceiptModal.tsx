"use client";

import { Radio, ArrowRight, Copy, Check, Download, Share2, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toPng } from "html-to-image";
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
  /** Resolved @handle / display name of the counterparty, if known. */
  counterpartyName?: string | null;
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
      <span className="shrink-0 text-xs uppercase tracking-wide text-panel/45">{label}</span>
      <span className={cn("text-right text-sm text-panel", mono && "font-mono")}>{children}</span>
    </div>
  );
}

/**
 * A shareable receipt for a single stream: parties, terms, running total, and
 * the timestamps that matter. The card uses a fixed light palette (not the
 * theme tokens) so it stays legible in dark mode AND exports to a clean PNG.
 */
export function StreamReceiptModal({ stream, perspective, counterpartyName, onClose }: Props) {
  const { data: accruedRaw } = useAccrued(stream.id);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<null | "download" | "share">(null);
  const cardRef = useRef<HTMLDivElement>(null);

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

  async function render(): Promise<Blob | null> {
    if (!cardRef.current) return null;
    const dataUrl = await toPng(cardRef.current, {
      pixelRatio: 2,
      backgroundColor: "#f7f6f2",
      cacheBust: true,
    });
    const res = await fetch(dataUrl);
    return res.blob();
  }

  async function download() {
    setBusy("download");
    try {
      const blob = await render();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cadence-stream-${stream.id.toString()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* export failed silently — the on-screen receipt is still usable */
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    setBusy("share");
    try {
      const blob = await render();
      if (!blob) return;
      const file = new File([blob], `cadence-stream-${stream.id.toString()}.png`, {
        type: "image/png",
      });
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({
          files: [file],
          title: `Cadence stream #${stream.id.toString()}`,
          text: "Payment stream receipt",
        });
      } else {
        // No native share (most desktops) — fall back to a download.
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `cadence-stream-${stream.id.toString()}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      /* user dismissed the share sheet, or share unsupported */
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal title="Stream receipt" onClose={onClose}>
      {/* Captured card — fixed light palette so it reads in any theme + exports clean. */}
      <div ref={cardRef} className="rounded-none bg-[#f7f6f2] p-5">
        {/* Header: id + status */}
        <div className="flex items-center justify-between border-b border-panel/10 pb-4">
          <button
            onClick={copyId}
            title="Copy stream id"
            className="group inline-flex items-center gap-1.5 font-mono text-sm text-panel/70 transition-colors hover:text-panel"
          >
            #{stream.id.toString()}
            {copied ? (
              <Check size={13} className="text-volt" />
            ) : (
              <Copy size={13} className="text-panel/30 group-hover:text-panel/60" />
            )}
          </button>
          {stream.active ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-volt/20 bg-volt-wash px-2.5 py-1 text-xs font-medium text-volt">
              <Radio size={11} /> Live
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-panel/10 bg-panel/[0.04] px-2.5 py-1 text-xs font-medium text-panel/50">
              <span className="h-1.5 w-1.5 rounded-full bg-panel/30" /> Ended
            </span>
          )}
        </div>

        {/* Parties */}
        <div className="flex items-center justify-between gap-3 py-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-panel/45">From</p>
            <p className="truncate font-mono text-sm text-panel">
              {shortenAddress(stream.employer)}
              {perspective === "employer" && <span className="text-panel/40"> (you)</span>}
            </p>
          </div>
          <ArrowRight size={16} className="shrink-0 text-panel/30" />
          <div className="min-w-0 text-right">
            <p className="text-xs uppercase tracking-wide text-panel/45">To</p>
            <p className="truncate font-mono text-sm text-panel">
              {shortenAddress(stream.employee)}
              {perspective === "employee" && <span className="text-panel/40"> (you)</span>}
            </p>
          </div>
        </div>

        {/* Streamed so far */}
        <div className="rounded-none border border-volt/15 bg-volt-wash px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-panel/45">Streamed so far</p>
          <p className="mt-0.5 font-mono text-2xl font-semibold tracking-tight text-panel">
            ${formatUsdc(accruedRaw ?? 0n)}
          </p>
        </div>

        {/* Terms */}
        <div className="mt-2 divide-y divide-panel/[0.08]">
          <Row label="Rate" mono>
            ${rateToDaily(stream.ratePerSecond)}/day · ${rateToMonthly(stream.ratePerSecond)}/mo
          </Row>
          <Row label="Deposited" mono>
            ${formatUsdc(stream.deposit)}
          </Row>
          <Row label="Counterparty" mono>
            {counterpartyName ? `@${counterpartyName} · ` : ""}
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

        <p className="mt-4 text-center text-[11px] text-panel/35">
          Figures read live from the Arc contract. Amounts in USDC.
        </p>
      </div>

      {/* Actions (excluded from the captured card) */}
      <div className="mt-4 flex gap-2.5">
        <button
          onClick={download}
          disabled={busy !== null}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-volt py-3 text-sm font-medium text-white transition-colors hover:bg-volt-bright disabled:opacity-50"
        >
          {busy === "download" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          Download
        </button>
        <button
          onClick={share}
          disabled={busy !== null}
          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-ink/15 py-3 text-sm font-medium text-ink transition-colors hover:border-ink/30 hover:bg-ink/[0.04] disabled:opacity-50"
        >
          {busy === "share" ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
          Share
        </button>
      </div>
    </Modal>
  );
}
