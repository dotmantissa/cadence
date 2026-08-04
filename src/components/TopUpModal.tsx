"use client";

import { useState } from "react";
import { useTopUp, useApproveUsdc, useUsdcAllowance, useUsdcBalance } from "@/hooks/usePayroll";
import { parseUsdc, formatUsdc } from "@/lib/utils";
import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";
import { Modal } from "./Modal";

interface Props {
  streamId: bigint;
  onClose: () => void;
}

const field =
  "w-full rounded-2xl border border-ink/10 bg-paper-warm px-3.5 py-3 text-sm text-ink placeholder-ink/30 transition-colors focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/20";

export function TopUpModal({ streamId, onClose }: Props) {
  const { address } = useAccount();
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (depositAmount === 0n) return;

    setTxError(null);
    try {
      if (needsApproval) {
        setTxStatus("approving");
        await approve(depositAmount);
      }
      setTxStatus("topping-up");
      await topUp(streamId, depositAmount);
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
