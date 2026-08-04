"use client";

import { Radio, ArrowRight, Copy, Check, Download, Share2, Loader2, Clock } from "lucide-react";
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

/** Inline Cadence waveform mark — plain SVG (no framer-motion) so it captures cleanly. */
function ReceiptMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <rect width="64" height="64" rx="16" fill="#171618" />
      <path
        d="M13 39C19 39 19 25 25 25C31 25 31 39 37 39C43 39 43 25 51 25"
        stroke="#2b44e7"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Anti-tamper backdrop rendered behind the receipt content: a faint tiled
 * "CADENCE" watermark plus a repeating waveform guilloche. Because it sits
 * across the whole card (including over the value rows) at low opacity, editing
 * a number in an image editor without disturbing the pattern is hard — the
 * classic security-paper trick. Rendered as inline SVG so html-to-image keeps
 * it in the export. Pointer-events-none so it never intercepts clicks.
 */
function AntiTamperBackdrop({ id }: { id: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <svg width="100%" height="100%" className="absolute inset-0">
        <defs>
          {/* Repeating waveform line, echoing the brand mark. */}
          <pattern
            id={`wave-${id}`}
            width="120"
            height="26"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-8)"
          >
            <path
              d="M0 20C15 20 15 6 30 6C45 6 45 20 60 20C75 20 75 6 90 6C105 6 105 20 120 20"
              stroke="#2b44e7"
              strokeWidth="1"
              fill="none"
              opacity="0.06"
            />
          </pattern>
          {/* Diagonal repeated wordmark. */}
          <pattern
            id={`mark-${id}`}
            width="300"
            height="150"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-24)"
          >
            <text
              x="0"
              y="40"
              fontFamily="ui-monospace, monospace"
              fontSize="17"
              fontWeight="700"
              letterSpacing="7"
              fill="#171618"
              opacity="0.035"
            >
              CADENCE · CADENCE
            </text>
            <text
              x="-80"
              y="115"
              fontFamily="ui-monospace, monospace"
              fontSize="17"
              fontWeight="700"
              letterSpacing="7"
              fill="#171618"
              opacity="0.035"
            >
              CADENCE · CADENCE
            </text>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#wave-${id})`} />
        <rect width="100%" height="100%" fill={`url(#mark-${id})`} />
      </svg>
      {/* Oversized ghost mark bleeding off the corner for depth. */}
      <svg
        className="absolute -right-8 -top-10"
        width="180"
        height="180"
        viewBox="0 0 64 64"
        fill="none"
      >
        <path
          d="M13 39C19 39 19 25 25 25C31 25 31 39 37 39C43 39 43 25 51 25"
          stroke="#2b44e7"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.05"
        />
      </svg>
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
  const patternId = stream.id.toString();
  // Scheduled: active on-chain but its start is still in the future.
  const notStarted = stream.active && Number(stream.startTime) > Math.floor(Date.now() / 1000);

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
    const node = cardRef.current;
    if (!node) return null;
    // Fonts must be ready or the first paint captures with fallback metrics (or
    // blank text). Then render twice: the first pass warms html-to-image's
    // internal image/font caches — on some engines the very first toPng of a
    // node comes back empty, so we discard it and keep the second.
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        /* fonts API flaky — proceed anyway */
      }
    }
    const opts = {
      pixelRatio: 2,
      backgroundColor: "#f7f6f2",
      cacheBust: true,
    };
    await toPng(node, opts); // warm-up (discarded)
    const dataUrl = await toPng(node, opts);
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
      <div ref={cardRef} className="relative overflow-hidden rounded-none bg-[#f7f6f2] p-5">
        <AntiTamperBackdrop id={patternId} />

        {/* All content sits above the backdrop. */}
        <div className="relative">
          {/* Brand header */}
          <div className="flex items-center justify-between pb-4">
            <div className="flex items-center gap-2.5">
              <ReceiptMark size={34} />
              <div className="leading-none">
                <p className="text-base font-semibold tracking-tight text-panel">Cadence</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-panel/40">
                  Stream receipt
                </p>
              </div>
            </div>
            {notStarted ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-volt/20 bg-volt-wash px-2.5 py-1 text-xs font-medium text-volt">
                <Clock size={11} /> Scheduled
              </span>
            ) : stream.active ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-volt/20 bg-volt-wash px-2.5 py-1 text-xs font-medium text-volt">
                <Radio size={11} /> Live
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-panel/10 bg-panel/[0.04] px-2.5 py-1 text-xs font-medium text-panel/50">
                <span className="h-1.5 w-1.5 rounded-full bg-panel/30" /> Ended
              </span>
            )}
          </div>

          {/* Stream id */}
          <div className="flex items-center justify-between border-y border-panel/10 py-2.5">
            <span className="text-xs uppercase tracking-wide text-panel/45">Stream</span>
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
            <p className="text-xs uppercase tracking-wide text-panel/45">
              {notStarted ? "Scheduled to stream" : "Streamed so far"}
            </p>
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
            <Row label={notStarted ? "Starts" : "Opened"}>{formatTimestamp(stream.startTime)}</Row>
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
