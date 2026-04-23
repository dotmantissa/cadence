"use client";

import { useState } from "react";
import { useTopUp, useApproveUsdc, useUsdcAllowance, useUsdcBalance } from "@/hooks/usePayroll";
import { parseUsdc, formatUsdc } from "@/lib/utils";
import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";

interface Props {
  streamId: bigint;
  onClose: () => void;
}

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
  const insufficientBalance = balance !== undefined && depositAmount > 0n && balance < depositAmount;
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
      setTxError(e?.shortMessage ?? e?.message ?? "Transaction rejected");
      setTxStatus("idle");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-arc-card border border-arc-border rounded-2xl p-6 w-full max-w-sm mx-4 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Add funds to Stream {streamId.toString()}</h2>
          <button
            onClick={onClose}
            disabled={isPending}
            className="text-gray-500 hover:text-gray-300 text-xl leading-none disabled:opacity-30"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">How much to add (USDC)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="1,000.00"
                className="w-full bg-arc-dark border border-arc-border rounded-lg pl-7 pr-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-arc-blue"
                required
              />
            </div>
            {balance !== undefined && (
              <p className="mt-1 text-xs text-gray-500">
                Your balance:{" "}
                <span className={cn(insufficientBalance ? "text-red-400" : "text-white")}>
                  ${formatUsdc(balance)}
                </span>
              </p>
            )}
          </div>

          {txError && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {txError}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending || insufficientBalance || depositAmount === 0n}
            className={cn(
              "w-full py-3 rounded-xl font-medium text-sm disabled:opacity-40 transition-colors",
              needsApproval && !isPending
                ? "bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/30"
                : "bg-arc-blue hover:bg-blue-600 text-white"
            )}
          >
            {txStatus === "approving"
              ? "Approving… (confirm in wallet)"
              : txStatus === "topping-up"
              ? "Adding funds… (confirm in wallet)"
              : insufficientBalance
              ? "Insufficient balance"
              : needsApproval
              ? "Approve & Add Funds"
              : "Add Funds"}
          </button>
        </form>
      </div>
    </div>
  );
}
