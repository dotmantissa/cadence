"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Navbar } from "@/components/Navbar";
import { StreamCard } from "@/components/StreamCard";
import { CreateStreamModal } from "@/components/CreateStreamModal";
import { TopUpModal } from "@/components/TopUpModal";
import { useEmployerStreams, useUsdcBalance, useCancelStream, useWithdraw } from "@/hooks/usePayroll";
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
      <div className="min-h-screen">
        <Navbar />
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <p className="text-gray-400 text-lg">Connect your wallet to manage payroll</p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Employer Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">Manage your active payroll streams</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-xl bg-arc-blue hover:bg-blue-600 text-white text-sm font-medium transition-colors"
          >
            + New Stream
          </button>
        </div>

        {/* Balance card */}
        <div className="rounded-xl border border-arc-border bg-arc-card p-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Wallet USDC Balance</p>
            <p className="text-2xl font-bold text-white font-mono mt-1">
              ${balance !== undefined ? formatUsdc(balance) : "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Active Streams</p>
            <p className="text-2xl font-bold text-white mt-1">{streams?.length ?? "—"}</p>
          </div>
        </div>

        {/* Streams */}
        {!streams || streams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-arc-border p-12 text-center">
            <p className="text-gray-500 mb-3">No streams yet</p>
            <button
              onClick={() => setShowCreate(true)}
              className="text-arc-blue hover:underline text-sm"
            >
              Create your first stream
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
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
          onSuccess={() => { setShowCreate(false); refetch(); }}
        />
      )}

      {topUpStreamId !== null && (
        <TopUpModal
          streamId={topUpStreamId}
          onClose={() => { setTopUpStreamId(null); refetch(); }}
        />
      )}
    </div>
  );
}
