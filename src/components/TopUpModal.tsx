"use client";

import { useState } from "react";
import { useTopUp, useApproveUsdc, useUsdcAllowance, useUsdcBalance } from "@/hooks/usePayroll";
import type { StreamMeta } from "@/hooks/usePayroll";
import { parseUsdc, formatUsdc, rateToDaily, formatRunway } from "@/lib/utils";
import { streamMath } from "@/lib/stream-math";
import { useAccount, useConfig, usePublicClient } from "wagmi";
import { waitForSuccessfulReceipt } from "@/lib/tx";
import { cn } from "@/lib/utils";
import { PAYROLL_ADDRESS, PAYROLL_ABI } from "@/lib/contracts";
import { useNotify } from "@/hooks/useNotify";
import { Modal } from "./Modal";

interface Props {
  stream: StreamMeta;
  onClose: () => void;
}

const field =
  "w-full rounded-2xl border border-ink/10 bg-paper-warm px-3.5 py-3 text-sm text-ink placeholder-ink/30 transition-colors focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/20";

export function TopUpModal({ stream, onClose }: Props) {
  const streamId = stream.id;
  const { address } = useAccount();
  const config = useConfig();
  const publicClient = usePublicClient();
  const { notify } = useNotify();
  const [amount, setAmount] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "approving" | "topping-up">("idle");
  const [txError, setTxError] = useState<string | null>(null);

  const { data: balance } = useUsdcBalance(address);
  const { data: allowance } = useUsdcAllowance(address);
  const { approve } = useApproveUsdc();
  const { topUp } = useTopUp();

  const depositAmount = parseUsdc(amount);
  const needsApproval = depositAmount > 0n && (!allowance || allowance < depositAmount);
  const insufficientBalance =
    balance !== undefined && depositAmount > 0n && balance < depositAmount;
  const isPending = txStatus !== "idle";

  // Preview the contract's top-up behaviour so the employer knows what the extra
  // funds do BEFORE signing. On a genuinely-live stream a top-up holds the finish
  // date fixed and RAISES the per-second rate — it spreads (the escrow not yet
  // earned + the amount added) across the same remaining runway. On a scheduled
  // stream it's purely additive: the rate is untouched and the end date moves out.
  const m = streamMath(stream);
  const unstreamed = stream.deposit > m.unclaimed ? stream.deposit - m.unclaimed : 0n;
  const runwaySec = BigInt(m.runwaySeconds);
  const raisesRate = m.streaming && runwaySec > 0n && depositAmount > 0n;
  const projectedRate = raisesRate
    ? (unstreamed + depositAmount) / runwaySec
    : stream.ratePerSecond;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (depositAmount === 0n) return;

    setTxError(null);
    try {
      if (needsApproval) {
        setTxStatus("approving");
        const approvalHash = await approve(depositAmount);
        await waitForSuccessfulReceipt(config, approvalHash);
      }
      setTxStatus("topping-up");
      const hash = await topUp(streamId, depositAmount);

      // Notify both sides once the top-up confirms. We read the rate back so the
      // email can announce a raised rate on a live stream.
      const added = depositAmount.toString();
      const oldRate = stream.ratePerSecond;
      const employee = stream.employee;
      const ref = stream.invoiceRef || null;
      await waitForSuccessfulReceipt(config, hash);
      let newRate: bigint | null = null;
      try {
        const tuple = await publicClient?.readContract({
          address: PAYROLL_ADDRESS,
          abi: PAYROLL_ABI,
          functionName: "streams",
          args: [streamId],
        });
        if (Array.isArray(tuple)) newRate = tuple[2] as bigint;
      } catch {
        // A successful top-up remains successful if the follow-up read fails.
      }
      await notify("stream_topped_up", {
        counterpartyAddress: employee,
        amount: added,
        rate: newRate !== null && newRate !== oldRate ? newRate.toString() : null,
        reference: ref,
      });
      onClose();
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string };
      setTxError(e?.shortMessage ?? e?.message ?? "Wallet rejected the transaction");
      setTxStatus("idle");
    }
  }

  return (
    <Modal
      title={`Add runway to #${streamId.toString()}`}
      onClose={onClose}
      closeDisabled={isPending}
      className="max-w-sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/50">
            How much to add (USDC)
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink/40">$</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1,000.00"
              className={cn(field, "pl-7")}
              required
            />
          </div>
          {balance !== undefined && (
            <p className="mt-2 text-xs text-ink/45">
              Your balance:{" "}
              <span className={cn("font-mono", insufficientBalance ? "text-red-500" : "text-ink")}>
                ${formatUsdc(balance)}
              </span>
            </p>
          )}
        </div>

        {/* What the top-up will do. A live stream keeps its finish date and speeds
            up; a scheduled one just gets more runway at the same rate. */}
        {depositAmount > 0n && !insufficientBalance && (
          raisesRate ? (
            <div className="rounded-2xl border border-volt/20 bg-volt-wash px-3.5 py-3 text-xs text-ink/70">
              <p className="font-medium text-ink">Finish date stays the same</p>
              <p className="mt-1 text-ink/55">
                To fit the extra funds into the{" "}
                <span className="font-mono text-ink/70">{formatRunway(m.runwaySeconds)}</span> left,
                the rate rises from{" "}
                <span className="font-mono text-ink/70">${rateToDaily(stream.ratePerSecond)}/day</span>{" "}
                to <span className="font-mono text-ink">${rateToDaily(projectedRate)}/day</span>.
              </p>
            </div>
          ) : m.notStarted ? (
            <div className="rounded-2xl border border-ink/10 bg-paper-warm px-3.5 py-3 text-xs text-ink/70">
              <p className="font-medium text-ink">Adds runway before it starts</p>
              <p className="mt-1 text-ink/55">
                The rate stays at{" "}
                <span className="font-mono text-ink/70">${rateToDaily(stream.ratePerSecond)}/day</span>{" "}
                and the stream runs longer once it begins.
              </p>
            </div>
          ) : null
        )}

        {txError && (
          <p className="rounded-2xl border border-red-500/20 bg-red-500/5 px-3.5 py-2.5 text-xs text-red-500">
            {txError}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || insufficientBalance || depositAmount === 0n}
          className={cn(
            "w-full rounded-full py-3.5 text-sm font-medium transition-colors disabled:opacity-40",
            needsApproval && !isPending
              ? "border border-volt/30 bg-volt-wash text-volt hover:bg-volt/10"
              : "bg-volt text-white hover:bg-volt-bright"
          )}
        >
          {txStatus === "approving"
            ? "Approving USDC, confirm in wallet"
            : txStatus === "topping-up"
            ? "Adding funds, confirm in wallet"
            : insufficientBalance
            ? "Not enough USDC"
            : needsApproval
            ? "Approve and add funds"
            : "Add funds"}
        </button>
      </form>
    </Modal>
  );
}
