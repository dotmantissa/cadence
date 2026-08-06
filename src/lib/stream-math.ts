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
 * The cumulative figure combines the on-chain cumulative `withdrawn` (which the
 * contract now tracks directly and never resets) with the currently-claimable
 * amount:
 *   withdrawn      = on-chain cumulative paid out (monotonic, survives cancel)
 *   unclaimed      = active ? min(deposit, rate * (now - lastClaimTime)) : 0
 *   streamedSoFar  = withdrawn + unclaimed                    // never resets
 *   committed      = totalDeposited (STATIC original + top-ups)
 *   remaining      = committed - streamedSoFar                // the "Left" figure
 *
 * For a live stream that's never run dry, streamedSoFar == rate*(now-startTime)
 * and a withdrawal merely shifts value from the `unclaimed` term into the
 * `withdrawn` term — the sum is continuous across a cash-out.
 */
/**
 * The lifecycle stage of a stream, derived purely from the on-chain tuple.
 *
 * The contract only flips `active` to false on a withdrawal that drains the
 * deposit (`deposit < rate`) or on cancel — NOT when a stream merely runs out of
 * runway. So a stream whose deposit has been fully earned by elapsed time, but
 * whose payee hasn't taken the final chunk, is still `active` on-chain. That's
 * the "awaiting_claim" stage: money is done streaming, but the last withdrawal
 * hasn't happened. We surface it explicitly so the UI stops ticking and shows
 * "complete / awaiting claim" instead of animating past the real cap.
 */
export type StreamPhase =
  | "scheduled" // active, start still in the future
  | "live" // active, accruing, deposit not yet exhausted
  | "awaiting_claim" // active but time-exhausted; final chunk not yet withdrawn
  | "claimed" // settled: inactive after at least one withdrawal
  | "ended"; // inactive with nothing ever withdrawn (e.g. cancelled early)

export interface StreamMath {
  /** USDC (6dp) paid out to the employee to date — read straight from chain. */
  withdrawn: bigint;
  /** USDC (6dp) accrued but not yet withdrawn — what "Cash out" pays. */
  unclaimed: bigint;
  /** USDC (6dp) total ever streamed to the employee (cumulative, monotonic). */
  streamedSoFar: bigint;
  /** USDC (6dp) STATIC original commitment (first deposit + top-ups). Never shrinks on a claim. */
  committed: bigint;
  /** USDC (6dp) still to be streamed = committed − streamedSoFar (the "Left" figure). */
  remaining: bigint;
  /** Seconds of deposit left at the current rate (0 when idle). */
  runwaySeconds: number;
  /** Active on-chain but its start is still in the future. */
  notStarted: boolean;
  /** Active and already accruing (past its start). */
  flowing: boolean;
  /** True only while money is genuinely still streaming (live, runway left). */
  streaming: boolean;
  /** Lifecycle stage — the single source of truth for status labels/animation. */
  phase: StreamPhase;
}

export function streamMath(s: StreamMeta, nowSec: number = Math.floor(Date.now() / 1000)): StreamMath {
  const now = BigInt(nowSec);
  const rate = s.ratePerSecond;

  const notStarted = s.active && s.startTime > now;
  const flowing = s.active && !notStarted;

  // Paid out to date is now authoritative on-chain (the contract tracks a
  // cumulative `withdrawn` that survives cancels and drain-exact payouts), so
  // we read it directly instead of reconstructing from the claim clock.
  const withdrawn = s.withdrawn;

  // Currently claimable — capped at the remaining deposit, matching the
  // contract's `_accrued`. Zero unless the stream is actively flowing.
  let unclaimed = 0n;
  if (flowing && rate > 0n && now > s.lastClaimTime) {
    const raw = rate * (now - s.lastClaimTime);
    unclaimed = raw > s.deposit ? s.deposit : raw;
  }

  const streamedSoFar = withdrawn + unclaimed;

  // The original commitment is static (never shrinks when the payee claims);
  // "Left" is simply what of it hasn't been streamed yet. Clamp both against
  // rounding so the UI can never show a negative or an over-100% figure.
  const committed = s.totalDeposited;
  const remaining = committed > streamedSoFar ? committed - streamedSoFar : 0n;

  // Runway in seconds = escrow not yet earned, over the rate. `deposit` is the
  // remaining escrow; subtract what's already claimable to avoid double-count.
  const escrowLeft = s.deposit > unclaimed ? s.deposit - unclaimed : 0n;
  const runwaySeconds = flowing && rate > 0n ? Number(escrowLeft / rate) : 0;

  // A flowing stream is only genuinely *streaming* while it still has runway.
  // Once elapsed time has earned the whole remaining deposit (accrual capped at
  // deposit), the money has stopped moving even though the contract keeps it
  // `active` until the final withdrawal — that's "awaiting claim", not "live".
  const exhausted = flowing && rate > 0n && unclaimed >= s.deposit;
  const streaming = flowing && !exhausted;

  let phase: StreamPhase;
  if (notStarted) {
    phase = "scheduled";
  } else if (streaming) {
    phase = "live";
  } else if (flowing) {
    // active + past start + no runway left → done streaming, awaiting final claim
    phase = "awaiting_claim";
  } else if (withdrawn > 0n) {
    // inactive and the payee has withdrawn at least once → fully settled
    phase = "claimed";
  } else {
    phase = "ended";
  }

  return {
    withdrawn,
    unclaimed,
    streamedSoFar,
    committed,
    remaining,
    runwaySeconds,
    notStarted,
    flowing,
    streaming,
    phase,
  };
}
