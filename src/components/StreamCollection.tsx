"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X, SlidersHorizontal, FileText } from "lucide-react";
import { StreamCard } from "./StreamCard";
import { StreamReceiptModal } from "./StreamReceiptModal";
import { StatementFilterModal } from "./StatementFilterModal";
import { Pagination, usePagination } from "./Pagination";
import { payrollRefKey, type CancellationMeta, type PayrollRef, type StreamMeta } from "@/hooks/usePayroll";
import { useApi } from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import { streamMath } from "@/lib/stream-math";

type Filter = "ongoing" | "scheduled" | "awaiting_claim" | "complete" | "all";
type Identity = { username: string | null; displayName: string | null };

/** Cards per page — keeps every stream view to a compact, scannable 4-up grid. */
const PAGE_SIZE = 4;

interface Props {
  /** Decoded streams for this wallet, already newest-first. */
  streams: StreamMeta[];
  perspective: "employer" | "employee";
  /** True while the streams are still loading on a cold cache. */
  loading?: boolean;
  onWithdraw?: (ref: PayrollRef) => void;
  onCancel?: (ref: PayrollRef) => void;
  onTopUp?: (ref: PayrollRef) => void;
  cancellations?: Record<string, CancellationMeta>;
  onAppeal?: (ref: PayrollRef) => void;
  onOpenBant?: (ref: PayrollRef) => void;
  /** Rendered when this wallet has no streams at all. */
  emptyState: React.ReactNode;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ongoing", label: "Ongoing" },
  { key: "scheduled", label: "Scheduled" },
  { key: "awaiting_claim", label: "Awaiting claim" },
  { key: "complete", label: "Complete" },
  { key: "all", label: "All" },
];

/**
 * Bucket a stream into exactly one filter tab from its lifecycle phase.
 * Awaiting-claim streams are active on-chain, but time-exhausted and waiting
 * for the payee's final withdrawal, so they get their own actionable tab.
 * "complete" is any settled/ended stream.
 */
function bucketOf(s: StreamMeta, nowSec: number): Exclude<Filter, "all"> {
  const { phase } = streamMath(s, nowSec);
  if (phase === "scheduled") return "scheduled";
  if (phase === "awaiting_claim") return "awaiting_claim";
  if (phase === "claimed" || phase === "ended") return "complete";
  return "ongoing"; // live
}

/** Local end-of-day epoch (ms) for an inclusive "to" date bound. */
function endOfDay(dateStr: string): number {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}
function startOfDay(dateStr: string): number {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * The streams grid: filter tabs (ongoing / ended / all) plus an advanced search
 * that matches a stream by remark, by the counterparty it is streamed to/from
 * (wallet address OR @username), and by an opened-on date range. Counterparty
 * handles are reverse-resolved once per address set so search covers usernames.
 */
export function StreamCollection({
  streams,
  perspective,
  loading = false,
  onWithdraw,
  onCancel,
  onTopUp,
  cancellations = {},
  onAppeal,
  onOpenBant,
  emptyState,
}: Props) {
  const { api, authenticated } = useApi();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [receipt, setReceipt] = useState<StreamMeta | null>(null);
  const [identities, setIdentities] = useState<Record<string, Identity>>({});
  const [showStatement, setShowStatement] = useState(false);

  const counterpartyOf = (s: StreamMeta) =>
    (perspective === "employer" ? s.employee : s.employer).toLowerCase();

  // Unique counterparties for this list; reverse-resolve their handles for search.
  const cpKey = useMemo(
    () => Array.from(new Set(streams.map(counterpartyOf))).sort().join(","),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streams, perspective]
  );

  useEffect(() => {
    if (!authenticated || cpKey === "") return;
    const addresses = cpKey.split(",");
    let cancelled = false;
    api
      .resolveAddresses(addresses)
      .then((r) => {
        if (!cancelled) setIdentities(r.identities ?? {});
      })
      .catch(() => {
        /* search still works on remark + address without handles */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpKey, authenticated]);

  const counts = useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    let ongoing = 0;
    let scheduled = 0;
    let awaiting_claim = 0;
    let complete = 0;
    for (const s of streams) {
      const bucket = bucketOf(s, nowSec);
      if (bucket === "scheduled") scheduled++;
      else if (bucket === "awaiting_claim") awaiting_claim++;
      else if (bucket === "complete") complete++;
      else ongoing++;
    }
    return { ongoing, scheduled, awaiting_claim, complete, all: streams.length };
  }, [streams]);

  const hasDateFilter = fromDate !== "" || toDate !== "";
  const activeFilterCount = (hasDateFilter ? 1 : 0) + (query.trim() ? 1 : 0);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const from = fromDate ? startOfDay(fromDate) : null;
    const to = toDate ? endOfDay(toDate) : null;
    const nowSec = Math.floor(Date.now() / 1000);

    return streams.filter((s) => {
      // Lifecycle bucket is the single source of truth for the tab filters.
      if (filter !== "all" && bucketOf(s, nowSec) !== filter) return false;

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
        const haystack = [
          s.invoiceRef,
          cp,
          id?.username ?? "",
          id?.displayName ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streams, filter, query, fromDate, toDate, identities, perspective]);

  // Page the visible slice 4-up. Any change to the filter/search/date controls
  // resets to the first (most-recent) page via the reset key.
  const pager = usePagination(visible, PAGE_SIZE, `${filter}|${query}|${fromDate}|${toDate}`);

  // No streams on this wallet at all — the page's own empty prompt.
  if (!loading && streams.length === 0) {
    return <>{emptyState}</>;
  }

  // Every stream in this view shares one account on the perspective side.
  const account =
    streams.length > 0
      ? perspective === "employer"
        ? streams[0].employer
        : streams[0].employee
      : undefined;

  return (
    <div className="mt-8">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full overflow-x-auto rounded-full border border-ink/10 bg-paper-warm p-0.5 text-xs font-medium">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors",
                filter === f.key ? "bg-volt text-white" : "text-ink/50 hover:text-ink"
              )}
            >
              {f.label}
              <span className={cn("font-mono", filter === f.key ? "text-white/70" : "text-ink/30")}>
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35">
              <Search size={14} />
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search remark, address, @handle"
              className="w-64 rounded-full border border-ink/10 bg-paper-warm py-2 pl-9 pr-8 text-sm text-ink placeholder-ink/30 transition-colors focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/20"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/30 transition-colors hover:text-ink/60"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              "relative inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors",
              showFilters || hasDateFilter
                ? "border-volt/40 bg-volt-wash text-volt"
                : "border-ink/10 bg-paper-warm text-ink/50 hover:text-ink"
            )}
            aria-label="Date filters"
            title="Filter by date"
          >
            <SlidersHorizontal size={15} />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-volt px-1 font-mono text-[10px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowStatement(true)}
            disabled={streams.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-volt/30 bg-volt-wash px-4 text-sm font-medium text-volt transition-colors hover:bg-volt/10 disabled:opacity-40"
            title="Generate an account statement"
          >
            <FileText size={15} />
            Statement
          </button>
        </div>
      </div>

      {/* Advanced: date range */}
      {showFilters && (
        <div className="mt-3 flex flex-wrap items-end gap-4 rounded-none border border-ink/10 bg-paper-warm px-4 py-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink/45">
              Opened from
            </label>
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-ink/10 bg-paper px-3 py-1.5 text-sm text-ink focus:border-volt focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink/45">
              Opened to
            </label>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-ink/10 bg-paper px-3 py-1.5 text-sm text-ink focus:border-volt focus:outline-none"
            />
          </div>
          {hasDateFilter && (
            <button
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
              className="mb-0.5 inline-flex items-center gap-1.5 text-xs font-medium text-ink/50 transition-colors hover:text-ink"
            >
              <X size={13} /> Clear dates
            </button>
          )}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton h-56 rounded-none" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-6 rounded-none border border-dashed border-ink/15 bg-paper-warm p-12 text-center">
          <p className="text-ink/55">
            {query || hasDateFilter
              ? "No streams match those filters."
              : filter === "complete"
              ? "No completed streams yet."
              : filter === "scheduled"
              ? "No scheduled streams right now."
              : filter === "awaiting_claim"
              ? "No streams are awaiting claim right now."
              : "No ongoing streams right now."}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {pager.pageItems.map((s) => (
            <StreamCard
              key={payrollRefKey(s)}
              stream={s}
              perspective={perspective}
              counterparty={identities[counterpartyOf(s)] ?? null}
              onOpenReceipt={() => setReceipt(s)}
              onWithdraw={onWithdraw ? () => onWithdraw(s) : undefined}
              onCancel={onCancel ? () => onCancel(s) : undefined}
              onTopUp={onTopUp ? () => onTopUp(s) : undefined}
              cancellation={cancellations[payrollRefKey(s)]}
              onAppeal={onAppeal ? () => onAppeal(s) : undefined}
              onOpenBant={onOpenBant ? () => onOpenBant(s) : undefined}
            />
          ))}
        </div>
      )}

      {!loading && visible.length > 0 && (
        <Pagination
          page={pager.page}
          pageCount={pager.pageCount}
          total={pager.total}
          start={pager.start}
          end={pager.end}
          onPrev={pager.prev}
          onNext={pager.next}
        />
      )}

      {receipt && (
        <StreamReceiptModal
          stream={receipt}
          perspective={perspective}
          counterpartyName={
            identities[counterpartyOf(receipt)]?.username ??
            identities[counterpartyOf(receipt)]?.displayName ??
            null
          }
          onClose={() => setReceipt(null)}
        />
      )}

      {showStatement && account && (
        <StatementFilterModal
          account={account}
          perspective={perspective}
          streams={streams}
          identities={identities}
          onClose={() => setShowStatement(false)}
        />
      )}
    </div>
  );
}
