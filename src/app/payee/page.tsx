"use client";

import { useCallback, useMemo, useState } from "react";
import { useConfig } from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
import { motion } from "framer-motion";
import { Wallet, Waves, Eye, EyeOff, Send } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { WalletGate } from "@/components/WalletGate";
import { StreamCollection } from "@/components/StreamCollection";
import { RequestCollection } from "@/components/RequestCollection";
import { RequestStreamModal } from "@/components/RequestStreamModal";
import { ViewTabs } from "@/components/ViewTabs";
import { FlowField } from "@/components/motion/FlowField";
import { FaucetButton } from "@/components/FaucetButton";
import { useActiveAddress } from "@/hooks/useActiveAddress";
import {
  useEmployeeStreams,
  useUsdcBalance,
  useWithdraw,
  useStreamsMeta,
  usePayeeRequests,
  useRequestsMeta,
  ReqStatus,
} from "@/hooks/usePayroll";
import { useBalancePrivacy } from "@/hooks/useBalancePrivacy";
import { useNotify } from "@/hooks/useNotify";
import { streamMath } from "@/lib/stream-math";
import { formatUsdc } from "@/lib/utils";

export default function EmployeePage() {
  const { address, connected } = useActiveAddress();
  const config = useConfig();
  const { data: ids, isLoading: loadingIds, refetch } = useEmployeeStreams(address);
  const { data: balance } = useUsdcBalance(address);
  const { withdraw } = useWithdraw();
  const { notify } = useNotify();
  const [hideBalance, toggleBalance] = useBalancePrivacy();

  const [view, setView] = useState<"streams" | "requests">("streams");
  const [showRequest, setShowRequest] = useState(false);

  const ordered = useMemo(() => (ids ? [...ids].reverse() : []), [ids]);
  const { streams, isLoading: loadingMeta } = useStreamsMeta(ordered);
  const loadingStreams = loadingIds || (ordered.length > 0 && loadingMeta && streams.length === 0);

  // Cash out, then tell both sides once the tx confirms. The claimable amount is
  // snapshotted before the withdraw zeroes it, so the email reports what was
  // actually taken. A rejected/failed tx fires no email.
  const handleWithdraw = useCallback(
    async (id: bigint) => {
      const stream = streams.find((s) => s.id === id);
      const unclaimed = stream ? streamMath(stream).unclaimed : 0n;
      try {
        const hash = await withdraw(id);
        await waitForTransactionReceipt(config, { hash });
        await refetch();
        if (stream && unclaimed > 0n) {
          notify("stream_claimed", {
            counterpartyAddress: stream.employer,
            amount: unclaimed.toString(),
            perspective: "employee",
            reference: stream.invoiceRef || null,
          });
        }
      } catch {
        // Wallet rejected or the tx failed — nothing claimed, no email.
      }
    },
    [streams, withdraw, config, refetch, notify]
  );

  // Requests this wallet has sent (it is the payee), newest-first.
  const { data: reqIds, isLoading: loadingReqIds, refetch: refetchReqs } = usePayeeRequests(address);
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
    for (const s of streams) {
      if (!s.active) continue;
      if (Number(s.startTime) > nowSec) scheduled++;
      else active++;
    }
    return { activeCount: active, scheduledCount: scheduled };
  }, [streams]);

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
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-volt">the earning side</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tightest text-ink">My earnings</h1>
            <p className="mt-1 text-sm text-ink/50">Updated every second, no refresh needed.</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowRequest(true)}
            className="inline-flex items-center gap-2 rounded-full bg-volt px-5 py-3 text-sm font-medium text-white shadow-[0_8px_30px_-6px_rgba(43,68,231,0.6)] transition-colors hover:bg-volt-bright"
          >
            <Send size={16} /> Request a stream
          </motion.button>
        </div>

        {/* Wallet balance */}
        <div className="relative mt-8 overflow-hidden rounded-none border border-ink/10 bg-panel p-7 text-panel-foreground">
          <FlowField tone="ink" density={0.9} />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs text-panel-foreground/50">
                <Wallet size={13} /> in your wallet
                <button
                  onClick={toggleBalance}
                  className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full text-panel-foreground/40 transition-colors hover:bg-white/10 hover:text-panel-foreground"
                  aria-label={hideBalance ? "Show balance" : "Hide balance"}
                  title={hideBalance ? "Show balance" : "Hide balance"}
                >
                  {hideBalance ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
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
            streams={streams}
            perspective="employee"
            loading={loadingStreams}
            onWithdraw={handleWithdraw}
            emptyState={
              <div className="mt-8 rounded-none border border-dashed border-ink/15 bg-paper-warm p-14 text-center">
                <p className="text-ink/60">No streams pointed at this wallet yet.</p>
                <p className="mt-1 text-sm text-ink/40">
                  Ask whoever signs the checks to spin one up — or request one yourself.
                </p>
              </div>
            }
          />
        ) : (
          <RequestCollection
            ids={orderedReqs}
            perspective="payee"
            loading={loadingReqIds}
            onChanged={refetchReqs}
            emptyState={
              <div className="mt-8 rounded-none border border-dashed border-ink/15 bg-paper-warm p-14 text-center">
                <p className="text-ink/60">You haven&apos;t requested any streams yet.</p>
                <button
                  onClick={() => setShowRequest(true)}
                  className="mt-3 text-sm font-medium text-volt transition-colors hover:text-volt-bright"
                >
                  Request your first stream
                </button>
              </div>
            }
          />
        )}
      </main>

      {showRequest && (
        <RequestStreamModal
          onClose={() => setShowRequest(false)}
          onSuccess={() => {
            setShowRequest(false);
            setView("requests");
            refetchReqs();
          }}
        />
      )}
    </div>
  );
}
