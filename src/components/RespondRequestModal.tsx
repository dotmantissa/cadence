"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import {
  useRequestActions,
  useApproveUsdc,
  useUsdcAllowance,
  useUsdcBalance,
  type RequestMeta,
} from "@/hooks/usePayroll";
import { parseUsdc, formatUsdc, shortenAddress, rateToDaily, cn } from "@/lib/utils";
import { useNotify } from "@/hooks/useNotify";
import { Clock, CalendarClock } from "lucide-react";
import { Modal } from "./Modal";

interface Props {
  request: RequestMeta;
  counterpartyName?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

type Mode = "accept" | "counter";

const field =
  "w-full rounded-2xl border border-ink/10 bg-paper-warm px-3.5 py-3 text-sm text-ink placeholder-ink/30 transition-colors focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/20";
const labelCls = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/50";

/** Local datetime-local string for a unix-seconds bigint (0 = empty). */
function toLocalInput(unixSec: bigint): string {
  if (unixSec === 0n) return "";
  const d = new Date(Number(unixSec) * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

/**
 * The payer side of negotiation. Either accept the request as-is (funds the
 * exact deposit and opens the stream) or counter with new terms. A counter
 * ESCROWS the new deposit immediately — that pre-commitment is what lets the
 * payee accept later with no further signature from the payer, and it auto-
 * refunds if they don't respond within the 6-hour window. Both paths need a
 * USDC approval first, exactly like opening a stream.
 */
export function RespondRequestModal({ request, counterpartyName, onClose, onSuccess }: Props) {
  const { address } = useAccount();
  const { notify } = useNotify();
  const [mode, setMode] = useState<Mode>("accept");

  // Counter fields, prefilled from the request's current terms.
  const requestedDaily = rateToDaily(request.ratePerSecond); // string like "100.00"
  const [totalAmount, setTotalAmount] = useState(formatUsdc(request.deposit));
  const [streamDays, setStreamDays] = useState(() => {
    // Derive the implied day count so the counter starts from the same shape.
    const daily = request.ratePerSecond * 86400n;
    if (daily === 0n) return "30";
    const days = Number(request.deposit / daily);
    return String(Math.max(1, days || 30));
  });
  const [invoiceRef, setInvoiceRef] = useState(request.invoiceRef);
  const [startMode, setStartMode] = useState<"now" | "schedule">(request.startAt === 0n ? "now" : "schedule");
  const [startAtLocal, setStartAtLocal] = useState(toLocalInput(request.startAt));

  const [txStatus, setTxStatus] = useState<"idle" | "approving" | "submitting">("idle");
  const [txError, setTxError] = useState<string | null>(null);

  const { data: balance } = useUsdcBalance(address);
  const { data: allowance } = useUsdcAllowance(address);
  const { approve } = useApproveUsdc();
  const { acceptRequest, counterRequest } = useRequestActions();

  // The deposit this action commits: the request's own deposit when accepting,
  // or the edited amount when countering.
  const days = Math.max(1, parseInt(streamDays) || 30);
  const counterDeposit = parseUsdc(totalAmount);
  const counterDailyRaw = counterDeposit > 0n ? counterDeposit / BigInt(days) : 0n;
  const counterRate = counterDailyRaw / 86400n;

  const deposit = mode === "accept" ? request.deposit : counterDeposit;

  const scheduledMs = startMode === "schedule" && startAtLocal ? new Date(startAtLocal).getTime() : NaN;
  const scheduledInvalid =
    mode === "counter" &&
    startMode === "schedule" &&
    (!startAtLocal || isNaN(scheduledMs) || scheduledMs <= Date.now());
  const counterStartAt: bigint =
    startMode === "schedule" && !isNaN(scheduledMs) ? BigInt(Math.floor(scheduledMs / 1000)) : 0n;
  const minLocal = (() => {
    const d = new Date(Date.now() + 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
      d.getMinutes()
    )}`;
  })();

  const needsApproval = deposit > 0n && (!allowance || allowance < deposit);
  const insufficientBalance = balance !== undefined && deposit > 0n && balance < deposit;
  const isPending = txStatus !== "idle";
  const counterInvalid = mode === "counter" && (counterDeposit === 0n || counterRate === 0n || scheduledInvalid);
  const canSubmit = deposit > 0n && !insufficientBalance && !counterInvalid && !isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setTxError(null);
    try {
      if (needsApproval) {
        setTxStatus("approving");
        await approve(deposit);
      }
      setTxStatus("submitting");
      if (mode === "accept") {
        await acceptRequest(request.id);
        // Accepting funds and opens the stream — the payee's request is now live.
        notify("stream_started", {
          counterpartyAddress: request.payee,
          amount: request.deposit.toString(),
          rate: request.ratePerSecond.toString(),
          reference: request.invoiceRef || null,
        });
      } else {
        await counterRequest(request.id, counterRate, counterDeposit, counterStartAt);
        // Countering sends the payee new terms to accept or decline.
        notify("counter_offer", {
          counterpartyAddress: request.payee,
          amount: counterDeposit.toString(),
          rate: counterRate.toString(),
          reference: invoiceRef || null,
        });
      }
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string };
      setTxError(e?.shortMessage ?? e?.message ?? "Wallet rejected the transaction");
      setTxStatus("idle");
    }
  }

  const payeeLabel = counterpartyName ? `@${counterpartyName}` : shortenAddress(request.payee);

  return (
    <Modal
      title={`Request #${request.id.toString()}`}
      onClose={onClose}
      closeDisabled={isPending}
    >
      {/* What was asked */}
      <div className="mb-4 rounded-2xl border border-ink/10 bg-paper-warm px-4 py-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-ink/45">From</span>
          <span className="font-mono text-ink/80">{payeeLabel}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-ink/45">They asked for</span>
          <span className="font-mono text-ink">
            ${requestedDaily}/day · ${formatUsdc(request.deposit)} total
          </span>
        </div>
        {request.invoiceRef && (
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-ink/45">Remark</span>
            <span className="text-ink/80">{request.invoiceRef}</span>
          </div>
        )}
      </div>

      {/* Accept as-is vs counter */}
      <div className="mb-4 inline-flex rounded-full border border-ink/10 bg-paper-warm p-0.5 text-xs font-medium">
        <button
          type="button"
          onClick={() => setMode("accept")}
          className={cn(
            "rounded-full px-3.5 py-1.5 transition-colors",
            mode === "accept" ? "bg-volt text-white" : "text-ink/50 hover:text-ink"
          )}
        >
          Accept as-is
        </button>
        <button
          type="button"
          onClick={() => setMode("counter")}
          className={cn(
            "rounded-full px-3.5 py-1.5 transition-colors",
            mode === "counter" ? "bg-volt text-white" : "text-ink/50 hover:text-ink"
          )}
        >
          Counter
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "counter" && (
          <>
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
                    className={cn(field, "pl-7")}
                    required
                  />
                </div>
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
                  <Clock size={13} /> On accept
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
                    ) : (
                      <span className="text-ink/55">The stream begins flowing at the chosen time.</span>
                    )}
                  </p>
                </>
              )}
            </div>

            {counterDeposit > 0n && (
              <div className="flex justify-between rounded-2xl border border-volt/15 bg-volt-wash px-4 py-3 text-sm">
                <span className="text-panel/55">Your offer</span>
                <span className="font-mono font-medium text-panel">
                  ${formatUsdc(counterDailyRaw)} / day
                </span>
              </div>
            )}
          </>
        )}

        {/* Balance + what this costs the payer now */}
        <div className="rounded-2xl border border-ink/10 bg-paper-warm px-4 py-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-ink/45">
              {mode === "accept" ? "You fund now" : "You escrow now"}
            </span>
            <span className="font-mono text-ink">${formatUsdc(deposit)}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-ink/45">Your balance</span>
            <span className={cn("font-mono", insufficientBalance ? "text-red-500" : "text-ink/70")}>
              ${balance === undefined ? "—" : formatUsdc(balance)}
            </span>
          </div>
          {mode === "counter" && (
            <p className="mt-2 text-ink/45">
              Escrow is held for 6 hours. If they don&apos;t accept, it&apos;s refundable back to you.
            </p>
          )}
        </div>

        {txError && (
          <p className="rounded-2xl border border-red-500/20 bg-red-500/5 px-3.5 py-2.5 text-xs text-red-500">
            {txError}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            "w-full rounded-full py-3.5 text-sm font-medium transition-colors disabled:opacity-40",
            needsApproval && !isPending
              ? "border border-volt/30 bg-volt-wash text-volt hover:bg-volt/10"
              : "bg-volt text-white hover:bg-volt-bright"
          )}
        >
          {txStatus === "approving"
            ? "Approving USDC, confirm in wallet"
            : txStatus === "submitting"
            ? mode === "accept"
              ? "Opening stream, confirm in wallet"
              : "Escrowing counter, confirm in wallet"
            : insufficientBalance
            ? "Not enough USDC"
            : needsApproval
            ? mode === "accept"
              ? "Approve and open stream"
              : "Approve and send counter"
            : mode === "accept"
            ? "Accept and open stream"
            : "Send counter offer"}
        </button>
      </form>
    </Modal>
  );
}
