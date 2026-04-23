"use client";

import { useState } from "react";
import { useCreateStream, useApproveUsdc, useUsdcAllowance, useUsdcBalance } from "@/hooks/usePayroll";
import { parseUsdc, formatUsdc } from "@/lib/utils";
import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreateStreamModal({ onClose, onSuccess }: Props) {
  const { address } = useAccount();
  const [employee, setEmployee] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [streamDays, setStreamDays] = useState("30");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "approving" | "creating">("idle");
  const [txError, setTxError] = useState<string | null>(null);

  const { data: balance } = useUsdcBalance(address);
  const { data: allowance } = useUsdcAllowance(address);
  const { approve } = useApproveUsdc();
  const { createStream } = useCreateStream();

  const days = Math.max(1, parseInt(streamDays) || 30);
  const depositAmount = parseUsdc(totalAmount);
  const dailyRateRaw = depositAmount > 0n ? depositAmount / BigInt(days) : 0n;
  const ratePerSecond = dailyRateRaw / 86400n;

  const needsApproval = depositAmount > 0n && (!allowance || allowance < depositAmount);
  const insufficientBalance = balance !== undefined && depositAmount > 0n && balance < depositAmount;
  const isPending = txStatus !== "idle";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employee.startsWith("0x") || employee.length !== 42) return;
    if (depositAmount === 0n || ratePerSecond === 0n) return;

    setTxError(null);

    try {
      if (needsApproval) {
        setTxStatus("approving");
        await approve(depositAmount);
      }

      setTxStatus("creating");
      await createStream(employee as `0x${string}`, ratePerSecond, depositAmount, invoiceRef);

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string };
      setTxError(e?.shortMessage ?? e?.message ?? "Transaction rejected");
      setTxStatus("idle");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-arc-card border border-arc-border rounded-2xl p-6 w-full max-w-md mx-4 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">New Stream</h2>
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
            <label className="block text-xs text-gray-500 mb-1.5">Employee Address</label>
            <input
              type="text"
              value={employee}
              onChange={e => setEmployee(e.target.value)}
              placeholder="0x..."
              className="w-full bg-arc-dark border border-arc-border rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-arc-blue transition-colors"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Total Amount (USDC)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={totalAmount}
                  onChange={e => setTotalAmount(e.target.value)}
                  placeholder="3,000.00"
                  className="w-full bg-arc-dark border border-arc-border rounded-lg pl-7 pr-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-arc-blue transition-colors"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Number of Days</label>
              <input
                type="number"
                min="1"
                max="365"
                value={streamDays}
                onChange={e => setStreamDays(e.target.value)}
                className="w-full bg-arc-dark border border-arc-border rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-arc-blue transition-colors"
              />
            </div>
          </div>

          {depositAmount > 0n && (
            <div className="bg-arc-dark/60 border border-arc-border rounded-lg px-4 py-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Daily stream</span>
                <span className="text-white font-medium">${formatUsdc(dailyRateRaw)} / day</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Per second</span>
                <span className="text-gray-400">${formatUsdc(ratePerSecond, 8)} / sec</span>
              </div>
              {balance !== undefined && (
                <div className={cn(
                  "flex justify-between text-xs pt-2 border-t border-arc-border",
                  insufficientBalance ? "text-red-400" : "text-green-400"
                )}>
                  <span>Your balance</span>
                  <span>${formatUsdc(balance)}</span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">
              Invoice reference <span className="text-gray-600">(optional)</span>
            </label>
            <input
              type="text"
              value={invoiceRef}
              onChange={e => setInvoiceRef(e.target.value)}
              placeholder="INV-2025-001"
              className="w-full bg-arc-dark border border-arc-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-arc-blue transition-colors"
            />
          </div>

          {txError && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {txError}
            </p>
          )}

          <div className="pt-1">
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
                ? "Approving USDC… (confirm in wallet)"
                : txStatus === "creating"
                ? "Creating stream… (confirm in wallet)"
                : insufficientBalance
                ? "Insufficient Balance"
                : needsApproval
                ? "Approve & Create Stream"
                : "Create Stream"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
