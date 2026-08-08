"use client";

import { useCallback, useMemo, useState } from "react";
import { useConfig } from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
import { motion } from "framer-motion";
import { Plus, Wallet, Waves, Eye, EyeOff } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { WalletGate } from "@/components/WalletGate";
import { StreamCollection } from "@/components/StreamCollection";
import { RequestCollection } from "@/components/RequestCollection";
import { CreateStreamModal } from "@/components/CreateStreamModal";
import { TopUpModal } from "@/components/TopUpModal";
import { ViewTabs } from "@/components/ViewTabs";
import { FlowField } from "@/components/motion/FlowField";
import { FaucetButton } from "@/components/FaucetButton";
import { useActiveAddress } from "@/hooks/useActiveAddress";
import {
  useEmployerStreams,
  useUsdcBalance,
  useCancelStream,
  useStreamsMeta,
  usePayerRequests,
  useRequestsMeta,
  ReqStatus,
} from "@/hooks/usePayroll";
import { useBalancePrivacy } from "@/hooks/useBalancePrivacy";
import { formatUsdc } from "@/lib/utils";

export default function EmployerPage() {
  const { address, connected } = useActiveAddress();
  const config = useConfig();
  const { data: ids, isLoading: loadingIds, refetch } = useEmployerStreams(address);
  const { data: balance } = useUsdcBalance(address);
  const { cancel } = useCancelStream();
  const [hideBalance, toggleBalance] = useBalancePrivacy();

  // Stream IDs the user just cancelled, held until the refetch confirms the
  // on-chain flip. While an ID sits here we render its card as already settled
  // so the ticker stops the moment the tx is submitted, instead of animating on
  // until the next 5s poll (or a manual refresh) happens to catch the change.
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());

  const handleCancel = useCallback(
    async (id: bigint) => {
      const key = id.toString();
      try {
        // Awaits the wallet confirmation; only freeze once the tx is actually
        // submitted, so a rejected cancel leaves the live card untouched.
        const hash = await cancel(id);
        setCancellingIds((prev) => new Set(prev).add(key));
        await waitForTransactionReceipt(config, { hash });
        await refetch();
      } catch {
        // Wallet rejected or the tx failed — nothing to freeze.
      } finally {
        // Fresh data (post-refetch) already carries the cancelled state, so it's
        // safe to drop the optimistic override without the card resuming ticking.
        setCancellingIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [cancel, config, refetch]
  );

  const [view, setView] = useState<"streams" | "requests">("streams");
  const [showCreate, setShowCreate] = useState(false);
  const [topUpStreamId, setTopUpStreamId] = useState<bigint | null>(null);

  // Newest-first, decoded once for both the counts and the collection.
  const ordered = useMemo(() => (ids ? [...ids].reverse() : []), [ids]);
  const { streams, isLoading: loadingMeta } = useStreamsMeta(ordered);
  const loadingStreams = loadingIds || (ordered.length > 0 && loadingMeta && streams.length === 0);

  // Overlay the optimistic cancel state: a just-cancelled stream is shown as
  // settled (inactive, escrow zeroed) so streamMath reads it as `cancelled` and
  // the card stops ticking immediately. Zeroing `deposit` while `withdrawn`
  // stays below `totalDeposited` is exactly the on-chain cancel signature, so
  // the optimistic card matches what the refetch will confirm.
  const displayStreams = useMemo(
    () =>
      cancellingIds.size === 0
        ? streams
        : streams.map((s) =>
            cancellingIds.has(s.id.toString()) ? { ...s, active: false, deposit: 0n } : s
          ),
    [streams, cancellingIds]
  );

  // Requests addressed to this wallet (it is the payer), newest-first.
  const { data: reqIds, isLoading: loadingReqIds, refetch: refetchReqs } = usePayerRequests(address);
  const orderedReqs = useMemo(() => (reqIds ? [...reqIds].reverse() : []), [reqIds]);
  const { requests } = useRequestsMeta(orderedReqs);
  const openReqCount = useMemo(
    () => requests.filter((r) => r.status === ReqStatus.Pending || r.status === ReqStatus.Countered).length,
    [requests]
  );

  const totalCount = ordered.length;
  // "Ongoing" excludes scheduled streams (active on-chain but not yet flowing).
  const { activeCount, scheduledCount } = useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    let active = 0;
    let scheduled = 0;
    for (const s of displayStreams) {
      if (!s.active) continue;
      if (Number(s.startTime) > nowSec) scheduled++;
      else active++;
    }
    return { activeCount: active, scheduledCount: scheduled };
  }, [displayStreams]);

  if (!connected) {
    return (
      <div className="min-h-screen bg-paper">
        <Navbar />
        <WalletGate
          headline="Connect to start paying"
          sub="Hook up your wallet to open streams, top them up, and watch your runway in real time."
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <Navbar />

      <main className="mx-auto max-w-5xl px-5 pb-24 pt-28 sm:px-8">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-volt">the money side</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tightest text-ink">Payments</h1>
            <p className="mt-1 text-sm text-ink/50">Every stream you are running, live.</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-full bg-volt px-5 py-3 text-sm font-medium text-white shadow-[0_8px_30px_-6px_rgba(43,68,231,0.6)] transition-colors hover:bg-volt-bright"
          >
            <Plus size={16} /> New stream
          </motion.button>
        </div>

        {/* Balance strip */}
        <div className="relative mt-8 overflow-hidden rounded-none border border-ink/10 bg-panel p-7 text-panel-foreground">
          <FlowField tone="ink" density={0.9} />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs text-panel-foreground/50">
                <Wallet size={13} /> USDC balance
                <button
                  onClick={toggleBalance}
                  className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full text-panel-foreground/40 transition-colors hover:bg-white/10 hover:text-panel-foreground"
                  aria-label={hideBalance ? "Show balance" : "Hide balance"}
                  title={hideBalance ? "Show balance" : "Hide balance"}
                >
                  {hideBalance ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <p className="mt-2 font-mono text-4xl font-semibold tracking-tight">
                {balance === undefined ? (
                  <span className="skeleton inline-block h-9 w-40 rounded-md align-middle" />
                ) : hideBalance ? (
                  "••••••"
                ) : (
                  `$${formatUsdc(balance)}`
                )}
              </p>
              <div className="mt-4">
                <FaucetButton />
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-2 text-xs text-panel-foreground/50">
                <Waves size={13} /> total streams
              </div>
              <p className="mt-2 font-mono text-4xl font-semibold tracking-tight text-volt-bright">
                {loadingStreams ? (
                  <span className="skeleton inline-block h-9 w-12 rounded-md align-middle" />
                ) : (
                  totalCount
                )}
              </p>
              <p className="mt-1 text-xs text-panel-foreground/40">
                {loadingStreams
                  ? ""
                  : `${activeCount} ongoing${scheduledCount > 0 ? ` · ${scheduledCount} scheduled` : ""}`}
              </p>
            </div>
          </div>
        </div>

        {/* Streams / Requests */}
        <ViewTabs
          className="mt-10"
          value={view}
          onChange={setView}
          streamCount={totalCount}
          requestCount={openReqCount}
        />

        {view === "streams" ? (
          <StreamCollection
            streams={displayStreams}
            perspective="employer"
            loading={loadingStreams}
            onCancel={handleCancel}
            onTopUp={(id) => setTopUpStreamId(id)}
            emptyState={
              <div className="mt-8 rounded-none border border-dashed border-ink/15 bg-paper-warm p-14 text-center">
                <p className="text-ink/60">No streams yet. The team is waiting.</p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="mt-3 text-sm font-medium text-volt transition-colors hover:text-volt-bright"
                >
                  Open your first stream
                </button>
              </div>
            }
          />
        ) : (
          <RequestCollection
            ids={orderedReqs}
            perspective="payer"
            loading={loadingReqIds}
            onChanged={refetchReqs}
            emptyState={
              <div className="mt-8 rounded-none border border-dashed border-ink/15 bg-paper-warm p-14 text-center">
                <p className="text-ink/60">No incoming stream requests.</p>
                <p className="mt-1 text-sm text-ink/40">
                  When someone asks you to open a stream, it lands here for you to accept or counter.
                </p>
              </div>
            }
          />
        )}
      </main>

      {showCreate && (
        <CreateStreamModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            refetch();
          }}
        />
      )}

      {topUpStreamId !== null && (
        <TopUpModal
          streamId={topUpStreamId}
          onClose={() => {
            setTopUpStreamId(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
