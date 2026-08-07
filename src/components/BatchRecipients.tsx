"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X, Check, Loader2, Upload, FileText, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useApi } from "@/hooks/useApi";
import { cn, formatUsdc, shortenAddress } from "@/lib/utils";
import {
  ALLOCATION_MODES,
  newRecipient,
  type AllocationMode,
  type BatchRecipient,
  type BatchPlan,
} from "@/lib/batch";
import type { ImportedRow } from "@/lib/batch-import";

const field =
  "w-full rounded-2xl border border-ink/10 bg-paper-warm px-3.5 py-3 text-sm text-ink placeholder-ink/30 transition-colors focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/20";
const labelCls = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/50";

interface Props {
  recipients: BatchRecipient[];
  setRecipients: React.Dispatch<React.SetStateAction<BatchRecipient[]>>;
  mode: AllocationMode;
  setMode: (m: AllocationMode) => void;
  sharedAmount: string;
  setSharedAmount: (v: string) => void;
  plan: BatchPlan;
  balance: bigint | undefined;
  disabled?: boolean;
}

/**
 * The batch recipient editor: a dynamic list of address/@handle rows with a +
 * to add and an import button, an allocation-mode switch (per-recipient / split
 * a total / same each), and a per-row amount box when the mode calls for it.
 *
 * Resolution is batched and debounced: whenever the set of typed inputs settles,
 * we resolve them all in one /api/resolve-batch call and stamp each row with its
 * wallet + status. A monotonic sequence guards against out-of-order responses.
 */
export function BatchRecipients({
  recipients,
  setRecipients,
  mode,
  setMode,
  sharedAmount,
  setSharedAmount,
  plan,
  balance,
  disabled,
}: Props) {
  const { api } = useApi();
  const resolveSeq = useRef(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Debounced batch resolution. Keyed on the trimmed, non-empty inputs so it
  // only refires when the actual recipient text changes (not on amount edits).
  const inputKey = recipients
    .map((r) => r.input.trim())
    .filter((s) => s !== "")
    .join("\n");

  useEffect(() => {
    const entries = recipients
      .map((r, i) => ({ i, input: r.input.trim() }))
      .filter((e) => e.input !== "");

    if (entries.length === 0) return;

    // Mark all pending immediately for feedback.
    setRecipients((prev) =>
      prev.map((r) => (r.input.trim() !== "" ? { ...r, status: "resolving" } : r))
    );

    const seq = ++resolveSeq.current;
    const t = setTimeout(async () => {
      try {
        const res = await api.resolveBatch(entries.map((e) => e.input));
        if (seq !== resolveSeq.current) return;
        setRecipients((prev) => {
          const next = [...prev];
          entries.forEach((e, k) => {
            const r = res.results[k];
            const row = next[e.i];
            if (!row || row.input.trim() !== e.input) return; // row moved/changed
            if (r.status === "resolved" && r.walletAddress) {
              next[e.i] = {
                ...row,
                status: "resolved",
                walletAddress: r.walletAddress as `0x${string}`,
                username: r.username,
                displayName: r.displayName,
                error: undefined,
              };
            } else {
              next[e.i] = {
                ...row,
                status: r.status === "invalid" ? "invalid" : "not_found",
                walletAddress: null,
                username: null,
                displayName: null,
                error: r.error,
              };
            }
          });
          return next;
        });
      } catch {
        if (seq !== resolveSeq.current) return;
        setRecipients((prev) =>
          prev.map((r) =>
            r.input.trim() !== "" && r.status === "resolving"
              ? { ...r, status: "not_found", error: "could not resolve" }
              : r
          )
        );
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey]);

  const updateRow = useCallback(
    (id: string, patch: Partial<BatchRecipient>) => {
      setRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    },
    [setRecipients]
  );

  const setInput = (id: string, input: string) =>
    // Editing the recipient text resets its resolution state.
    updateRow(id, {
      input,
      status: "idle",
      walletAddress: null,
      username: null,
      displayName: null,
      error: undefined,
    });

  const addRow = () => setRecipients((prev) => [...prev, newRecipient()]);
  const removeRow = (id: string) =>
    setRecipients((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Allow re-importing the same file by clearing the input value.
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;

    setImportError(null);
    setImporting(true);
    try {
      // Lazy-load the parser (and its xlsx/papaparse deps) only when needed.
      const { parseImportFile } = await import("@/lib/batch-import");
      const result = await parseImportFile(file);
      if (!result.ok) {
        setImportError(result.error);
        return;
      }
      const rows: ImportedRow[] = result.rows;
      // Replace the current list with the imported one. If the file carried
      // amounts, switch to per-recipient mode so they're used as-is.
      setRecipients(
        rows.map((row) =>
          newRecipient({ input: row.recipient, amount: row.amount })
        )
      );
      if (result.hadAmountColumn && rows.some((r) => r.amount !== "")) {
        setMode("per-recipient");
      }
    } catch {
      setImportError("The file could not be read.");
    } finally {
      setImporting(false);
    }
  }

  const showPerRowAmount = mode === "per-recipient";

  return (
    <div className="space-y-4">
      {/* Import + guide */}
      <div className="flex items-center justify-between gap-2">
        <label className={cn(labelCls, "mb-0")}>Recipients</label>
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            disabled={disabled || importing}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-paper-warm px-3 py-1.5 font-medium text-ink/70 transition-colors hover:border-ink/25 hover:text-ink disabled:opacity-40"
          >
            {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            Import file
          </button>
          <Link
            href="/batch-guide"
            target="_blank"
            className="inline-flex items-center gap-1 font-medium text-volt transition-colors hover:text-volt-bright"
          >
            <FileText size={12} /> Format guide
          </Link>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,.xlsx,.xls"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      {importError && (
        <p className="flex items-start gap-2 rounded-2xl border border-red-500/20 bg-red-500/5 px-3.5 py-2.5 text-xs text-red-500">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            {importError}{" "}
            <Link href="/batch-guide" target="_blank" className="underline underline-offset-2">
              See the format guide
            </Link>
            .
          </span>
        </p>
      )}

      {/* Allocation mode */}
      <div>
        <label className={labelCls}>How to allocate</label>
        <div className="flex flex-wrap gap-2">
          {ALLOCATION_MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              disabled={disabled}
              onClick={() => setMode(m.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                mode === m.key
                  ? "border-volt bg-volt text-white"
                  : "border-ink/10 bg-paper text-ink/60 hover:border-ink/25 hover:text-ink"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink/45">
          {ALLOCATION_MODES.find((m) => m.key === mode)?.hint}
        </p>
      </div>

      {/* Shared amount for split / uniform modes */}
      {mode !== "per-recipient" && (
        <div>
          <label className={labelCls}>
            {mode === "split" ? "Total to split (USDC)" : "Amount each (USDC)"}
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink/40">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={sharedAmount}
              disabled={disabled}
              onChange={(e) => setSharedAmount(e.target.value)}
              placeholder={mode === "split" ? "10,000.00" : "500.00"}
              className={cn(field, "pl-7")}
            />
          </div>
        </div>
      )}

      {/* Recipient rows */}
      <div className="space-y-2">
        {recipients.map((r, i) => {
          const rowPlan = plan.rows[i];
          return (
            <BatchRow
              key={r.id}
              row={r}
              deposit={rowPlan?.deposit ?? 0n}
              duplicateOf={rowPlan?.duplicateOf ?? null}
              showAmount={showPerRowAmount}
              canRemove={recipients.length > 1}
              disabled={disabled}
              onInput={(v) => setInput(r.id, v)}
              onAmount={(v) => updateRow(r.id, { amount: v })}
              onRemove={() => removeRow(r.id)}
            />
          );
        })}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={addRow}
        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink/20 px-3.5 py-2 text-xs font-medium text-ink/60 transition-colors hover:border-volt/40 hover:text-volt disabled:opacity-40"
      >
        <Plus size={14} /> Add recipient
      </button>

      {/* Batch summary */}
      <div className="space-y-1.5 rounded-2xl border border-volt/20 bg-volt/[0.06] p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-ink/60">Recipients ready</span>
          <span className="font-mono font-medium text-ink">
            {plan.readyCount}
            <span className="text-ink/40"> / {recipients.filter((r) => r.input.trim() !== "").length}</span>
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink/60">Total to stream</span>
          <span
            className={cn(
              "font-mono font-medium",
              plan.insufficientBalance ? "text-red-500" : "text-volt"
            )}
          >
            ${formatUsdc(plan.total)}
          </span>
        </div>
        {balance !== undefined && (
          <div className="flex justify-between text-xs">
            <span className="text-ink/45">Your balance</span>
            <span className="font-mono text-ink/55">${formatUsdc(balance)}</span>
          </div>
        )}
        {plan.insufficientBalance && (
          <p className="pt-1 text-xs font-medium text-red-500">
            Total exceeds your balance. Lower an amount or remove a recipient.
          </p>
        )}
        {plan.hasZeroAmount && !plan.insufficientBalance && (
          <p className="pt-1 text-xs font-medium text-amber-600 dark:text-amber-500">
            Some recipients have no amount, or an amount too small to stream over this many days.
          </p>
        )}
        {plan.hasDuplicates && (
          <p className="pt-1 text-xs font-medium text-amber-600 dark:text-amber-500">
            A wallet appears more than once. Each becomes its own separate stream.
          </p>
        )}
      </div>
    </div>
  );
}

/** One recipient row: input, resolution badge, optional amount box, remove. */
function BatchRow({
  row,
  deposit,
  duplicateOf,
  showAmount,
  canRemove,
  disabled,
  onInput,
  onAmount,
  onRemove,
}: {
  row: BatchRecipient;
  deposit: bigint;
  duplicateOf: number | null;
  showAmount: boolean;
  canRemove: boolean;
  disabled?: boolean;
  onInput: (v: string) => void;
  onAmount: (v: string) => void;
  onRemove: () => void;
}) {
  const empty = row.input.trim() === "";
  return (
    <div className="rounded-2xl border border-ink/10 bg-paper-warm p-2.5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={row.input}
            disabled={disabled}
            onChange={(e) => onInput(e.target.value)}
            placeholder="0x address or @handle"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-ink/10 bg-paper px-3 py-2 pr-8 font-mono text-sm text-ink placeholder-ink/30 transition-colors focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/20 disabled:opacity-50"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
            {row.status === "resolving" && <Loader2 size={14} className="animate-spin text-ink/40" />}
            {row.status === "resolved" && <Check size={14} className="text-emerald-500" />}
            {(row.status === "not_found" || row.status === "invalid") && !empty && (
              <X size={14} className="text-red-500" />
            )}
          </span>
        </div>

        {showAmount && (
          <div className="relative w-32 shrink-0">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink/40">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={row.amount}
              disabled={disabled}
              onChange={(e) => onAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-ink/10 bg-paper py-2 pl-6 pr-2.5 text-sm text-ink placeholder-ink/30 transition-colors focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/20 disabled:opacity-50"
            />
          </div>
        )}

        <button
          type="button"
          onClick={onRemove}
          disabled={disabled || !canRemove}
          aria-label="Remove recipient"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-30"
        >
          <X size={15} />
        </button>
      </div>

      {/* Row status line */}
      <div className="mt-1 min-h-[1rem] px-1 text-xs">
        {row.status === "resolved" && (
          <span className="text-ink/55">
            {row.displayName ? `${row.displayName} · ` : ""}
            {row.username ? `@${row.username} · ` : ""}
            <span className="font-mono text-ink/70">
              {row.walletAddress ? shortenAddress(row.walletAddress) : ""}
            </span>
            {!showAmount && deposit > 0n && (
              <span className="text-ink/45"> · ${formatUsdc(deposit)}</span>
            )}
            {duplicateOf !== null && (
              <span className="text-amber-600 dark:text-amber-500"> · duplicate of #{duplicateOf + 1}</span>
            )}
          </span>
        )}
        {(row.status === "not_found" || row.status === "invalid") && !empty && (
          <span className="text-red-500">{row.error ?? "could not resolve"}</span>
        )}
      </div>
    </div>
  );
}
