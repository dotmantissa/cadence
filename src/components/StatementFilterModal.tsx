"use client";

import { useMemo, useState } from "react";
import { X, Eye, Download, Loader2, SlidersHorizontal } from "lucide-react";
import { Modal } from "./Modal";
import { StatementPreviewModal } from "./StatementPreviewModal";
import type { StreamMeta } from "@/hooks/usePayroll";
import { streamMath } from "@/lib/stream-math";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "ongoing" | "scheduled" | "complete" | "cancelled";

interface Props {
  account: `0x${string}`;
  perspective: "employer" | "employee";
  /** All streams for this wallet, newest-first. */
  streams: StreamMeta[];
  identities: Record<string, { username: string | null; displayName: string | null }>;
  onClose: () => void;
}

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ongoing", label: "Ongoing" },
  { key: "scheduled", label: "Scheduled" },
  { key: "complete", label: "Complete" },
  { key: "cancelled", label: "Cancelled" },
];

function startOfDay(dateStr: string): number {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(dateStr: string): number {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * Statement filter modal: user picks date range, status, and text search to
 * determine which streams go into the statement, then views in-app or downloads
 * the PDF. The modal operates on the wallet's full stream set, independent of
 * the page's list filters.
 */
export function StatementFilterModal({ account, perspective, streams, identities, onClose }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [query, setQuery] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const counterpartyOf = (s: StreamMeta) =>
    (perspective === "employer" ? s.employee : s.employer).toLowerCase();

  // Apply filters to determine what goes into the statement.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const from = fromDate ? startOfDay(fromDate) : null;
    const to = toDate ? endOfDay(toDate) : null;
    const nowSec = Math.floor(Date.now() / 1000);

    return streams.filter((s) => {
      // Status bucket.
      if (statusFilter !== "all") {
        const m = streamMath(s, nowSec);
        const bucket: StatusFilter = m.cancelled
          ? "cancelled"
          : m.phase === "scheduled"
          ? "scheduled"
          : m.phase === "claimed" || m.phase === "ended"
          ? "complete"
          : "ongoing";
        if (bucket !== statusFilter) return false;
      }

      // Date range on the opened-at time.
      if (from !== null || to !== null) {
        const openedMs = Number(s.startTime) * 1000;
        if (from !== null && openedMs < from) return false;
        if (to !== null && openedMs > to) return false;
      }

      // Text: remark, counterparty address, or counterparty handle/name.
      if (q) {
        const cp = counterpartyOf(s);
        const id = identities[cp];
        const haystack = [s.invoiceRef, cp, id?.username ?? "", id?.displayName ?? ""]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streams, statusFilter, fromDate, toDate, query, identities, perspective]);

  const hasFilters = statusFilter !== "all" || fromDate !== "" || toDate !== "" || query.trim() !== "";

  async function handleDownload() {
    if (filtered.length === 0) return;
    setDownloading(true);
    try {
      const { generateStatementPdf } = await import("@/lib/statement");
      generateStatementPdf({ account, perspective, streams: filtered, identities });
    } catch {
      /* generation failed silently */
    } finally {
      setDownloading(false);
    }
  }

  function handlePreview() {
    if (filtered.length === 0) return;
    setShowPreview(true);
  }

  if (showPreview) {
    return (
      <StatementPreviewModal
        account={account}
        perspective={perspective}
        streams={filtered}
        identities={identities}
        onClose={() => setShowPreview(false)}
      />
    );
  }

  return (
    <Modal title="Generate statement" onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm text-ink/60">
          Choose which streams to include in your account statement, then view it in-app or download
          as a PDF.
        </p>

        {/* Filters */}
        <div className="space-y-4 rounded-2xl border border-ink/10 bg-paper-warm p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink/50">
            <SlidersHorizontal size={13} /> Filters
          </div>

          {/* Status */}
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-ink/50">
              Status
            </label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setStatusFilter(opt.key)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    statusFilter === opt.key
                      ? "border-volt bg-volt text-white"
                      : "border-ink/10 bg-paper text-ink/60 hover:border-ink/25 hover:text-ink"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/50">
                Opened from
              </label>
              <input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm text-ink focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/50">
                Opened to
              </label>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm text-ink focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/20"
              />
            </div>
          </div>

          {/* Text search */}
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/50">
              Search
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Remark, address, or @handle"
              className="w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm text-ink placeholder-ink/30 focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/20"
            />
          </div>

          {/* Clear */}
          {hasFilters && (
            <button
              onClick={() => {
                setStatusFilter("all");
                setFromDate("");
                setToDate("");
                setQuery("");
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-ink/50 transition-colors hover:text-ink"
            >
              <X size={13} /> Clear all filters
            </button>
          )}
        </div>

        {/* Summary */}
        <div className="rounded-2xl border border-volt/20 bg-volt/[0.06] p-4 text-sm">
          <p className="font-medium text-ink">
            {filtered.length === 0 ? (
              <span className="text-ink/60">No streams match the selected filters.</span>
            ) : (
              <>
                <span className="font-mono text-volt">{filtered.length}</span> stream
                {filtered.length === 1 ? "" : "s"} will be included in the statement.
              </>
            )}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-full border border-ink/10 bg-paper-warm px-5 py-2.5 text-sm font-medium text-ink/70 transition-colors hover:border-ink/25 hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={handlePreview}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-paper-warm px-5 py-2.5 text-sm font-medium text-ink/70 transition-colors hover:border-ink/25 hover:text-ink disabled:opacity-40"
          >
            <Eye size={15} />
            Preview
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading || filtered.length === 0}
            className="inline-flex items-center gap-2 rounded-full bg-volt px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-volt-bright disabled:opacity-40"
          >
            {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Download PDF
          </button>
        </div>
      </div>
    </Modal>
  );
}
