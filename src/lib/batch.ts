import { parseUsdc } from "./utils";

/**
 * Batch streaming: shared types and allocation math for opening many streams in
 * one flow. Kept pure and framework-free so the modal, the importer, and any
 * tests all agree on how a total is split and when a batch is fundable.
 *
 * All money is 6-decimal USDC (bigint units), matching the rest of the app.
 */

export type AllocationMode = "per-recipient" | "split" | "uniform";

/** Resolution state of one recipient row, mirroring the single-stream checks. */
export type RowStatus = "idle" | "resolving" | "resolved" | "not_found" | "invalid";

export interface BatchRecipient {
  /** Stable local id for React keys — never sent on-chain. */
  id: string;
  /** Raw text the payer typed or the importer read (address or @handle). */
  input: string;
  /** Per-recipient amount as a display string. Only used in per-recipient mode. */
  amount: string;
  status: RowStatus;
  walletAddress: `0x${string}` | null;
  username: string | null;
  displayName: string | null;
  error?: string;
}

export const ALLOCATION_MODES: { key: AllocationMode; label: string; hint: string }[] = [
  {
    key: "per-recipient",
    label: "Per recipient",
    hint: "Set a different amount for each recipient.",
  },
  {
    key: "split",
    label: "Split a total",
    hint: "Divide one total equally across everyone.",
  },
  {
    key: "uniform",
    label: "Same each",
    hint: "Send the same amount to every recipient.",
  },
];

let counter = 0;
/** Local-only id for a new recipient row. */
export function newRecipient(partial: Partial<BatchRecipient> = {}): BatchRecipient {
  counter += 1;
  return {
    id: `r${counter}`,
    input: "",
    amount: "",
    status: "idle",
    walletAddress: null,
    username: null,
    displayName: null,
    ...partial,
  };
}

/**
 * The deposit (6-decimal units) each row should receive under the chosen mode.
 * Returned in row order and always the same length as `rows`.
 *
 * - per-recipient: each row's own typed amount.
 * - uniform: `sharedAmount` to every row.
 * - split: `sharedAmount` divided equally, with any indivisible remainder units
 *   handed to the earliest rows so the parts sum to exactly the total (no dust
 *   left behind, never more than the total).
 */
export function computeAllocations(
  mode: AllocationMode,
  rows: BatchRecipient[],
  sharedAmount: string
): bigint[] {
  const n = rows.length;
  if (n === 0) return [];

  if (mode === "per-recipient") {
    return rows.map((r) => parseUsdc(r.amount));
  }
  if (mode === "uniform") {
    const each = parseUsdc(sharedAmount);
    return rows.map(() => each);
  }
  // split
  const total = parseUsdc(sharedAmount);
  if (total <= 0n) return rows.map(() => 0n);
  const base = total / BigInt(n);
  let remainder = total - base * BigInt(n); // 0 … n-1 units
  return rows.map(() => {
    let amt = base;
    if (remainder > 0n) {
      amt += 1n;
      remainder -= 1n;
    }
    return amt;
  });
}

/**
 * Per-second rate for a deposit streamed over `days`, matching the single-stream
 * flow exactly: floor(deposit / days / 86400). Small deposits over long windows
 * can floor to zero, which the caller treats as "too small to stream".
 */
export function depositToRate(deposit: bigint, days: number): bigint {
  if (deposit <= 0n) return 0n;
  const d = BigInt(Math.max(1, Math.floor(days)));
  return deposit / d / 86400n;
}

export interface RowPlan {
  row: BatchRecipient;
  deposit: bigint;
  ratePerSecond: bigint;
  /** Resolved, funded (deposit > 0), and streamable (rate > 0). */
  ok: boolean;
  /** Row index that this row duplicates (same wallet, earlier in the list). */
  duplicateOf: number | null;
}

export interface BatchPlan {
  rows: RowPlan[];
  /** Sum of every row's deposit. */
  total: bigint;
  /** Rows that are resolved, funded, and streamable. */
  readyCount: number;
  /** At least one row is still resolving or failed to resolve. */
  hasUnresolved: boolean;
  /** At least one resolved row has a zero/near-zero allocation. */
  hasZeroAmount: boolean;
  /** Some resolved wallet appears more than once. */
  hasDuplicates: boolean;
  insufficientBalance: boolean;
  /** Every recipient is ready and the total fits the balance. */
  canSubmit: boolean;
}

/**
 * Fold recipients, the allocation mode, the shared amount, the duration, and the
 * wallet balance into one decision object the UI can render straight from. This
 * is the single source of truth for "is this batch fundable".
 */
export function planBatch(
  mode: AllocationMode,
  rows: BatchRecipient[],
  sharedAmount: string,
  days: number,
  balance: bigint | undefined
): BatchPlan {
  const allocations = computeAllocations(mode, rows, sharedAmount);
  const seen = new Map<string, number>();

  const rowPlans: RowPlan[] = rows.map((row, i) => {
    const deposit = allocations[i] ?? 0n;
    const ratePerSecond = depositToRate(deposit, days);

    let duplicateOf: number | null = null;
    if (row.walletAddress) {
      const key = row.walletAddress.toLowerCase();
      if (seen.has(key)) duplicateOf = seen.get(key)!;
      else seen.set(key, i);
    }

    const ok =
      row.status === "resolved" &&
      !!row.walletAddress &&
      deposit > 0n &&
      ratePerSecond > 0n;

    return { row, deposit, ratePerSecond, ok, duplicateOf };
  });

  const total = allocations.reduce((sum, a) => sum + (a > 0n ? a : 0n), 0n);
  const readyCount = rowPlans.filter((p) => p.ok).length;
  const hasUnresolved = rows.some(
    (r) => r.input.trim() !== "" && (r.status === "resolving" || r.status === "idle" || r.status === "not_found" || r.status === "invalid")
  );
  const hasZeroAmount = rowPlans.some(
    (p) => p.row.status === "resolved" && (p.deposit <= 0n || p.ratePerSecond <= 0n)
  );
  const hasDuplicates = rowPlans.some((p) => p.duplicateOf !== null);
  const insufficientBalance = balance !== undefined && total > 0n && total > balance;

  const canSubmit =
    readyCount > 0 &&
    !hasUnresolved &&
    !hasZeroAmount &&
    !insufficientBalance &&
    // every non-empty row must be a ready recipient
    rowPlans.every((p) => p.row.input.trim() === "" || p.ok);

  return {
    rows: rowPlans,
    total,
    readyCount,
    hasUnresolved,
    hasZeroAmount,
    hasDuplicates,
    insufficientBalance,
    canSubmit,
  };
}
