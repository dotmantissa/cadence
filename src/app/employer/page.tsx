"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { Plus, Wallet, Waves } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { WalletGate } from "@/components/WalletGate";
import { StreamCard } from "@/components/StreamCard";
import { CreateStreamModal } from "@/components/CreateStreamModal";
import { TopUpModal } from "@/components/TopUpModal";
import { LiquidBackground } from "@/components/motion/LiquidBackground";
import { useEmployerStreams, useUsdcBalance, useCancelStream } from "@/hooks/usePayroll";
import { formatUsdc } from "@/lib/utils";

export default function EmployerPage() {
  const { address, isConnected } = useAccount();
  const { data: streams, refetch } = useEmployerStreams(address);
  const { data: balance } = useUsdcBalance(address);
  const { cancel } = useCancelStream();

  const [showCreate, setShowCreate] = useState(false);
  const [topUpStreamId, setTopUpStreamId] = useState<bigint | null>(null);

  if (!isConnected) {
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

  const activeCount = streams?.length ?? 0;

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
        <div className="relative mt-8 overflow-hidden rounded-4xl border border-black/10 bg-ink p-7 text-paper">
          <LiquidBackground pull={0.06} intensity={0.9} tone="ink" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs text-paper/50">
                <Wallet size={13} /> USDC balance
              </div>
              <p className="mt-2 font-mono text-4xl font-semibold tracking-tight">
                ${balance !== undefined ? formatUsdc(balance) : "0.00"}
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-2 text-xs text-paper/50">
                <Waves size={13} /> active streams
              </div>
              <p className="mt-2 font-mono text-4xl font-semibold tracking-tight text-volt-bright">
                {streams ? activeCount : "0"}
              </p>
            </div>
          </div>
        </div>

        {/* Streams */}
        {!streams || streams.length === 0 ? (
          <div className="mt-8 rounded-4xl border border-dashed border-black/15 bg-paper-warm p-14 text-center">
            <p className="text-ink/60">No streams yet. The team is waiting.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 text-sm font-medium text-volt transition-colors hover:text-volt-bright"
            >
              Open your first stream
            </button>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {[...streams].reverse().map((id) => (
              <StreamCard
                key={id.toString()}
                streamId={id}
                perspective="employer"
                onCancel={() => cancel(id)}
                onTopUp={() => setTopUpStreamId(id)}
              />
            ))}
          </div>
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
