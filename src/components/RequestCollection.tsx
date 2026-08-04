"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useRequestsMeta,
  useRequestActions,
  ReqStatus,
  type RequestMeta,
} from "@/hooks/usePayroll";
import { useApi } from "@/hooks/useApi";
import { RequestCard, type ReqPerspective } from "./RequestCard";
import { RespondRequestModal } from "./RespondRequestModal";
import { cn } from "@/lib/utils";

type Identity = { username: string | null; displayName: string | null };
type Tab = "open" | "settled" | "all";

interface Props {
  /** Request IDs for this wallet in the given role, newest-first. */
  ids: readonly bigint[];
  perspective: ReqPerspective;
  loading?: boolean;
  /** Re-fetch the id list after an action changes on-chain state. */
  onChanged?: () => void;
  emptyState: React.ReactNode;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "settled", label: "Settled" },
  { key: "all", label: "All" },
];

/** Open = still actionable by someone; everything else is terminal. */
function isOpen(r: RequestMeta): boolean {
  return r.status === ReqStatus.Pending || r.status === ReqStatus.Countered;
}

/**
 * The requests grid for one role. Payers see incoming requests (accept/counter/
 * decline, reclaim expired escrow); payees see their outgoing ones (cancel, and
 * accept/reject a counter). Counterparty handles are reverse-resolved once for
 * nicer labels. All writes go through {@link useRequestActions}; after each we
 * bubble `onChanged` so the parent refetches the id list.
 */
export function RequestCollection({ ids, perspective, loading = false, onChanged, emptyState }: Props) {
  const { api, authenticated } = useApi();
  const [tab, setTab] = useState<Tab>("open");
  const [identities, setIdentities] = useState<Record<string, Identity>>({});
  const [responding, setResponding] = useState<RequestMeta | null>(null);
  const [busyId, setBusyId] = useState<bigint | null>(null);

  const { requests } = useRequestsMeta(ids);
  const actions = useRequestActions();

  const counterpartyOf = (r: RequestMeta) =>
    (perspective === "payer" ? r.payee : r.payer).toLowerCase();

  const cpKey = useMemo(
    () => Array.from(new Set(requests.map(counterpartyOf))).sort().join(","),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requests, perspective]
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
        /* labels fall back to shortened addresses */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpKey, authenticated]);

  const counts = useMemo(() => {
    let open = 0;
    for (const r of requests) if (isOpen(r)) open++;
    return { open, settled: requests.length - open, all: requests.length };
  }, [requests]);

  const visible = useMemo(() => {
    if (tab === "all") return requests;
    if (tab === "open") return requests.filter(isOpen);
    return requests.filter((r) => !isOpen(r));
  }, [requests, tab]);

  const nameFor = (r: RequestMeta) => {
    const id = identities[counterpartyOf(r)];
    return id?.username ?? id?.displayName ?? null;
  };

  /** Run a write, guarding the card and refetching on settle. */
  async function run(id: bigint, fn: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await fn();
      onChanged?.();
    } catch {
      /* wallet rejected or reverted — leave the card as-is */
    } finally {
      setBusyId(null);
    }
  }

  if (!loading && requests.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <div className="mt-8">
      <div className="inline-flex rounded-full border border-ink/10 bg-paper-warm p-0.5 text-xs font-medium">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors",
              tab === t.key ? "bg-volt text-white" : "text-ink/50 hover:text-ink"
            )}
          >
            {t.label}
            <span className={cn("font-mono", tab === t.key ? "text-white/70" : "text-ink/30")}>
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton h-56 rounded-none" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-6 rounded-none border border-dashed border-ink/15 bg-paper-warm p-12 text-center">
          <p className="text-ink/55">
            {tab === "open" ? "Nothing open right now." : "No settled requests yet."}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {visible.map((r) => (
            <RequestCard
              key={r.id.toString()}
              request={r}
              perspective={perspective}
              counterpartyName={nameFor(r)}
              busy={busyId === r.id}
              // Payer, pending
              onRespond={() => setResponding(r)}
              onDecline={() => run(r.id, () => actions.rejectRequest(r.id))}
              // Payer, expired counter
              onReclaim={() => run(r.id, () => actions.reclaimExpiredCounter(r.id))}
              // Payee, pending
              onCancel={() => run(r.id, () => actions.cancelRequest(r.id))}
              // Payee, countered
              onAcceptCounter={() => run(r.id, () => actions.acceptCounter(r.id))}
              onRejectCounter={() => run(r.id, () => actions.rejectCounter(r.id))}
            />
          ))}
        </div>
      )}

      {responding && (
        <RespondRequestModal
          request={responding}
          counterpartyName={nameFor(responding)}
          onClose={() => setResponding(null)}
          onSuccess={() => {
            setResponding(null);
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}
