"use client";

import { useEffect, useRef, useState } from "react";
import { useCreateStream, useApproveUsdc, useUsdcAllowance, useUsdcBalance, useBatchCreateStreams } from "@/hooks/usePayroll";
import { parseUsdc, formatUsdc, shortenAddress } from "@/lib/utils";
import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";
import { useApi } from "@/hooks/useApi";
import { useNotify } from "@/hooks/useNotify";
import { validateUsername } from "@/lib/username";
import { AtSign, Wallet, Check, Loader2, X, Clock, CalendarClock, Users } from "lucide-react";
import { Modal } from "./Modal";
import { BatchRecipients } from "./BatchRecipients";
import { isAddress } from "viem";
import {
  newRecipient,
  planBatch,
  type AllocationMode,
  type BatchRecipient,
} from "@/lib/batch";

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

type StreamMode = "single" | "batch";
type SingleRecipientMode = "address" | "username";

const field =
  "w-full rounded-2xl border border-ink/10 bg-paper-warm px-3.5 py-3 text-sm text-ink placeholder-ink/30 transition-colors focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/20";
const labelCls = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/50";

/** A human "starts" line from a unix-seconds bigint, for scheduled streams. */
function formatStart(startAt: bigint): string {
  return new Date(Number(startAt) * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CreateStreamModal({ onClose, onSuccess }: Props) {
  const { address } = useAccount();
  const { api } = useApi();
  const { notify } = useNotify();
  const [streamMode, setStreamMode] = useState<StreamMode>("single");

  // Single-stream state (existing flow)
  const [singleMode, setSingleMode] = useState<SingleRecipientMode>("address");
  const [employee, setEmployee] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [streamDays, setStreamDays] = useState("30");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [startMode, setStartMode] = useState<"now" | "schedule">("now");
  const [startAtLocal, setStartAtLocal] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "approving" | "creating">("idle");
  const [txError, setTxError] = useState<string | null>(null);

  // Single-stream resolution (address mode: check if registered; username mode: resolve handle)
  const [resolved, setResolved] = useState<{
    walletAddress: `0x${string}`;
    username: string | null;
    displayName: string | null;
  } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const resolveSeq = useRef(0);

  const [addressRegistered, setAddressRegistered] = useState(false);
  const [checkingAddress, setCheckingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const addressSeq = useRef(0);

  // Batch-stream state
  const [recipients, setRecipients] = useState<BatchRecipient[]>([newRecipient()]);
  const [allocationMode, setAllocationMode] = useState<AllocationMode>("per-recipient");
  const [sharedAmount, setSharedAmount] = useState("");

  const { data: balance } = useUsdcBalance(address);
  const { data: allowance } = useUsdcAllowance(address);
  const { approve } = useApproveUsdc();
  const { createStream } = useCreateStream();
  const { batchCreate, progress, running, error: batchError, reset: resetBatch } = useBatchCreateStreams();

  // ---- Single-stream math & validation ----
  const days = Math.max(1, parseInt(streamDays) || 30);
  const depositAmount = parseUsdc(totalAmount);
  const dailyRateRaw = depositAmount > 0n ? depositAmount / BigInt(days) : 0n;
  const ratePerSecond = dailyRateRaw / 86400n;

  const scheduledMs = startMode === "schedule" && startAtLocal ? new Date(startAtLocal).getTime() : NaN;
  const scheduledInvalid = startMode === "schedule" && (!startAtLocal || isNaN(scheduledMs) || scheduledMs <= Date.now());
  const startAt: bigint =
    startMode === "schedule" && !isNaN(scheduledMs) ? BigInt(Math.floor(scheduledMs / 1000)) : 0n;
  const minLocal = (() => {
    const d = new Date(Date.now() + 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
      d.getMinutes()
    )}`;
  })();

  const trimmed = employee.trim();
  const isRawAddress = trimmed.startsWith("0x") && trimmed.length === 42;

  const singleRecipient: `0x${string}` | null =
    singleMode === "address"
      ? isRawAddress && isAddress(trimmed) && addressRegistered
        ? (trimmed as `0x${string}`)
        : null
      : resolved?.walletAddress ?? null;

  // ---- Batch-stream math & validation ----
  const batchPlan = planBatch(allocationMode, recipients, sharedAmount, days, balance);

  // ---- Single-stream resolution ----
  useEffect(() => {
    if (singleMode !== "username") return;
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
  }, [employee, singleMode]);

  useEffect(() => {
    if (singleMode !== "address") return;
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
  }, [employee, singleMode]);

  function switchSingleMode(next: SingleRecipientMode) {
    if (next === singleMode) return;
    setSingleMode(next);
    setEmployee("");
    setResolved(null);
    setResolveError(null);
  }

  const needsApproval =
    streamMode === "single"
      ? depositAmount > 0n && (!allowance || allowance < depositAmount)
      : batchPlan.total > 0n && (!allowance || allowance < batchPlan.total);

  const insufficientBalance =
    streamMode === "single"
      ? balance !== undefined && depositAmount > 0n && balance < depositAmount
      : batchPlan.insufficientBalance;

  const isPending = txStatus !== "idle" || running;
  const canSubmitSingle =
    singleRecipient !== null &&
    depositAmount > 0n &&
    ratePerSecond > 0n &&
    !insufficientBalance &&
    !scheduledInvalid;

  const canSubmitBatch = batchPlan.canSubmit;

  async function handleSubmitSingle(e: React.FormEvent) {
    e.preventDefault();
    if (!singleRecipient) return;
    if (depositAmount === 0n || ratePerSecond === 0n) return;

    setTxError(null);
    try {
      if (needsApproval) {
        setTxStatus("approving");
        await approve(depositAmount);
      }
      setTxStatus("creating");
      await createStream(singleRecipient, ratePerSecond, depositAmount, invoiceRef, startAt);
      notify("stream_started", {
        counterpartyAddress: singleRecipient,
        amount: depositAmount.toString(),
        rate: ratePerSecond.toString(),
        reference: invoiceRef || null,
        starts: startAt > 0n ? formatStart(startAt) : null,
      });
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string };
      setTxError(e?.shortMessage ?? e?.message ?? "Wallet rejected the transaction");
      setTxStatus("idle");
    }
  }

  async function handleSubmitBatch(e: React.FormEvent) {
    e.preventDefault();
    if (!batchPlan.canSubmit) return;

    setTxError(null);
    resetBatch();
    const streams = batchPlan.rows
      .filter((p) => p.ok)
      .map((p) => ({
        employee: p.row.walletAddress!,
        ratePerSecond: p.ratePerSecond,
        deposit: p.deposit,
        invoiceRef: invoiceRef || "",
        startAt,
      }));

    const result = await batchCreate(batchPlan.total, streams);
    if (result.ok) {
      // One payee email per recipient; the payer gets a single confirmation
      // (notifySelf only on the first) instead of one per stream.
      batchPlan.rows
        .filter((p) => p.ok)
        .forEach((p, i) => {
          notify("stream_started", {
            counterpartyAddress: p.row.walletAddress!,
            amount: p.deposit.toString(),
            rate: p.ratePerSecond.toString(),
            reference: invoiceRef || null,
            starts: startAt > 0n ? formatStart(startAt) : null,
            notifySelf: i === 0,
          });
        });
      onSuccess?.();
      onClose();
    }
    // On partial success or error, keep the modal open with progress visible.
  }

  const activeError = streamMode === "single" ? txError : batchError;

  return (
    <Modal
      title={streamMode === "single" ? "Open a stream" : "Open batch streams"}
      size={streamMode === "batch" ? "lg" : "md"}
      onClose={onClose}
      closeDisabled={isPending}
    >
      <form onSubmit={streamMode === "single" ? handleSubmitSingle : handleSubmitBatch} className="space-y-4">
        {/* Stream mode toggle: single vs batch */}
        <div>
          <label className={labelCls}>Stream mode</label>
          <div className="mb-2 inline-flex rounded-full border border-ink/10 bg-paper-warm p-0.5 text-xs font-medium">
            <button
              type="button"
              disabled={isPending}
              onClick={() => setStreamMode("single")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors disabled:opacity-40",
                streamMode === "single" ? "bg-volt text-white" : "text-ink/50 hover:text-ink"
              )}
            >
              <Wallet size={13} /> Single
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setStreamMode("batch")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors disabled:opacity-40",
                streamMode === "batch" ? "bg-volt text-white" : "text-ink/50 hover:text-ink"
              )}
            >
              <Users size={13} /> Batch
            </button>
          </div>
        </div>

        {streamMode === "single" ? (
          <>
            {/* SINGLE-STREAM FLOW (existing) */}
            <div>
              <label className={labelCls}>Who is getting paid</label>
              <div className="mb-2 inline-flex rounded-full border border-ink/10 bg-paper-warm p-0.5 text-xs font-medium">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => switchSingleMode("address")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors disabled:opacity-40",
                    singleMode === "address" ? "bg-volt text-white" : "text-ink/50 hover:text-ink"
                  )}
                >
                  <Wallet size={13} /> Wallet address
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => switchSingleMode("username")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors disabled:opacity-40",
                    singleMode === "username" ? "bg-volt text-white" : "text-ink/50 hover:text-ink"
                  )}
                >
                  <AtSign size={13} /> Username
                </button>
              </div>

              {singleMode === "address" ? (
                <>
                  <div className="relative">
                    <input
                      type="text"
                      value={employee}
                      disabled={isPending}
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
                      disabled={isPending}
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
                    disabled={isPending}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    placeholder="3,000.00"
                    className={cn(field, "pl-7")}
                    required
                  />
                </div>
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
                  disabled={isPending}
                  onChange={(e) => setStreamDays(e.target.value)}
                  className={field}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            {/* BATCH-STREAM FLOW */}
            <BatchRecipients
              recipients={recipients}
              setRecipients={setRecipients}
              mode={allocationMode}
              setMode={setAllocationMode}
              sharedAmount={sharedAmount}
              setSharedAmount={setSharedAmount}
              plan={batchPlan}
              balance={balance}
              disabled={isPending}
            />
            <div>
              <label className={labelCls}>Over how many days</label>
              <input
                type="number"
                min="1"
                max="365"
                value={streamDays}
                disabled={isPending}
                onChange={(e) => setStreamDays(e.target.value)}
                className={field}
              />
            </div>
          </>
        )}

        {/* When it starts (shared by single & batch) */}
        <div>
          <label className={labelCls}>When it starts</label>
          <div className="mb-2 inline-flex rounded-full border border-ink/10 bg-paper-warm p-0.5 text-xs font-medium">
            <button
              type="button"
              disabled={isPending}
              onClick={() => setStartMode("now")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors disabled:opacity-40",
                startMode === "now" ? "bg-volt text-white" : "text-ink/50 hover:text-ink"
              )}
            >
              <Clock size={13} /> Start now
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setStartMode("schedule")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors disabled:opacity-40",
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
                disabled={isPending}
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

        {/* Rate preview (single only) */}
        {streamMode === "single" && depositAmount > 0n && (
          <div className="space-y-2 rounded-2xl border border-volt/15 bg-volt/[0.06] px-4 py-3">
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

        {/* Remark (shared) */}
        <div>
          <label className={labelCls}>
            Remark <span className="normal-case text-ink/30">(optional)</span>
          </label>
          <input
            type="text"
            value={invoiceRef}
            disabled={isPending}
            onChange={(e) => setInvoiceRef(e.target.value)}
            placeholder="e.g. June retainer, INV-2026-001"
            className={field}
          />
        </div>

        {/* Batch progress */}
        {streamMode === "batch" && running && (
          <div className="rounded-2xl border border-volt/20 bg-volt/[0.06] p-4">
            <p className="mb-2 text-sm font-medium text-ink">Creating streams…</p>
            <div className="space-y-1">
              {progress.map((st, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {st === "pending" && <Loader2 size={13} className="animate-spin text-volt" />}
                  {st === "success" && <Check size={13} className="text-emerald-500" />}
                  {st === "error" && <X size={13} className="text-red-500" />}
                  {st === "idle" && <span className="h-3 w-3 rounded-full border border-ink/20" />}
                  <span className={cn("font-mono", st === "success" && "text-ink/55")}>
                    Stream {i + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeError && (
          <p className="rounded-2xl border border-red-500/20 bg-red-500/5 px-3.5 py-2.5 text-xs text-red-500">
            {activeError}
          </p>
        )}

        <button
          type="submit"
          disabled={
            isPending ||
            (streamMode === "single" ? !canSubmitSingle : !canSubmitBatch)
          }
          className={cn(
            "w-full rounded-full py-3.5 text-sm font-medium transition-colors disabled:opacity-40",
            needsApproval && !isPending
              ? "border border-volt/30 bg-volt/[0.06] text-volt hover:bg-volt/10"
              : "bg-volt text-white hover:bg-volt-bright"
          )}
        >
          {txStatus === "approving"
            ? "Approving USDC, confirm in wallet"
            : txStatus === "creating"
            ? "Opening stream, confirm in wallet"
            : running
            ? `Creating ${progress.filter((s) => s === "success").length} / ${progress.length} streams…`
            : insufficientBalance
            ? "Not enough USDC"
            : needsApproval
            ? `Approve and open ${streamMode === "batch" ? `${batchPlan.readyCount} streams` : "stream"}`
            : streamMode === "batch"
            ? `Open ${batchPlan.readyCount} streams`
            : "Open stream"}
        </button>
      </form>
    </Modal>
  );
}
