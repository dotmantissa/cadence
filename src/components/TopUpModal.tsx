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

  const { data: balance } = useUsdcBalance(address);
  const { data: allowance } = useUsdcAllowance(address);
  const { approve, isPending: approvePending, isSuccess: approveSuccess } = useApproveUsdc();
  const { topUp, isPending: topUpPending, isSuccess: topUpSuccess } = useTopUp();

  const depositAmount = parseUsdc(amount);
  const needsApproval = !allowance || allowance < depositAmount;

  if (topUpSuccess) {
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (depositAmount === 0n) return;

    if (needsApproval) {
      approve(depositAmount * 2n);
    } else {
      topUp(streamId, depositAmount);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-arc-card border border-arc-border rounded-2xl p-6 w-full max-w-sm mx-4 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Top Up Stream #{streamId.toString()}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Amount (USDC)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="1000.00"
                className="w-full bg-arc-dark border border-arc-border rounded-lg pl-7 pr-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-arc-blue"
                required
              />
            </div>
            {balance !== undefined && (
              <p className="mt-1 text-xs text-gray-500">
                Balance: <span className={cn(balance < depositAmount ? "text-red-400" : "text-white")}>${formatUsdc(balance)}</span>
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={topUpPending || approvePending || (balance !== undefined && balance < depositAmount)}
            className="w-full py-3 rounded-xl bg-arc-blue hover:bg-blue-600 text-white font-medium text-sm disabled:opacity-40 transition-colors"
          >
            {approvePending ? "Approving..." : topUpPending ? "Topping up..." : needsApproval ? "Approve & Top Up" : "Top Up"}
          </button>
        </form>
      </div>
    </div>
  );
}
