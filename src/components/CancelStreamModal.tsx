"use client";

import { useState } from "react";
import { useConfig } from "wagmi";
import { waitForSuccessfulReceipt } from "@/lib/tx";
import { useCancelStream } from "@/hooks/usePayroll";
import type { StreamMeta } from "@/hooks/usePayroll";
import { formatUsdc } from "@/lib/utils";
import { Modal } from "./Modal";

interface Props {
  stream: StreamMeta;
  onClose: () => void;
  onSubmitted: () => void;
}

const field =
  "w-full rounded-2xl border border-ink/10 bg-paper-warm px-3.5 py-3 text-sm text-ink placeholder-ink/30 focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/20";

export function CancelStreamModal({ stream, onClose, onSubmitted }: Props) {
  const config = useConfig();
  const { cancel } = useCancelStream();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 20) return;
    setError(null);
      setPending(true);
    try {
      const hash = await cancel(stream.id, reason.trim());
      await waitForSuccessfulReceipt(config, hash);
      onSubmitted();
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string };
      setError(e.shortMessage ?? e.message ?? "Wallet rejected the transaction");
      setPending(false);
    }
  }

  return (
    <Modal title={`Request cancellation for #${stream.id.toString()}`} onClose={onClose} closeDisabled={pending}>
      <form onSubmit={submit} className="space-y-4">
        <div className="border-b border-ink/10 pb-4 text-sm text-ink/65">
          The payee keeps everything already earned. The remaining{" "}
          <span className="font-mono text-ink">${formatUsdc(stream.deposit)}</span>{" "}
          stays escrowed for 24 hours so they can appeal.
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/50">
            Why are you cancelling?
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={20}
            maxLength={1000}
            rows={5}
            placeholder="Describe the concrete reason and the remaining obligation it relates to."
            className={field}
            required
          />
          <p className="mt-1.5 text-xs text-ink/40">{reason.length}/1000</p>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={pending || reason.trim().length < 20}
          className="w-full rounded-full bg-red-500 py-3 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Confirming cancellation…" : "Request cancellation"}
        </button>
      </form>
    </Modal>
  );
}
