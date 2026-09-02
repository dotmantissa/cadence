"use client";

import { useEffect, useState } from "react";
import { useConfig } from "wagmi";
import { waitForSuccessfulReceipt } from "@/lib/tx";
import { useApi } from "@/hooks/useApi";
import { useAppealCancellation } from "@/hooks/usePayroll";
import type { CancellationMeta, StreamMeta } from "@/hooks/usePayroll";
import { APPEAL_SOURCE_TYPES, type AppealSourceType } from "@/lib/appeals";
import { formatUsdc } from "@/lib/utils";
import { Modal } from "./Modal";
import { BantRoom } from "./BantRoom";

interface Props {
  stream: StreamMeta;
  cancellation: CancellationMeta;
  onClose: () => void;
  onSubmitted: () => void;
}

type Source = { type: AppealSourceType; url: string; description: string };
const field =
  "w-full rounded-2xl border border-ink/10 bg-paper-warm px-3.5 py-3 text-sm text-ink placeholder-ink/30 focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/20";

export function AppealCancellationModal({ stream, cancellation, onClose, onSubmitted }: Props) {
  const config = useConfig();
  const { api } = useApi();
  const { appeal } = useAppealCancellation();
  const [statement, setStatement] = useState("");
  const [sources, setSources] = useState<Source[]>([
    { type: "agreement", url: "", description: "" },
  ]);
  const [workflowCaseId, setWorkflowCaseId] = useState<string | null>(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const busy = status !== "idle" && status !== "done" && status !== "failed";

  useEffect(() => {
    if ((status !== "onchain" && status !== "workflow") || !workflowCaseId) return;
    let stopped = false;
    const advance = async () => {
      try {
        const result = await api.advanceCancellationAppeal(workflowCaseId);
        if (stopped) return;
        const next = result.appeal?.status ?? "workflow";
        if (next === "complete") {
          setStatus("done");
          onSubmitted();
          return;
        }
        if (next === "failed") {
          setStatus("failed");
          setError(result.appeal?.lastError ?? "The adjudication workflow failed");
          return;
        }
        setStatus("workflow");
      } catch (err) {
        if (!stopped) {
          setStatus("failed");
          setError(err instanceof Error ? err.message : "Could not advance the appeal");
        }
      }
    };
    void advance();
    const timer = setInterval(() => void advance(), 10_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [api, onSubmitted, status, workflowCaseId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (statement.trim().length < 40 || sources.some((s) => !s.url.trim() || s.description.trim().length < 10)) {
      return;
    }
    setError(null);
    setStatus("preparing");
    try {
      const prepared = await api.prepareCancellationAppeal({
        streamId: stream.id.toString(),
        statement: statement.trim(),
        sources: sources.map((source) => ({ ...source, url: source.url.trim(), description: source.description.trim() })),
      });
      setWorkflowCaseId(prepared.appeal.caseId);
      setStatus("onchain");
      const hash = await appeal(stream.id, prepared.appeal.evidenceUri, prepared.appeal.evidenceHash);
      await waitForSuccessfulReceipt(config, hash);
      setStatus("workflow");
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string };
      setStatus("failed");
      setError(e.shortMessage ?? e.message ?? "Could not submit the appeal");
    }
  }

  function updateSource(index: number, patch: Partial<Source>) {
    setSources((current) => current.map((source, i) => (i === index ? { ...source, ...patch } : source)));
  }

  if (status === "done") {
    return (
      <Modal title="Appeal resolved" onClose={onClose}>
        <p className="text-sm text-ink/65">The GenLayer verdict has been delivered to Arc. The stream card will refresh with the final outcome.</p>
        <button onClick={onClose} className="mt-5 w-full rounded-full bg-volt py-3 text-sm font-medium text-white">Close</button>
      </Modal>
    );
  }

  if (workflowCaseId && status === "workflow") {
    return (
      <BantRoom
        caseId={workflowCaseId}
        onClose={onClose}
        onCompleted={() => {
          // The existing workflow poll continues until the frozen Bant
          // transcript has been adjudicated and relayed to Arc.
        }}
      />
    );
  }

  return (
    <Modal title={`Appeal cancellation #${stream.id.toString()}`} onClose={onClose} closeDisabled={busy} size="lg">
      <form onSubmit={submit} className="space-y-5">
        <div className="border-b border-ink/10 pb-4 text-sm text-ink/65">
          {formatUsdc(cancellation.escrowedRefund)} USDC is held while GenLayer reviews whether the cancellation should stand. The payee bears the burden of proof.
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/50">Why should the stream continue?</label>
          <textarea value={statement} onChange={(e) => setStatement(e.target.value)} minLength={40} maxLength={4000} rows={5} className={field} placeholder="Connect the agreement or accepted work to the payer's cancellation reason." required />
          <p className="mt-1.5 text-xs text-ink/40">{statement.length}/4000</p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wide text-ink/50">Public evidence sources</label>
            {sources.length < 8 && (
              <button type="button" onClick={() => setSources((current) => [...current, { type: "agreement", url: "", description: "" }])} className="text-xs font-medium text-volt">Add source</button>
            )}
          </div>
          {sources.map((source, index) => (
            <div key={index} className="space-y-2 border border-ink/10 bg-paper-warm p-3">
              <div className="flex gap-2">
                <select value={source.type} onChange={(e) => updateSource(index, { type: e.target.value as AppealSourceType })} className={`${field} flex-1`}>
                  {APPEAL_SOURCE_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
                </select>
                {sources.length > 1 && <button type="button" onClick={() => setSources((current) => current.filter((_, i) => i !== index))} className="px-2 text-sm text-red-500">Remove</button>}
              </div>
              <input type="url" value={source.url} onChange={(e) => updateSource(index, { url: e.target.value })} placeholder="https://…" className={field} required />
              <input value={source.description} onChange={(e) => updateSource(index, { description: e.target.value })} placeholder="What this source proves" className={field} required />
            </div>
          ))}
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={busy || statement.trim().length < 40} className="w-full rounded-full bg-volt py-3 text-sm font-medium text-white hover:bg-volt-bright disabled:cursor-not-allowed disabled:opacity-40">
          {status === "preparing" ? "Committing evidence…" : status === "onchain" ? "Confirming Arc appeal…" : status === "workflow" ? "Waiting for GenLayer…" : "Submit appeal"}
        </button>
      </form>
    </Modal>
  );
}
