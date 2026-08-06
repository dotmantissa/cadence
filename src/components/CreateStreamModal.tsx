"use client";

import { useEffect, useRef, useState } from "react";
import { useCreateStream, useApproveUsdc, useUsdcAllowance, useUsdcBalance } from "@/hooks/usePayroll";
import { parseUsdc, formatUsdc, shortenAddress } from "@/lib/utils";
import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";
import { useApi } from "@/hooks/useApi";
import { validateUsername } from "@/lib/username";
import { AtSign, Wallet, Check, Loader2, X, Clock, CalendarClock } from "lucide-react";
import { Modal } from "./Modal";
import { isAddress } from "viem";

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
  const [startMode, setStartMode] = useState<"now" | "schedule">("now");
  const [startAtLocal, setStartAtLocal] = useState("");
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

  // Address validation + registered-user check. Only used in address mode.
  const [addressRegistered, setAddressRegistered] = useState(false);
  const [checkingAddress, setCheckingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const addressSeq = useRef(0);

  const { data: balance } = useUsdcBalance(address);
  const { data: allowance } = useUsdcAllowance(address);
  const { approve } = useApproveUsdc();
  const { createStream } = useCreateStream();

  const days = Math.max(1, parseInt(streamDays) || 30);
  const depositAmount = parseUsdc(totalAmount);
  const dailyRateRaw = depositAmount > 0n ? depositAmount / BigInt(days) : 0n;
  const ratePerSecond = dailyRateRaw / 86400n;

  // Scheduling. "now" streams pass 0 (contract clamps to block time); a
  // scheduled stream passes a future unix timestamp so it escrows now but does
  // not accrue until then.
  const scheduledMs = startMode === "schedule" && startAtLocal ? new Date(startAtLocal).getTime() : NaN;
  const scheduledInvalid = startMode === "schedule" && (!startAtLocal || isNaN(scheduledMs) || scheduledMs <= Date.now());
  const startAt: bigint =
    startMode === "schedule" && !isNaN(scheduledMs) ? BigInt(Math.floor(scheduledMs / 1000)) : 0n;
  // `min` for the datetime-local input: one minute out, in local wall time.
  const minLocal = (() => {
    const d = new Date(Date.now() + 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
      d.getMinutes()
    )}`;
  })();

  const trimmed = employee.trim();
  const isRawAddress = trimmed.startsWith("0x") && trimmed.length === 42;

  // The wallet we'll actually stream to: the typed address in address mode (only
  // when valid AND registered), or the resolved handle's wallet in username mode.
  const recipient: `0x${string}` | null =
    mode === "address"
      ? isRawAddress && isAddress(trimmed) && addressRegistered
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

  // Debounced address validation + registered-user check.
  useEffect(() => {
    if (mode !== "address") return;
    setAddressRegistered(false);
    setAddressError(null);
    if (trimmed === "") return;
    if (!isAddress(trimmed)) {
      setAddressError("Not a valid wallet address");
      return;
    }
    setCheckingAddress(true);
    const seq = ++addressSeq.current;
    const t = setTimeout(async () => {
      try {
        const res = await api.resolveAddresses([trimmed]);
        if (seq !== addressSeq.current) return;
        const identity = res.identities[trimmed.toLowerCase()];
        if (!identity) {
          setAddressError("This address isn't signed up on Cadence yet");
          setAddressRegistered(false);
        } else {
          setAddressRegistered(true);
          setAddressError(null);
        }
      } catch (e) {
        if (seq !== addressSeq.current) return;
        setAddressError(e instanceof Error ? e.message : "Could not verify address");
        setAddressRegistered(false);
      } finally {
        if (seq === addressSeq.current) setCheckingAddress(false);
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
    recipient !== null &&
    depositAmount > 0n &&
    ratePerSecond > 0n &&
    !insufficientBalance &&
    !scheduledInvalid;

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
      await createStream(recipient, ratePerSecond, depositAmount, invoiceRef, startAt);
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
            <>
              <div className="relative">
                <input
                  type="text"
                  value={employee}
                  onChange={(e) => setEmployee(e.target.value)}
                  placeholder="0x wallet address"
                  className={cn(field, "font-mono pr-9")}
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {checkingAddress && <Loader2 size={15} className="animate-spin text-ink/40" />}
                  {!checkingAddress && addressRegistered && <Check size={15} className="text-emerald-500" />}
                  {!checkingAddress && addressError && trimmed !== "" && (
                    <X size={15} className="text-red-500" />
                  )}
                </span>
              </div>
              <div className="mt-1.5 min-h-[1rem] text-xs">
                {addressRegistered && (
                  <span className="text-ink/55">Registered Cadence user</span>
                )}
                {!addressRegistered && addressError && trimmed !== "" && (
                  <span className="text-red-500">{addressError}</span>
                )}
              </div>
            </>
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

        {/* When it starts */}
        <div>
          <label className={labelCls}>When it starts</label>
          <div className="mb-2 inline-flex rounded-full border border-ink/10 bg-paper-warm p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setStartMode("now")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors",
                startMode === "now" ? "bg-volt text-white" : "text-ink/50 hover:text-ink"
              )}
            >
              <Clock size={13} /> Start now
            </button>
            <button
              type="button"
              onClick={() => setStartMode("schedule")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors",
                startMode === "schedule" ? "bg-volt text-white" : "text-ink/50 hover:text-ink"
              )}
            >
              <CalendarClock size={13} /> Schedule
            </button>
          </div>
          {startMode === "schedule" && (
            <>
              <input
                type="datetime-local"
                value={startAtLocal}
                min={minLocal}
                onChange={(e) => setStartAtLocal(e.target.value)}
                className={field}
              />
              <p className="mt-1.5 min-h-[1rem] text-xs">
                {scheduledInvalid ? (
                  <span className="text-red-500">Pick a time in the future.</span>
                ) : startAtLocal ? (
                  <span className="text-ink/55">
                    Funds are escrowed now; the stream begins flowing at the chosen time.
                  </span>
                ) : (
                  <span className="text-ink/40">Choose when the stream should begin.</span>
                )}
              </p>
            </>
          )}
        </div>

        {depositAmount > 0n && (
          <div className="space-y-2 rounded-2xl border border-volt/15 bg-volt-wash px-4 py-3">
            <div className="flex justify-between text-sm">
              <span className="text-panel/55">Streams at</span>
              <span className="font-mono font-medium text-panel">${formatUsdc(dailyRateRaw)} / day</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-panel/45">Per second</span>
              <span className="font-mono text-panel/60">${formatUsdc(ratePerSecond, 8)} / sec</span>
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
