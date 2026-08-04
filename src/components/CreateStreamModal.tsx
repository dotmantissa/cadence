"use client";

import { useEffect, useRef, useState } from "react";
import { useCreateStream, useApproveUsdc, useUsdcAllowance, useUsdcBalance } from "@/hooks/usePayroll";
import { parseUsdc, formatUsdc, shortenAddress } from "@/lib/utils";
import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";
import { useApi } from "@/hooks/useApi";
import { validateUsername } from "@/lib/username";
import { AtSign, Wallet, Check, Loader2, X } from "lucide-react";
import { Modal } from "./Modal";

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

type Mode = "address" | "username";

const field =
  "w-full rounded-2xl border border-ink/10 bg-paper-warm px-3.5 py-3 text-sm text-ink placeholder-ink/30 transition-colors focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/20";
const labelCls = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/50";

export function CreateStreamModal({ onClose, onSuccess }: Props) {
  const { address } = useAccount();
  const { api } = useApi();
  const [mode, setMode] = useState<Mode>("address");
  const [employee, setEmployee] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [streamDays, setStreamDays] = useState("30");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "approving" | "creating">("idle");
  const [txError, setTxError] = useState<string | null>(null);

  // Handle → wallet resolution. Only used in username mode.
  const [resolved, setResolved] = useState<{
    walletAddress: `0x${string}`;
    username: string | null;
    displayName: string | null;
  } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const resolveSeq = useRef(0);

  const { data: balance } = useUsdcBalance(address);
  const { data: allowance } = useUsdcAllowance(address);
  const { approve } = useApproveUsdc();
  const { createStream } = useCreateStream();

  const days = Math.max(1, parseInt(streamDays) || 30);
  const depositAmount = parseUsdc(totalAmount);
  const dailyRateRaw = depositAmount > 0n ? depositAmount / BigInt(days) : 0n;
  const ratePerSecond = dailyRateRaw / 86400n;

  const trimmed = employee.trim();
  const isRawAddress = trimmed.startsWith("0x") && trimmed.length === 42;

  // The wallet we'll actually stream to: the typed address in address mode, or
  // the resolved handle's wallet in username mode.
  const recipient: `0x${string}` | null =
    mode === "address"
      ? isRawAddress
        ? (trimmed as `0x${string}`)
        : null
      : resolved?.walletAddress ?? null;

  // Debounced handle resolution.
  useEffect(() => {
    if (mode !== "username") return;
    setResolved(null);
    setResolveError(null);
    const handle = trimmed.replace(/^@/, "");
    if (handle === "") return;
    const check = validateUsername(handle);
    if (!check.ok) {
      setResolveError(check.error);
      return;
    }
    setResolving(true);
    const seq = ++resolveSeq.current;
    const t = setTimeout(async () => {
      try {
        const res = await api.resolveUsername(check.value);
        if (seq !== resolveSeq.current) return;
        setResolved({
          walletAddress: res.walletAddress as `0x${string}`,
          username: res.username,
          displayName: res.displayName,
        });
        setResolveError(null);
      } catch (e) {
        if (seq !== resolveSeq.current) return;
        setResolved(null);
        setResolveError(e instanceof Error ? e.message : "could not find that handle");
      } finally {
        if (seq === resolveSeq.current) setResolving(false);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee, mode]);

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setEmployee("");
    setResolved(null);
    setResolveError(null);
  }

  const needsApproval = depositAmount > 0n && (!allowance || allowance < depositAmount);
  const insufficientBalance =
    balance !== undefined && depositAmount > 0n && balance < depositAmount;
  const isPending = txStatus !== "idle";
  const canSubmit =
    recipient !== null && depositAmount > 0n && ratePerSecond > 0n && !insufficientBalance;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!recipient) return;
    if (depositAmount === 0n || ratePerSecond === 0n) return;

    setTxError(null);
    try {
      if (needsApproval) {
        setTxStatus("approving");
        await approve(depositAmount);
      }
      setTxStatus("creating");
      await createStream(recipient, ratePerSecond, depositAmount, invoiceRef);
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string };
      setTxError(e?.shortMessage ?? e?.message ?? "Wallet rejected the transaction");
      setTxStatus("idle");
    }
  }

  return (
    <Modal
      title="Open a stream"
      onClose={onClose}
      closeDisabled={isPending}
      dismissable={false}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>Who is getting paid</label>

          {/* Streamer picks how to name the recipient. */}
          <div className="mb-2 inline-flex rounded-full border border-ink/10 bg-paper-warm p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => switchMode("address")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors",
                mode === "address" ? "bg-volt text-white" : "text-ink/50 hover:text-ink"
              )}
            >
              <Wallet size={13} /> Wallet address
            </button>
            <button
              type="button"
              onClick={() => switchMode("username")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors",
                mode === "username" ? "bg-volt text-white" : "text-ink/50 hover:text-ink"
              )}
            >
              <AtSign size={13} /> Username
            </button>
          </div>

          {mode === "address" ? (
            <input
              type="text"
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
              placeholder="0x wallet address"
              className={cn(field, "font-mono")}
              required
            />
          ) : (
            <>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/40">
                  <AtSign size={15} />
                </span>
                <input
                  type="text"
                  value={employee}
                  onChange={(e) =>
                    setEmployee(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                  }
                  placeholder="satoshi_streams"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className={cn(field, "pl-9 pr-9 font-mono")}
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {resolving && <Loader2 size={15} className="animate-spin text-ink/40" />}
                  {!resolving && resolved && <Check size={15} className="text-emerald-500" />}
                  {!resolving && resolveError && trimmed !== "" && (
                    <X size={15} className="text-red-500" />
                  )}
                </span>
              </div>
              <div className="mt-1.5 min-h-[1rem] text-xs">
                {resolved && (
                  <span className="text-ink/55">
                    Paying{" "}
                    {resolved.displayName ? `${resolved.displayName} · ` : ""}
                    <span className="font-mono text-ink/70">
                      {shortenAddress(resolved.walletAddress)}
                    </span>
                  </span>
                )}
                {!resolved && resolveError && trimmed !== "" && (
                  <span className="text-red-500">{resolveError}</span>
                )}
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Total (USDC)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink/40">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="3,000.00"
                className={cn(field, "pl-7")}
                required
              />
            </div>
            {/* Balance, highlighted right under the amount it's checked against. */}
            <p className="mt-1.5 text-xs">
              {balance === undefined ? (
                <span className="inline-flex items-center gap-1.5 text-ink/40">
                  <Loader2 size={11} className="animate-spin" /> checking balance…
                </span>
              ) : (
                <span
                  className={cn(
                    "font-medium",
                    insufficientBalance ? "text-red-500" : "text-volt"
                  )}
                >
                  Balance: <span className="font-mono">${formatUsdc(balance)}</span>
                  {insufficientBalance && " — not enough"}
                </span>
              )}
            </p>
          </div>
          <div>
            <label className={labelCls}>Over how many days</label>
            <input
              type="number"
              min="1"
              max="365"
              value={streamDays}
              onChange={(e) => setStreamDays(e.target.value)}
              className={field}
            />
          </div>
        </div>

        {depositAmount > 0n && (
          <div className="space-y-2 rounded-2xl border border-ink/10 bg-volt-wash px-4 py-3">
            <div className="flex justify-between text-sm">
              <span className="text-ink/55">Streams at</span>
              <span className="font-mono font-medium text-ink">${formatUsdc(dailyRateRaw)} / day</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-ink/45">Per second</span>
              <span className="font-mono text-ink/60">${formatUsdc(ratePerSecond, 8)} / sec</span>
            </div>
          </div>
        )}

        <div>
          <label className={labelCls}>
            Remark <span className="normal-case text-ink/30">(optional)</span>
          </label>
          <input
            type="text"
            value={invoiceRef}
            onChange={(e) => setInvoiceRef(e.target.value)}
            placeholder="e.g. June retainer, INV-2026-001"
            className={field}
          />
        </div>

        {txError && (
          <p className="rounded-2xl border border-red-500/20 bg-red-500/5 px-3.5 py-2.5 text-xs text-red-500">
            {txError}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || !canSubmit}
          className={cn(
            "w-full rounded-full py-3.5 text-sm font-medium transition-colors disabled:opacity-40",
            needsApproval && !isPending
              ? "border border-volt/30 bg-volt-wash text-volt hover:bg-volt/10"
              : "bg-volt text-white hover:bg-volt-bright"
          )}
        >
          {txStatus === "approving"
            ? "Approving USDC, confirm in wallet"
            : txStatus === "creating"
            ? "Opening stream, confirm in wallet"
            : insufficientBalance
            ? "Not enough USDC"
            : needsApproval
            ? "Approve and open stream"
            : "Open stream"}
        </button>
      </form>
    </Modal>
  );
}
