"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Client-side pagination over an already-filtered, already-ordered list.
 *
 * The lists we page are newest-first, so page 0 is always the most-recent slice.
 * State is the raw page index; `safePage` clamps it into range on every render
 * so a shrinking list (an action settles a card, a filter narrows the set) can
 * never strand the view on an empty trailing page. When `resetKey` changes —
 * a tab switch, a new search — we snap back to the first page using React's
 * "adjust state during render" pattern, so there's no one-frame flash of the
 * wrong slice that a post-render effect would cause.
 */
export function usePagination<T>(items: T[], pageSize: number, resetKey?: unknown) {
  const [page, setPage] = useState(0);
  const [prevKey, setPrevKey] = useState(resetKey);
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setPage(0);
  }

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return {
    page: safePage,
    pageCount,
    pageItems,
    total: items.length,
    start,
    end: start + pageItems.length,
    next: () => setPage(Math.min(safePage + 1, pageCount - 1)),
    prev: () => setPage(Math.max(safePage - 1, 0)),
  };
}

interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  /** Zero-based index of the first item on this page. */
  start: number;
  /** Exclusive index of the last item on this page. */
  end: number;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}

/** Prev/next control with a "showing X–Y of N" readout. Hidden on a single page. */
export function Pagination({
  page,
  pageCount,
  total,
  start,
  end,
  onPrev,
  onNext,
  className,
}: PaginationProps) {
  if (pageCount <= 1) return null;
  const btn =
    "inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-paper-warm text-ink/60 transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-ink/60";
  return (
    <div className={cn("mt-6 flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="text-xs text-ink/45">
        Showing{" "}
        <span className="font-mono text-ink/70">
          {start + 1}–{end}
        </span>{" "}
        of <span className="font-mono text-ink/70">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <button onClick={onPrev} disabled={page === 0} className={btn} aria-label="Previous page">
          <ChevronLeft size={16} />
        </button>
        <span className="font-mono text-xs text-ink/50">
          {page + 1} / {pageCount}
        </span>
        <button
          onClick={onNext}
          disabled={page >= pageCount - 1}
          className={btn}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
