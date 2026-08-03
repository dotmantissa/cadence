"use client";

import { useState } from "react";
import { useCreateStream, useApproveUsdc, useUsdcAllowance, useUsdcBalance } from "@/hooks/usePayroll";
import { parseUsdc, formatUsdc } from "@/lib/utils";
import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";
import { Modal } from "./Modal";

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

const field =
  "w-full rounded-2xl border border-black/10 bg-paper-warm px-3.5 py-3 text-sm text-ink placeholder-ink/30 transition-colors focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/20";
const labelCls = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/50";

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

  const validAddress = employee.startsWith("0x") && employee.length === 42;
  const needsApproval = depositAmount > 0n && (!allowance || allowance < depositAmount);
  const insufficientBalance =
    balance !== undefined && depositAmount > 0n && balance < depositAmount;
  const isPending = txStatus !== "idle";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validAddress) return;
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
      setTxError(e?.shortMessage ?? e?.message ?? "Wallet rejected the transaction");
      setTxStatus("idle");
    }
  }

  return (
    <Modal title="Open a stream" onClose={onClose} closeDisabled={isPending}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>Who is getting paid</label>
          <input
            type="text"
            value={employee}
            onChange={(e) => setEmployee(e.target.value)}
            placeholder="0x wallet address"
            className={cn(field, "font-mono")}
            required
          />
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
          <div className="space-y-2 rounded-2xl border border-black/10 bg-volt-wash px-4 py-3">
            <div className="flex justify-between text-sm">
              <span className="text-ink/55">Streams at</span>
              <span className="font-mono font-medium text-ink">${formatUsdc(dailyRateRaw)} / day</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-ink/45">Per second</span>
              <span className="font-mono text-ink/60">${formatUsdc(ratePerSecond, 8)} / sec</span>
            </div>
            {balance !== undefined && (
              <div
                className={cn(
                  "flex justify-between border-t border-black/10 pt-2 text-xs font-medium",
                  insufficientBalance ? "text-red-500" : "text-volt"
                )}
              >
                <span>Your balance</span>
                <span className="font-mono">${formatUsdc(balance)}</span>
              </div>
            )}
          </div>
        )}

        <div>
          <label className={labelCls}>
            Invoice tag <span className="normal-case text-ink/30">(optional)</span>
          </label>
          <input
            type="text"
            value={invoiceRef}
            onChange={(e) => setInvoiceRef(e.target.value)}
            placeholder="INV-2026-001"
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
          disabled={isPending || insufficientBalance || depositAmount === 0n || !validAddress}
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
