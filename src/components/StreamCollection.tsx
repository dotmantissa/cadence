"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { StreamCard } from "./StreamCard";
import { StreamReceiptModal } from "./StreamReceiptModal";
import { useStreamsMeta, type StreamMeta } from "@/hooks/usePayroll";
import { cn } from "@/lib/utils";

type Filter = "ongoing" | "ended" | "all";

interface Props {
  /** Raw stream ids for this wallet, newest-last (as returned on-chain). */
  ids: readonly bigint[] | undefined;
  perspective: "employer" | "employee";
  /** True while the id list itself is still resolving. */
  loadingIds?: boolean;
  onWithdraw?: (id: bigint) => void;
  onCancel?: (id: bigint) => void;
  onTopUp?: (id: bigint) => void;
  /** Rendered when this wallet has no streams at all. */
  emptyState: React.ReactNode;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ongoing", label: "Ongoing" },
  { key: "ended", label: "Ended" },
  { key: "all", label: "All" },
];

/**
 * The streams grid with filter tabs (ongoing / ended / all) and a Remark search.
 * Metadata for every stream is fetched in one batched multicall so filtering and
 * searching happen client-side without a request per card.
 */
export function StreamCollection({
  ids,
  perspective,
  loadingIds = false,
  onWithdraw,
  onCancel,
  onTopUp,
  emptyState,
}: Props) {
  const [filter, setFilter] = useState<Filter>("ongoing");
  const [query, setQuery] = useState("");
  const [receipt, setReceipt] = useState<StreamMeta | null>(null);

  // Newest first for display.
  const ordered = useMemo(() => (ids ? [...ids].reverse() : []), [ids]);
  const { streams, isLoading: loadingMeta } = useStreamsMeta(ordered);

  const loading = loadingIds || (ordered.length > 0 && loadingMeta && streams.length === 0);

  const counts = useMemo(() => {
    let ongoing = 0;
    for (const s of streams) if (s.active) ongoing++;
    return { ongoing, ended: streams.length - ongoing, all: streams.length };
  }, [streams]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return streams.filter((s) => {
      if (filter === "ongoing" && !s.active) return false;
      if (filter === "ended" && s.active) return false;
      if (q && !s.invoiceRef.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [streams, filter, query]);

  // No streams on this wallet at all — the page's own empty prompt.
  if (!loading && (!ids || ids.length === 0)) {
    return <>{emptyState}</>;
  }

  return (
    <div className="mt-8">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-ink/10 bg-paper-warm p-0.5 text-xs font-medium">
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

        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35">
            <Search size={14} />
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by remark"
            className="w-56 rounded-full border border-ink/10 bg-paper-warm py-2 pl-9 pr-8 text-sm text-ink placeholder-ink/30 transition-colors focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/20"
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
      </div>

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
            {query
              ? `No streams match “${query.trim()}”.`
              : filter === "ended"
              ? "No ended streams yet."
              : "No ongoing streams right now."}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {visible.map((s) => (
            <StreamCard
              key={s.id.toString()}
              streamId={s.id}
              perspective={perspective}
              onOpenReceipt={() => setReceipt(s)}
              onWithdraw={onWithdraw ? () => onWithdraw(s.id) : undefined}
              onCancel={onCancel ? () => onCancel(s.id) : undefined}
              onTopUp={onTopUp ? () => onTopUp(s.id) : undefined}
            />
          ))}
        </div>
      )}

      {receipt && (
        <StreamReceiptModal
          stream={receipt}
          perspective={perspective}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
}
