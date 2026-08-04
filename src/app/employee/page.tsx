"use client";

import { useMemo } from "react";
import { Wallet, Waves, Eye, EyeOff } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { WalletGate } from "@/components/WalletGate";
import { StreamCollection } from "@/components/StreamCollection";
import { FlowField } from "@/components/motion/FlowField";
import { useActiveAddress } from "@/hooks/useActiveAddress";
import { useEmployeeStreams, useUsdcBalance, useWithdraw, useStreamsMeta } from "@/hooks/usePayroll";
import { useBalancePrivacy } from "@/hooks/useBalancePrivacy";
import { formatUsdc } from "@/lib/utils";

export default function EmployeePage() {
  const { address, connected } = useActiveAddress();
  const { data: ids, isLoading: loadingIds, refetch } = useEmployeeStreams(address);
  const { data: balance } = useUsdcBalance(address);
  const { withdraw } = useWithdraw();
  const [hideBalance, toggleBalance] = useBalancePrivacy();

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
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs text-panel-foreground/50">
                <Wallet size={13} /> in your wallet
              </div>
              <p className="mt-2 font-mono text-4xl font-semibold tracking-tight sm:text-5xl">
                {balance === undefined ? (
                  <span className="skeleton inline-block h-11 w-52 rounded-md align-middle" />
                ) : hideBalance ? (
                  "••••••"
                ) : (
                  `$${formatUsdc(balance)}`
                )}
              </p>
              <p className="mt-2 text-xs text-panel-foreground/40">Whatever you have cashed out lands here.</p>
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
          perspective="employee"
          loading={loadingStreams}
          onWithdraw={(id) => {
            withdraw(id);
            refetch();
          }}
          emptyState={
            <div className="mt-8 rounded-none border border-dashed border-ink/15 bg-paper-warm p-14 text-center">
              <p className="text-ink/60">No streams pointed at this wallet yet.</p>
              <p className="mt-1 text-sm text-ink/40">
                Ask whoever signs the checks to spin one up for you.
              </p>
            </div>
          }
        />
      </main>
    </div>
  );
}
