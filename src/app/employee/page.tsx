"use client";

import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Navbar } from "@/components/Navbar";
import { StreamCard } from "@/components/StreamCard";
import { useEmployeeStreams, useUsdcBalance, useWithdraw } from "@/hooks/usePayroll";
import { formatUsdc } from "@/lib/utils";

export default function EmployeePage() {
  const { address, isConnected } = useAccount();
  const { data: streams, refetch } = useEmployeeStreams(address);
  const { data: balance } = useUsdcBalance(address);
  const { withdraw } = useWithdraw();

  if (!isConnected) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <p className="text-gray-400 text-lg">Connect your wallet to view your earnings</p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">My Earnings</h1>
          <p className="text-gray-500 text-sm mt-1">Your active payroll streams — updated every second</p>
        </div>

        {/* Balance */}
        <div className="rounded-xl border border-arc-border bg-arc-card p-5">
          <p className="text-xs text-gray-500">Wallet USDC Balance</p>
          <p className="text-3xl font-bold text-white font-mono mt-1">
            ${balance !== undefined ? formatUsdc(balance) : "—"}
          </p>
          <p className="text-xs text-gray-600 mt-1">Withdrawn amounts appear here</p>
        </div>

        {/* Streams */}
        {!streams || streams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-arc-border p-12 text-center">
            <p className="text-gray-500">No active streams for this address</p>
            <p className="text-gray-600 text-sm mt-1">Ask your employer to create a stream for your address</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {[...streams].reverse().map((id) => (
              <StreamCard
                key={id.toString()}
                streamId={id}
                perspective="employee"
                onWithdraw={() => { withdraw(id); refetch(); }}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
