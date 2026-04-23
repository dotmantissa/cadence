"use client";

import { useState } from "react";
import { useCreateStream, useApproveUsdc, useUsdcAllowance, useUsdcBalance } from "@/hooks/usePayroll";
import { parseUsdc, dailyRateToPerSecond, formatUsdc } from "@/lib/utils";
import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreateStreamModal({ onClose, onSuccess }: Props) {
  const { address } = useAccount();
  const [employee, setEmployee] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [depositDays, setDepositDays] = useState("30");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [step, setStep] = useState<"form" | "approve" | "create">("form");

  const { data: balance } = useUsdcBalance(address);
  const { data: allowance } = useUsdcAllowance(address);
  const { approve, isPending: approvePending, isSuccess: approveSuccess } = useApproveUsdc();
  const { createStream, isPending: createPending, isSuccess: createSuccess } = useCreateStream();

  const ratePerSecond = dailyRateToPerSecond(dailyRate);
  const depositAmount = ratePerSecond * BigInt(Math.max(1, parseInt(depositDays) || 30)) * 86400n;

  const needsApproval = !allowance || allowance < depositAmount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employee.startsWith("0x") || employee.length !== 42) return;
    if (ratePerSecond === 0n) return;

    if (needsApproval) {
      approve(depositAmount * 10n); // approve 10x for future top-ups
      setStep("approve");
    } else {
      createStream(employee as `0x${string}`, ratePerSecond, depositAmount, invoiceRef);
      setStep("create");
    }
  }

  if (createSuccess) {
    onSuccess?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-arc-card border border-arc-border rounded-2xl p-6 w-full max-w-md mx-4 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">New Payroll Stream</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">&times;</button>
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

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Daily Rate (USDC)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={dailyRate}
                onChange={e => setDailyRate(e.target.value)}
                placeholder="100.00"
                className="w-full bg-arc-dark border border-arc-border rounded-lg pl-7 pr-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-arc-blue transition-colors"
                required
              />
            </div>
            {ratePerSecond > 0n && (
              <p className="mt-1 text-xs text-gray-500">
                ≈ ${formatUsdc(ratePerSecond, 8)}/second
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Initial Deposit (days)</label>
            <input
              type="number"
              min="1"
              max="365"
              value={depositDays}
              onChange={e => setDepositDays(e.target.value)}
              className="w-full bg-arc-dark border border-arc-border rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-arc-blue transition-colors"
            />
            {depositAmount > 0n && (
              <p className="mt-1 text-xs text-gray-500">
                Deposit: <span className="text-white">${formatUsdc(depositAmount)} USDC</span>
                {balance !== undefined && (
                  <span className={cn("ml-2", balance < depositAmount ? "text-red-400" : "text-green-400")}>
                    (balance: ${formatUsdc(balance)})
                  </span>
                )}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Invoice / Tax Reference <span className="text-gray-600">(optional)</span></label>
            <input
              type="text"
              value={invoiceRef}
              onChange={e => setInvoiceRef(e.target.value)}
              placeholder="INV-2025-001"
              className="w-full bg-arc-dark border border-arc-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-arc-blue transition-colors"
            />
          </div>

          <div className="pt-1">
            {step === "approve" && !approveSuccess ? (
              <button
                type="submit"
                disabled={approvePending}
                className="w-full py-3 rounded-xl bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 font-medium text-sm disabled:opacity-50"
              >
                {approvePending ? "Approving USDC..." : "Approve USDC Spend"}
              </button>
            ) : (
              <button
                type="submit"
                disabled={createPending || (balance !== undefined && balance < depositAmount)}
                className="w-full py-3 rounded-xl bg-arc-blue hover:bg-blue-600 text-white font-medium text-sm disabled:opacity-40 transition-colors"
              >
                {createPending ? "Creating Stream..." : needsApproval ? "Approve & Create Stream" : "Create Stream"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
