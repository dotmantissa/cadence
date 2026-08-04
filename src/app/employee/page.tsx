"use client";

import { Wallet } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { WalletGate } from "@/components/WalletGate";
import { StreamCard } from "@/components/StreamCard";
import { FlowField } from "@/components/motion/FlowField";
import { useActiveAddress } from "@/hooks/useActiveAddress";
import { useEmployeeStreams, useUsdcBalance, useWithdraw } from "@/hooks/usePayroll";
import { formatUsdc } from "@/lib/utils";

export default function EmployeePage() {
  const { address, connected } = useActiveAddress();
  const { data: streams, refetch } = useEmployeeStreams(address);
  const { data: balance } = useUsdcBalance(address);
  const { withdraw } = useWithdraw();

  if (!connected) {
    return (
      <div className="min-h-screen bg-paper">
        <Navbar />
        <WalletGate
          headline="Connect to see your bag"
          sub="Link your wallet to watch your salary tick up by the second and cash out whenever you feel like it."
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <Navbar />

      <main className="mx-auto max-w-5xl px-5 pb-24 pt-28 sm:px-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-volt">the earning side</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tightest text-ink">My earnings</h1>
          <p className="mt-1 text-sm text-ink/50">Updated every second, no refresh needed.</p>
        </div>

        {/* Wallet balance */}
        <div className="relative mt-8 overflow-hidden rounded-4xl border border-ink/10 bg-panel p-7 text-panel-foreground">
          <FlowField tone="ink" density={0.9} />
          <div className="relative">
            <div className="flex items-center gap-2 text-xs text-panel-foreground/50">
              <Wallet size={13} /> in your wallet
            </div>
            <p className="mt-2 font-mono text-4xl font-semibold tracking-tight sm:text-5xl">
              ${balance !== undefined ? formatUsdc(balance) : "0.00"}
            </p>
            <p className="mt-2 text-xs text-panel-foreground/40">Whatever you have cashed out lands here.</p>
          </div>
        </div>

        {/* Streams */}
        {!streams || streams.length === 0 ? (
          <div className="mt-8 rounded-4xl border border-dashed border-ink/15 bg-paper-warm p-14 text-center">
            <p className="text-ink/60">No streams pointed at this wallet yet.</p>
            <p className="mt-1 text-sm text-ink/40">
              Ask whoever signs the checks to spin one up for you.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {[...streams].reverse().map((id) => (
              <StreamCard
                key={id.toString()}
                streamId={id}
                perspective="employee"
                onWithdraw={() => {
                  withdraw(id);
                  refetch();
                }}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
