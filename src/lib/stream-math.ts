import type { StreamMeta } from "@/hooks/usePayroll";

/**
 * Everything the UI needs about a stream's money, derived purely from the
 * decoded `streams(id)` tuple — no extra RPC reads.
 *
 * Why derive instead of calling `accrued()` / `runway()`:
 *   - `accrued(id)` returns the amount claimable *since the last withdrawal*.
 *     It resets to ~0 the moment the employee cashes out (the contract bumps
 *     `lastClaimTime`). Showing it as "streamed so far" makes a receipt read $0
 *     right after a payout — the bug users hit.
 *   - Both values are exact functions of the tuple we already batch-fetch, so a
 *     per-card `useAccrued`/`useRunway` poll is pure waterfall we can delete.
 *
 * The cumulative figure is reconstructed from the on-chain claim clock, which
 * only ever advances on a withdrawal:
 *   withdrawn      = rate * (lastClaimTime - startTime)      // paid out to date
 *   unclaimed      = active ? min(deposit, rate * (now - lastClaimTime)) : 0
 *   streamedSoFar  = withdrawn + unclaimed                    // never resets
 *
 * For a live stream that's never run dry, streamedSoFar == rate*(now-startTime)
 * and a withdrawal merely shifts value from the `unclaimed` term into the
 * `withdrawn` term — the sum is continuous across a cash-out.
 */
export interface StreamMath {
  /** USDC (6dp) paid out to the employee to date. */
  withdrawn: bigint;
  /** USDC (6dp) accrued but not yet withdrawn — what "Cash out" pays. */
  unclaimed: bigint;
  /** USDC (6dp) total ever streamed to the employee (cumulative, monotonic). */
  streamedSoFar: bigint;
  /** Seconds of deposit left at the current rate (0 when idle). */
  runwaySeconds: number;
  /** Active on-chain but its start is still in the future. */
  notStarted: boolean;
  /** Active and already accruing (past its start). */
  flowing: boolean;
}

export function streamMath(s: StreamMeta, nowSec: number = Math.floor(Date.now() / 1000)): StreamMath {
  const now = BigInt(nowSec);
  const rate = s.ratePerSecond;

  const notStarted = s.active && s.startTime > now;
  const flowing = s.active && !notStarted;

  // The claim clock only advances on a withdrawal, so the window between start
  // and lastClaimTime is exactly what has already been paid out.
  const withdrawn = s.lastClaimTime > s.startTime ? rate * (s.lastClaimTime - s.startTime) : 0n;

  // Currently claimable — capped at the remaining deposit, matching the
  // contract's `_accrued`. Zero unless the stream is actively flowing.
  let unclaimed = 0n;
  if (flowing && rate > 0n && now > s.lastClaimTime) {
    const raw = rate * (now - s.lastClaimTime);
    unclaimed = raw > s.deposit ? s.deposit : raw;
  }

  const streamedSoFar = withdrawn + unclaimed;

  const remaining = s.deposit > unclaimed ? s.deposit - unclaimed : 0n;
  const runwaySeconds = flowing && rate > 0n ? Number(remaining / rate) : 0;

  return { withdrawn, unclaimed, streamedSoFar, runwaySeconds, notStarted, flowing };
}
