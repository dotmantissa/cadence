"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Wallet, Waves, Eye, EyeOff } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { WalletGate } from "@/components/WalletGate";
import { StreamCollection } from "@/components/StreamCollection";
import { CreateStreamModal } from "@/components/CreateStreamModal";
import { TopUpModal } from "@/components/TopUpModal";
import { FlowField } from "@/components/motion/FlowField";
import { useActiveAddress } from "@/hooks/useActiveAddress";
import { useEmployerStreams, useUsdcBalance, useCancelStream, useStreamsMeta } from "@/hooks/usePayroll";
import { useBalancePrivacy } from "@/hooks/useBalancePrivacy";
import { formatUsdc } from "@/lib/utils";

export default function EmployerPage() {
  const { address, connected } = useActiveAddress();
  const { data: ids, isLoading: loadingIds, refetch } = useEmployerStreams(address);
  const { data: balance } = useUsdcBalance(address);
  const { cancel } = useCancelStream();
  const [hideBalance, toggleBalance] = useBalancePrivacy();

  const [showCreate, setShowCreate] = useState(false);
  const [topUpStreamId, setTopUpStreamId] = useState<bigint | null>(null);

  // Newest-first, decoded once for both the counts and the collection.
  const ordered = useMemo(() => (ids ? [...ids].reverse() : []), [ids]);
  const { streams, isLoading: loadingMeta } = useStreamsMeta(ordered);
  const loadingStreams = loadingIds || (ordered.length > 0 && loadingMeta && streams.length === 0);

  const totalCount = ordered.length;
  const activeCount = useMemo(() => streams.filter((s) => s.active).length, [streams]);

  if (!connected) {
    return (
      <div className="min-h-screen bg-paper">
        <Navbar />
        <WalletGate
          headline="Connect to run payroll"
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
            <h1 className="mt-2 text-4xl font-semibold tracking-tightest text-ink">Payroll</h1>
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
          <button
            onClick={toggleBalance}
            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-panel-foreground/40 transition-colors hover:bg-white/10 hover:text-panel-foreground"
            aria-label={hideBalance ? "Show balance" : "Hide balance"}
            title={hideBalance ? "Show balance" : "Hide balance"}
          >
            {hideBalance ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs text-panel-foreground/50">
                <Wallet size={13} /> USDC balance
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
                {loadingStreams ? "" : `${activeCount} ongoing`}
              </p>
            </div>
          </div>
        </div>

        {/* Streams */}
        <StreamCollection
          streams={streams}
          perspective="employer"
          loading={loadingStreams}
          onCancel={(id) => cancel(id)}
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
