"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useConfig, useReadContract, useWriteContract } from "wagmi";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clipboard,
  Database,
  ExternalLink,
  Gauge,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { useApi, ApiError } from "@/hooks/useApi";
import { useProfileContext } from "@/components/ProfileProvider";
import { isOfficialAdminEmail } from "@/lib/admin";
import type { AnalyticsPayload } from "@/lib/admin-analytics";
import { formatUsdc, shortenAddress } from "@/lib/utils";
import { PAYROLL_ABI, PAYROLL_ADDRESS } from "@/lib/contracts";
import { waitForSuccessfulReceipt } from "@/lib/tx";

type AdminSettings = {
  feeRecipient: string | null;
  feeBps: number;
  owner: string;
  onchainRoutingActive: boolean;
};

function money(value: string): string {
  try {
    return `$${formatUsdc(BigInt(value))}`;
  } catch {
    return "$0.00";
  }
}

function activityLabel(type: string): string {
  return type.replace(/_/g, " ");
}

export default function AnalyticsPage() {
  const { user, loading: profileLoading } = useProfileContext();
  const { api } = useApi();
  const config = useConfig();
  const { address: connectedAddress } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { data: onchainOwner } = useReadContract({
    address: PAYROLL_ADDRESS,
    abi: PAYROLL_ABI,
    functionName: "owner",
    query: { enabled: /^0x[0-9a-fA-F]{40}$/.test(PAYROLL_ADDRESS) },
  });
  const isAdmin = isOfficialAdminEmail(user?.email);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [audit, setAudit] = useState<
    { id: string; action: string; metadata: Record<string, unknown>; createdAt: string }[]
  >([]);
  const [feeRecipient, setFeeRecipient] = useState("");
  const [feeBps, setFeeBps] = useState("0");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const [analyticsResponse, settingsResponse] = await Promise.all([
        api.getAdminAnalytics(),
        api.getAdminSettings(),
      ]);
      setAnalytics(analyticsResponse.analytics);
      setSettings(settingsResponse.settings);
      setFeeRecipient(settingsResponse.settings.feeRecipient ?? "");
      setFeeBps(String(settingsResponse.settings.feeBps ?? 0));
      setAudit(settingsResponse.audit);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 404
          ? "Control room unavailable."
          : "Could not load the control room."
      );
    } finally {
      setLoading(false);
    }
  }, [api, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const nextFeeBps = Number(feeBps);
      if (!Number.isInteger(nextFeeBps) || nextFeeBps < 0 || nextFeeBps > 1000) {
        throw new Error("Fee must be a whole number from 0 to 1000 basis points.");
      }
      const owner = String(onchainOwner ?? settings?.owner ?? "").toLowerCase();
      if (!connectedAddress || !owner || connectedAddress.toLowerCase() !== owner) {
        throw new Error("Connect the PayrollManager owner wallet to update protocol settings.");
      }
      const recipient = feeRecipient.trim() || "0x0000000000000000000000000000000000000000";
      const hash = await writeContractAsync({
        address: PAYROLL_ADDRESS,
        abi: PAYROLL_ABI,
        functionName: "setProtocolFeeConfig",
        args: [recipient as `0x${string}`, nextFeeBps],
        gas: 180_000n,
        maxFeePerGas: 50_000_000_000n,
        maxPriorityFeePerGas: 2_000_000_000n,
      });
      await waitForSuccessfulReceipt(config, hash);
      const response = await api.updateAdminSettings(feeRecipient.trim() || null);
      setSettings({ ...response.settings, feeBps: nextFeeBps, owner });
      setSaved(true);
      const refreshed = await api.getAdminSettings();
      setSettings(refreshed.settings);
      setFeeRecipient(refreshed.settings.feeRecipient ?? "");
      setFeeBps(String(refreshed.settings.feeBps));
      setAudit(refreshed.audit);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The protocol settings could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const cards = useMemo(
    () =>
      analytics
        ? [
            { label: "Committed", value: money(analytics.metrics.totalCommitted), icon: WalletCards },
            { label: "Earned to date", value: money(analytics.metrics.totalEarned), icon: BarChart3 },
            { label: "Active streams", value: analytics.metrics.activeStreams.toLocaleString(), icon: Activity },
            { label: "People reached", value: (analytics.metrics.uniqueEmployers + analytics.metrics.uniqueEmployees).toLocaleString(), icon: Users },
          ]
        : [],
    [analytics]
  );

  if (profileLoading) {
    return <div className="min-h-screen bg-paper" />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-paper">
        <Navbar />
        <main className="mx-auto max-w-2xl px-5 pb-24 pt-32 sm:px-8">
          <p className="font-mono text-xs uppercase tracking-widest text-ink/40">404</p>
          <h1 className="mt-3 text-3xl font-semibold text-ink">Page not found</h1>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <Navbar />
      <main className="mx-auto max-w-7xl px-5 pb-24 pt-28 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-volt">private operations</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tightest text-ink">Control room</h1>
            <p className="mt-1 text-sm text-ink/50">Arc Mainnet performance, escrow, and project controls.</p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 border border-ink/10 bg-paper-warm px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink/25 disabled:opacity-50"
            title="Refresh analytics"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {error && (
          <div className="mt-8 flex items-center gap-3 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {analytics && (
          <>
            {!analytics.contract.historyComplete && (
              <div className="mt-8 flex items-start gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>
                  Analytics currently scans from block {analytics.contract.scannedFromBlock}. Set
                  <code className="mx-1 font-mono">ARC_PAYROLL_DEPLOYMENT_BLOCK</code>
                  in the server environment for complete historical totals.
                </span>
              </div>
            )}

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map((card) => {
                const Icon = card.icon;
                return (
                  <section key={card.label} className="border border-ink/10 bg-paper-warm p-5">
                    <div className="flex items-center justify-between text-xs uppercase tracking-widest text-ink/45">
                      {card.label}
                      <Icon size={16} className="text-volt" />
                    </div>
                    <p className="mt-5 font-mono text-3xl font-semibold text-ink">{card.value}</p>
                  </section>
                );
              })}
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
              <section className="border border-ink/10 bg-panel p-6 text-panel-foreground">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-widest text-panel-foreground/45">network health</p>
                    <h2 className="mt-2 text-xl font-semibold">Arc Mainnet</h2>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
                    <CheckCircle2 size={14} /> RPC responding
                  </span>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <HealthValue label="Chain ID" value={String(analytics.network.chainId)} />
                  <HealthValue label="Latest block" value={analytics.network.latestBlock} />
                  <HealthValue label="Payroll streams" value={analytics.contract.nextStreamId} />
                  <HealthValue label="Escrow balance" value={money(analytics.contract.balance)} />
                </div>
                <a
                  href={`https://explorer.arc.io/address/${analytics.contract.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-6 inline-flex items-center gap-2 text-sm text-volt-bright hover:underline"
                >
                  {shortenAddress(analytics.contract.address)} on Arc Explorer <ExternalLink size={14} />
                </a>
              </section>

              <section className="border border-ink/10 bg-paper-warm p-6">
                <div className="flex items-center gap-2">
                  <Settings2 size={17} className="text-volt" />
                  <h2 className="text-xl font-semibold text-ink">Project controls</h2>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink/55">
                  Protocol fees are taken from each stream opening and routed on-chain to this
                  recipient. The fee is deducted from the initial stream deposit.
                </p>
                <label className="mt-5 block text-xs font-medium uppercase tracking-widest text-ink/45">
                  Project address
                  <input
                    value={feeRecipient}
                    onChange={(event) => setFeeRecipient(event.target.value)}
                    placeholder="0x..."
                    spellCheck={false}
                    className="mt-2 w-full border border-ink/10 bg-paper px-3 py-3 font-mono text-sm text-ink outline-none focus:border-volt"
                  />
                </label>
                <label className="mt-4 block text-xs font-medium uppercase tracking-widest text-ink/45">
                  Protocol fee
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={feeBps}
                      onChange={(event) => setFeeBps(event.target.value)}
                      inputMode="numeric"
                      min="0"
                      max="1000"
                      type="number"
                      className="w-28 border border-ink/10 bg-paper px-3 py-3 font-mono text-sm text-ink outline-none focus:border-volt"
                    />
                    <span className="text-xs normal-case tracking-normal text-ink/45">basis points (max 10%)</span>
                  </div>
                </label>
                <button
                  onClick={() => void saveSettings()}
                  disabled={saving}
                  className="mt-4 inline-flex items-center gap-2 bg-volt px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-volt-bright disabled:opacity-50"
                >
                  <Save size={15} /> {saving ? "Saving..." : "Save destination"}
                </button>
                {saved && <p className="mt-3 text-xs text-emerald-600">Saved to the control-room configuration.</p>}
                {settings && (
                  <p className="mt-3 flex items-start gap-2 text-xs text-amber-700">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    {settings.onchainRoutingActive
                      ? `Live on-chain routing: ${settings.feeBps} bps.`
                      : "Routing is configured on-chain but currently set to 0 bps."}
                  </p>
                )}
              </section>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
              <section className="border border-ink/10 bg-paper-warm">
                <div className="flex items-center justify-between border-b border-ink/10 px-6 py-5">
                  <div className="flex items-center gap-2">
                    <Gauge size={17} className="text-volt" />
                    <h2 className="text-xl font-semibold text-ink">Recent activity</h2>
                  </div>
                  <span className="font-mono text-xs text-ink/40">{analytics.activity.length} events</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="border-b border-ink/10 text-xs uppercase tracking-widest text-ink/40">
                      <tr>
                        <th className="px-6 py-3 font-medium">Event</th>
                        <th className="px-6 py-3 font-medium">Stream</th>
                        <th className="px-6 py-3 font-medium">Amount</th>
                        <th className="px-6 py-3 font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.activity.map((event) => (
                        <tr key={`${event.transactionHash}-${event.type}-${event.streamId ?? "request"}`} className="border-b border-ink/5 last:border-0">
                          <td className="px-6 py-3 capitalize text-ink">{activityLabel(event.type)}</td>
                          <td className="px-6 py-3 font-mono text-xs text-ink/55">{event.streamId ?? "request"}</td>
                          <td className="px-6 py-3 font-mono text-xs text-ink/70">{event.amount ? money(event.amount) : "—"}</td>
                          <td className="px-6 py-3 text-xs text-ink/50">{new Date(event.timestamp).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="border border-ink/10 bg-paper-warm p-6">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={17} className="text-volt" />
                  <h2 className="text-xl font-semibold text-ink">Audit trail</h2>
                </div>
                <div className="mt-5 space-y-4">
                  {audit.length === 0 ? (
                    <p className="text-sm text-ink/50">No privileged changes recorded.</p>
                  ) : (
                    audit.map((entry) => (
                      <div key={entry.id} className="border-l-2 border-volt pl-3">
                        <p className="text-sm font-medium capitalize text-ink">{entry.action.replace(/_/g, " ")}</p>
                        <p className="mt-1 text-xs text-ink/45">{new Date(entry.createdAt).toLocaleString()}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MiniStat label="Withdrawals" value={analytics.metrics.withdrawals} />
              <MiniStat label="Top ups" value={analytics.metrics.topUps} />
              <MiniStat label="Cancellations" value={analytics.metrics.cancellations} />
              <MiniStat label="Requests" value={analytics.metrics.requests} />
            </div>
          </>
        )}

        {!analytics && !loading && (
          <div className="mt-12 border border-dashed border-ink/15 bg-paper-warm p-12 text-center">
            <Database size={22} className="mx-auto text-ink/35" />
            <p className="mt-3 text-sm text-ink/55">No Mainnet analytics available yet.</p>
          </div>
        )}
      </main>
    </div>
  );
}

function HealthValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-panel-foreground/40">{label}</p>
      <p className="mt-1 font-mono text-lg text-panel-foreground">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border border-ink/10 bg-paper-warm px-5 py-4">
      <span className="text-sm text-ink/55">{label}</span>
      <span className="font-mono text-lg font-semibold text-ink">{value.toLocaleString()}</span>
    </div>
  );
}
