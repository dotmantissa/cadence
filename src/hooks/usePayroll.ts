"use client";

import { useMemo, useRef, useState } from "react";
import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useConfig } from "wagmi";
import { waitForSuccessfulReceipt } from "@/lib/tx";
import { keepPreviousData } from "@tanstack/react-query";
import {
  PAYROLL_ABI,
  PAYROLL_ADDRESS,
  PAYROLL_ADDRESSES,
  LEGACY_PAYROLL_ADDRESS,
  USDC_ADDRESS,
  ERC20_ABI,
} from "@/lib/contracts";

export interface PayrollRef {
  id: bigint;
  payrollAddress: `0x${string}`;
}

export function payrollRefKey(ref: Pick<PayrollRef, "id" | "payrollAddress">): string {
  return `${ref.payrollAddress.toLowerCase()}:${ref.id.toString()}`;
}

/**
 * Arc mandates `maxFeePerGas >= 20 Gwei` (its minimum base fee) or a transaction
 * "may remain pending indefinitely or fail outright" (docs.arc.io/arc/references/gas-and-fees).
 * The Privy embedded-wallet signer forwards fee fields verbatim without applying
 * Arc-aware estimation, so a write with no fees set slips below the floor and the
 * RPC rejects it ("HTTP Request Failed"). We pin EIP-1559 fees on every write;
 * the effective cost is still base+tip (~$0.01) since maxFeePerGas is only a cap.
 * Injected wallets accept these as editable defaults, so it's a no-op for them.
 */
const ARC_FEE = {
  maxFeePerGas: 50_000_000_000n, // 50 Gwei — 2.5x the 20 Gwei floor for headroom
  maxPriorityFeePerGas: 2_000_000_000n, // 2 Gwei tip to nudge inclusion
} as const;

/**
 * Static gas limits per write, so an external wallet pops its confirm prompt
 * instantly instead of stalling on a gas estimate first.
 *
 * Why static, not estimated: an injected wallet handed a tx with NO gas field
 * runs its own eth_estimateGas against its configured Arc RPC before it can
 * render the prompt — that round-trip is the popup lag. Supplying `gas` up front
 * makes the wallet skip it and prompt at once. We used to compute the limit with
 * a live estimate first, but that only moved the same round-trip onto our own
 * RPC (up to 1s, serial, before the wallet ever saw the tx) and, on timeout, fell
 * back to no gas so the wallet estimated anyway — the worst of both. A static
 * limit removes the pre-flight entirely.
 *
 * Safety: gas is refunded — the sender pays gasUsed × price, never the limit — so
 * overshooting costs nothing. Each limit is ~2.5-3x the measured max from the
 * Foundry gas report (`forge test --gas-report`). The only chain-dependent cost
 * is Arc's USDC precompile; as a system stablecoin it's at least as cheap as the
 * mock the report used, so the headroom holds on-chain. A wallet still shows the
 * limit as "max cost" and the user can edit it.
 */
const GAS_LIMITS = {
  withdraw: 200_000n,
  topUp: 200_000n,
  cancelStream: 300_000n,
  requestCancellation: 300_000n,
  appealCancellation: 250_000n,
  finalizeCancellation: 200_000n,
  createStream: 600_000n,
  approve: 120_000n,
  requestStream: 400_000n,
  acceptRequest: 650_000n,
  counterRequest: 300_000n,
  acceptCounter: 550_000n,
  rejectCounter: 150_000n,
  reclaimExpiredCounter: 150_000n,
  rejectRequest: 150_000n,
  cancelRequest: 150_000n,
} as const;

/**
 * createStreams gas scales with recipient count: a fixed base (covers the single
 * USDC transferFrom of the batch total) plus a generous per-stream marginal (each
 * extra stream only writes its own struct). Kept well above the ~170k/stream the
 * gas report shows so a large batch never runs short.
 */
function batchCreateGasLimit(count: number): bigint {
  return 150_000n + 300_000n * BigInt(Math.max(1, count));
}


/** Decoded shape of a `streams(id)` tuple, keyed for readability. */
export interface StreamMeta {
  id: bigint;
  payrollAddress: `0x${string}`;
  employer: `0x${string}`;
  employee: `0x${string}`;
  ratePerSecond: bigint;
  startTime: bigint;
  lastClaimTime: bigint;
  /** Remaining escrow balance — shrinks on withdraw, grows on top-up, 0 on cancel. */
  deposit: bigint;
  /** STATIC original commitment: first deposit + all top-ups. Never shrinks on a claim. */
  totalDeposited: bigint;
  /** Cumulative USDC paid out to the payee (monotonic). */
  withdrawn: bigint;
  active: boolean;
  invoiceRef: string;
  deliverables: string;
}

export interface CancellationMeta {
  caseId: `0x${string}`;
  nonce: bigint;
  requestedAt: bigint;
  appealDeadline: bigint;
  adjudicationDeadline: bigint;
  escrowedRefund: bigint;
  /** PayrollManager.CancellationStatus numeric value. */
  status: number;
  evidenceHash: `0x${string}`;
  verdictHash: `0x${string}`;
  reason: string;
  evidenceUri: string;
  bantDeadline: bigint;
}

/**
 * Fetch the full struct for many streams in one batched multicall, so a page
 * can filter/search across them without each card fetching independently.
 *
 * Resilience: the contracts array is memoized on a stable id key so the query
 * key doesn't churn every render; previous data is kept across refetches; and a
 * per-id cache retains the last good decode, so a transient RPC failure on one
 * sub-call of a poll never blanks that card (which caused cards to flicker in
 * and out every refetch tick).
 */
export function useStreamsMeta(ids: readonly PayrollRef[] | undefined) {
  const idKey = (ids ?? []).map((i) => payrollRefKey(i)).join(",");

  const contracts = useMemo(
    () =>
      (ids ?? []).map((id) => ({
        address: id.payrollAddress,
        abi: PAYROLL_ABI,
        functionName: "streams" as const,
        args: [id.id] as const,
      })),
    // idKey captures the actual ids; ids identity churns on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idKey]
  );

  const query = useReadContracts({
    contracts,
    query: {
      enabled: !!ids && ids.length > 0,
      refetchInterval: 5000,
      placeholderData: keepPreviousData,
    },
  });

  // Last good decode per stream id, so a card never vanishes on a flaky poll.
  const cache = useRef(new Map<string, StreamMeta>());

  const streams = useMemo<StreamMeta[]>(() => {
    const list = ids ?? [];
    const data = query.data ?? [];
    return list
      .map((id, i) => {
        const key = payrollRefKey(id);
        const res = data[i];
        if (res && res.status === "success" && res.result) {
          const [employer, employee, ratePerSecond, startTime, lastClaimTime, deposit, totalDeposited, withdrawn, active, invoiceRef] =
            res.result as unknown as [
              `0x${string}`,
              `0x${string}`,
              bigint,
              bigint,
              bigint,
              bigint,
              bigint,
              bigint,
              boolean,
              string
            ];
          const meta: StreamMeta = {
            id: id.id,
            payrollAddress: id.payrollAddress,
            employer,
            employee,
            ratePerSecond,
            startTime,
            lastClaimTime,
            deposit,
            totalDeposited,
            withdrawn,
            active,
            invoiceRef,
            deliverables: "",
          };
          cache.current.set(key, meta);
          return meta;
        }
        // Fresh read missing/failed this tick — fall back to last good decode.
        return cache.current.get(key) ?? null;
      })
      .filter((s): s is StreamMeta => s !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, idKey]);

  return { streams, isLoading: query.isLoading, refetch: query.refetch };
}

/** Read the immutable deliverables text for a stream list in one multicall. */
export function useDeliverablesMeta(ids: readonly PayrollRef[] | undefined) {
  const idKey = (ids ?? []).map((i) => payrollRefKey(i)).join(",");
  const activeIds = (ids ?? []).filter(
    (id) => id.payrollAddress.toLowerCase() === PAYROLL_ADDRESS.toLowerCase()
  );
  const contracts = useMemo(
    () =>
      activeIds.map((id) => ({
        address: id.payrollAddress,
        abi: PAYROLL_ABI,
        functionName: "deliverables" as const,
        args: [id.id] as const,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idKey]
  );
  const query = useReadContracts({
    contracts,
    query: {
      enabled: !!ids && ids.length > 0,
      refetchInterval: 15_000,
      placeholderData: keepPreviousData,
    },
  });
  const cache = useRef(new Map<string, string>());
  const deliverables = useMemo<Record<string, string>>(() => {
    const list = ids ?? [];
    const data = query.data ?? [];
    return list.reduce<Record<string, string>>((out, id) => {
      const activeIndex = activeIds.findIndex((activeId) => payrollRefKey(activeId) === payrollRefKey(id));
      const result = activeIndex >= 0 ? data[activeIndex] : undefined;
      if (result?.status === "success" && typeof result.result === "string") {
        cache.current.set(payrollRefKey(id), result.result);
      }
      out[payrollRefKey(id)] = cache.current.get(payrollRefKey(id)) ?? "";
      return out;
    }, {});
  }, [query.data, idKey, activeIds]);
  return { deliverables, isLoading: query.isLoading, refetch: query.refetch };
}

/** Read the latest cancellation record alongside a wallet's stream list. */
export function useCancellationsMeta(ids: readonly PayrollRef[] | undefined) {
  const idKey = (ids ?? []).map((i) => payrollRefKey(i)).join(",");
  const activeIds = (ids ?? []).filter(
    (id) => id.payrollAddress.toLowerCase() === PAYROLL_ADDRESS.toLowerCase()
  );
  const contracts = useMemo(
    () =>
      activeIds.flatMap((ref) => [
        {
          address: ref.payrollAddress,
          abi: PAYROLL_ABI,
          functionName: "cancellations" as const,
          args: [ref.id] as const,
        },
        {
          address: ref.payrollAddress,
          abi: PAYROLL_ABI,
          functionName: "cancellationCaseId" as const,
          args: [ref.id] as const,
        },
        {
          address: ref.payrollAddress,
          abi: PAYROLL_ABI,
          functionName: "bantDeadline" as const,
          args: [ref.id] as const,
        },
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idKey]
  );
  const query = useReadContracts({
    contracts,
    query: {
      enabled: !!ids && ids.length > 0,
      refetchInterval: 5000,
      placeholderData: keepPreviousData,
    },
  });
  const cache = useRef(new Map<string, CancellationMeta>());
  const cancellations = useMemo(() => {
    const list = ids ?? [];
    const data = query.data ?? [];
    return list.reduce<Record<string, CancellationMeta>>((out, ref) => {
      const activeIndex = activeIds.findIndex((activeId) => payrollRefKey(activeId) === payrollRefKey(ref));
      if (activeIndex < 0) return out;
      const result = data[activeIndex * 3];
      const caseIdResult = data[activeIndex * 3 + 1];
      const bantDeadlineResult = data[activeIndex * 3 + 2];
      if (result?.status === "success" && result.result) {
        const [
          nonce,
          requestedAt,
          appealDeadline,
          adjudicationDeadline,
          escrowedRefund,
          status,
          evidenceHash,
          verdictHash,
          reason,
          evidenceUri,
        ] = result.result as unknown as [
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          number,
          `0x${string}`,
          `0x${string}`,
          string,
          string
        ];
        const caseId =
          caseIdResult?.status === "success" && typeof caseIdResult.result === "string"
            ? caseIdResult.result
            : undefined;
        const bantDeadline =
          bantDeadlineResult?.status === "success" && typeof bantDeadlineResult.result === "bigint"
            ? bantDeadlineResult.result
            : 0n;
        const meta: CancellationMeta = {
          caseId: (caseId ?? `0x${"0".repeat(64)}`) as `0x${string}`,
          nonce,
          requestedAt,
          appealDeadline,
          adjudicationDeadline,
          escrowedRefund,
          status,
          evidenceHash,
          verdictHash,
          reason,
          evidenceUri,
          bantDeadline,
        };
        cache.current.set(payrollRefKey(ref), meta);
      }
      const cached = cache.current.get(payrollRefKey(ref));
      if (cached) out[payrollRefKey(ref)] = cached;
      return out;
    }, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, idKey, activeIds]);
  return { cancellations, isLoading: query.isLoading, refetch: query.refetch };
}

export function useEmployerStreams(employer: `0x${string}` | undefined) {
  const contracts = useMemo(
    () =>
      PAYROLL_ADDRESSES.map((payrollAddress) => ({
        address: payrollAddress,
        abi: PAYROLL_ABI,
        functionName: "getEmployerStreams" as const,
        args: employer ? [employer] as const : undefined,
      })),
    [employer]
  );
  const query = useReadContracts({
    contracts,
    query: { enabled: !!employer, refetchInterval: 5000, placeholderData: keepPreviousData },
  });
  return {
    ...query,
    data: (query.data ?? []).flatMap((result, i) =>
      result.status === "success" && Array.isArray(result.result)
        ? (result.result as bigint[]).map((id) => ({ id, payrollAddress: PAYROLL_ADDRESSES[i] }))
        : []
    ),
  };
}

export function useEmployeeStreams(employee: `0x${string}` | undefined) {
  const contracts = useMemo(
    () =>
      PAYROLL_ADDRESSES.map((payrollAddress) => ({
        address: payrollAddress,
        abi: PAYROLL_ABI,
        functionName: "getEmployeeStreams" as const,
        args: employee ? [employee] as const : undefined,
      })),
    [employee]
  );
  const query = useReadContracts({
    contracts,
    query: { enabled: !!employee, refetchInterval: 5000, placeholderData: keepPreviousData },
  });
  return {
    ...query,
    data: (query.data ?? []).flatMap((result, i) =>
      result.status === "success" && Array.isArray(result.result)
        ? (result.result as bigint[]).map((id) => ({ id, payrollAddress: PAYROLL_ADDRESSES[i] }))
        : []
    ),
  };
}

export function useUsdcBalance(address: `0x${string}` | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 3000, placeholderData: keepPreviousData },
  });
}

export function useUsdcAllowance(
  owner: `0x${string}` | undefined,
  payrollAddress: `0x${string}` = PAYROLL_ADDRESS
) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: owner ? [owner, payrollAddress] : undefined,
    query: { enabled: !!owner, refetchInterval: 5000, placeholderData: keepPreviousData },
  });
}

export function useWithdraw() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    // Async-returning so the caller can await the hash, confirm the receipt, and
    // only then fire the "you cashed out" email (never on a rejected tx).
    withdraw: async (streamId: bigint, payrollAddress: `0x${string}` = PAYROLL_ADDRESS) => {
      return writeContractAsync({ address: payrollAddress, abi: PAYROLL_ABI, functionName: "withdraw", args: [streamId], gas: GAS_LIMITS.withdraw, ...ARC_FEE });
    },
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  };
}

export function useTopUp() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    // Async-returning so the caller can await the hash, confirm the receipt, read
    // the (possibly raised) new rate back, and then fire the top-up email.
    topUp: async (streamId: bigint, amount: bigint, payrollAddress: `0x${string}` = PAYROLL_ADDRESS) => {
      return writeContractAsync({ address: payrollAddress, abi: PAYROLL_ABI, functionName: "topUp", args: [streamId, amount], gas: GAS_LIMITS.topUp, ...ARC_FEE });
    },
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  };
}

export function useCancelStream() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    // Async so the caller can freeze the card the instant the tx is submitted
    // and refetch once it confirms, instead of the stream ticking on until the
    // next background poll happens to catch the state change.
    cancel: async (streamId: bigint, reason: string, payrollAddress: `0x${string}` = PAYROLL_ADDRESS) => {
      const isLegacy = payrollAddress.toLowerCase() === LEGACY_PAYROLL_ADDRESS.toLowerCase();
      return writeContractAsync({
        address: payrollAddress,
        abi: PAYROLL_ABI,
        functionName: isLegacy ? "cancelStream" : "requestCancellation",
        args: isLegacy ? [streamId] : [streamId, reason],
        gas: isLegacy ? GAS_LIMITS.cancelStream : GAS_LIMITS.requestCancellation,
        ...ARC_FEE,
      });
    },
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  };
}

export function useAppealCancellation() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  return {
    appeal: async (
      streamId: bigint,
      evidenceUri: string,
      evidenceHash: `0x${string}`,
      payrollAddress: `0x${string}` = PAYROLL_ADDRESS
    ) =>
      writeContractAsync({
        address: payrollAddress,
        abi: PAYROLL_ABI,
        functionName: "appealCancellation",
        args: [streamId, evidenceUri, evidenceHash],
        gas: GAS_LIMITS.appealCancellation,
        ...ARC_FEE,
      }),
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  };
}

export function useFinalizeCancellation() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const finalizeUnappealed = (streamId: bigint, payrollAddress: `0x${string}` = PAYROLL_ADDRESS) =>
    writeContractAsync({
      address: payrollAddress,
      abi: PAYROLL_ABI,
      functionName: "finalizeUnappealedCancellation",
      args: [streamId],
      gas: GAS_LIMITS.finalizeCancellation,
      ...ARC_FEE,
    });
  const finalizeTimedOut = (streamId: bigint, payrollAddress: `0x${string}` = PAYROLL_ADDRESS) =>
    writeContractAsync({
      address: payrollAddress,
      abi: PAYROLL_ABI,
      functionName: "finalizeTimedOutAppeal",
      args: [streamId],
      gas: GAS_LIMITS.finalizeCancellation,
      ...ARC_FEE,
    });
  return { finalizeUnappealed, finalizeTimedOut, isPending, isConfirming, isSuccess, error, hash };
}

export function useCreateStream() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    createStream: async (
      employee: `0x${string}`,
      ratePerSecond: bigint,
      deposit: bigint,
      invoiceRef: string,
      startAt: bigint = 0n,
      deliverables = ""
    ) => {
      if (deliverables.trim()) {
        return writeContractAsync({
          address: PAYROLL_ADDRESS,
          abi: PAYROLL_ABI,
          functionName: "createStreamWithDeliverables",
          args: [employee, ratePerSecond, deposit, invoiceRef, deliverables.trim(), startAt],
          gas: GAS_LIMITS.createStream,
          ...ARC_FEE,
        });
      }
      return writeContractAsync({
        address: PAYROLL_ADDRESS,
        abi: PAYROLL_ABI,
        functionName: "createStream",
        args: [employee, ratePerSecond, deposit, invoiceRef, startAt],
        gas: GAS_LIMITS.createStream,
        ...ARC_FEE,
      });
    },
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  };
}

export function useApproveUsdc() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    approve: async (amount: bigint, payrollAddress: `0x${string}` = PAYROLL_ADDRESS) => {
      return writeContractAsync({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [payrollAddress, amount],
        gas: GAS_LIMITS.approve,
        ...ARC_FEE,
      });
    },
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  };
}

// ---- Batch streaming -----------------------------------------------------------

export interface BatchStreamParams {
  employee: `0x${string}`;
  ratePerSecond: bigint;
  deposit: bigint;
  invoiceRef: string;
  startAt: bigint;
  deliverables?: string;
}

export type BatchStreamProgress = "idle" | "pending" | "success" | "error";

/**
 * Batch-create many streams in a SINGLE createStreams transaction after one
 * USDC approval of the total — the payer signs twice total (approve, then the
 * batch), no matter how many recipients. The contract loops internally, so the
 * payer stays msg.sender (and thus employer) for every stream; a generic
 * multicall can't do this because it would become the caller itself.
 *
 * Because the batch is one atomic tx, it either opens every stream or none —
 * there's no partial-success state to reconcile. Progress is still exposed as a
 * per-recipient array (all flip together) so the existing batch UI is unchanged.
 */
export function useBatchCreateStreams() {
  const config = useConfig();
  const { writeContractAsync } = useWriteContract();
  const [progress, setProgress] = useState<BatchStreamProgress[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const batchCreate = async (total: bigint, streams: BatchStreamParams[]) => {
    if (streams.length === 0) return { ok: false as const, error: "no streams to create" };
    setProgress(streams.map(() => "idle"));
    setRunning(true);
    setError(null);

    try {
      // 1. Approve the full total once.
      setProgress((prev) => prev.map(() => "pending"));
      const approveHash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [PAYROLL_ADDRESS, total],
        gas: GAS_LIMITS.approve,
        ...ARC_FEE,
      });
      await waitForSuccessfulReceipt(config, approveHash);

      // 2. Open every stream in ONE transaction. All streams in a batch share
      //    the same start time (set together in the modal), so we read it off
      //    the first row.
      const employees = streams.map((s) => s.employee);
      const rates = streams.map((s) => s.ratePerSecond);
      const deposits = streams.map((s) => s.deposit);
      const refs = streams.map((s) => s.invoiceRef);
      const deliverables = streams.map((s) => s.deliverables ?? "");
      const startAt = streams[0].startAt;

      const hash = await writeContractAsync({
        address: PAYROLL_ADDRESS,
        abi: PAYROLL_ABI,
        functionName: deliverables.some((value) => value.trim())
          ? "createStreamsWithDeliverables"
          : "createStreams",
        args: deliverables.some((value) => value.trim())
          ? [employees, rates, deposits, refs, deliverables, startAt]
          : [employees, rates, deposits, refs, startAt],
        gas: batchCreateGasLimit(streams.length),
        ...ARC_FEE,
      });
      await waitForSuccessfulReceipt(config, hash);

      setProgress((prev) => prev.map(() => "success"));
      setRunning(false);
      return { ok: true as const, succeeded: streams.map((_, i) => i) };
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string };
      const msg = e?.shortMessage ?? e?.message ?? "batch failed";
      // Atomic tx: if it reverts, nothing was created.
      setProgress((prev) => prev.map(() => "error"));
      setError(msg);
      setRunning(false);
      return { ok: false as const, error: msg, succeeded: [] as number[] };
    }
  };

  const reset = () => {
    setProgress([]);
    setRunning(false);
    setError(null);
  };

  return { batchCreate, progress, running, error, reset };
}

// ---- Stream requests + negotiation -----------------------------------------

/** On-chain request lifecycle status. Order matches the Solidity enum. */
export const ReqStatus = {
  Pending: 0,
  Countered: 1,
  Accepted: 2,
  Rejected: 3,
  Cancelled: 4,
  Expired: 5,
} as const;
export type ReqStatusValue = (typeof ReqStatus)[keyof typeof ReqStatus];

/** Decoded shape of a `requests(id)` tuple, keyed for readability. */
export interface RequestMeta {
  id: bigint;
  payrollAddress: `0x${string}`;
  payee: `0x${string}`;
  payer: `0x${string}`;
  ratePerSecond: bigint;
  deposit: bigint;
  startAt: bigint;
  counterDeadline: bigint;
  status: ReqStatusValue;
  invoiceRef: string;
  streamId: bigint;
}

/**
 * Batched multicall for many requests at once, mirroring {@link useStreamsMeta}:
 * stable query key, kept previous data, and a per-id last-good cache so a flaky
 * poll never blanks a request card.
 */
export function useRequestsMeta(ids: readonly PayrollRef[] | undefined) {
  const idKey = (ids ?? []).map((i) => payrollRefKey(i)).join(",");

  const contracts = useMemo(
    () =>
      (ids ?? []).map((ref) => ({
        address: ref.payrollAddress,
        abi: PAYROLL_ABI,
        functionName: "requests" as const,
        args: [ref.id] as const,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idKey]
  );

  const query = useReadContracts({
    contracts,
    query: {
      enabled: !!ids && ids.length > 0,
      refetchInterval: 5000,
      placeholderData: keepPreviousData,
    },
  });

  const cache = useRef(new Map<string, RequestMeta>());

  const requests = useMemo<RequestMeta[]>(() => {
    const list = ids ?? [];
    const data = query.data ?? [];
    return list
      .map((ref, i) => {
        const key = payrollRefKey(ref);
        const res = data[i];
        if (res && res.status === "success" && res.result) {
          const [payee, payer, ratePerSecond, deposit, startAt, counterDeadline, status, invoiceRef, streamId] =
            res.result as unknown as [
              `0x${string}`,
              `0x${string}`,
              bigint,
              bigint,
              bigint,
              bigint,
              number,
              string,
              bigint
            ];
          const meta: RequestMeta = {
            id: ref.id,
            payrollAddress: ref.payrollAddress,
            payee,
            payer,
            ratePerSecond,
            deposit,
            startAt,
            counterDeadline,
            status: status as ReqStatusValue,
            invoiceRef,
            streamId,
          };
          cache.current.set(key, meta);
          return meta;
        }
        return cache.current.get(key) ?? null;
      })
      .filter((r): r is RequestMeta => r !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, idKey]);

  return { requests, isLoading: query.isLoading, refetch: query.refetch };
}

/** Request IDs addressed to a payer (incoming, to accept/counter/reject). */
export function usePayerRequests(payer: `0x${string}` | undefined) {
  const contracts = useMemo(
    () =>
      PAYROLL_ADDRESSES.map((payrollAddress) => ({
        address: payrollAddress,
        abi: PAYROLL_ABI,
        functionName: "getPayerRequests" as const,
        args: payer ? [payer] as const : undefined,
      })),
    [payer]
  );
  const query = useReadContracts({
    contracts,
    query: { enabled: !!payer, refetchInterval: 5000, placeholderData: keepPreviousData },
  });
  return {
    ...query,
    data: (query.data ?? []).flatMap((result, i) =>
      result.status === "success" && Array.isArray(result.result)
        ? (result.result as bigint[]).map((id) => ({ id, payrollAddress: PAYROLL_ADDRESSES[i] }))
        : []
    ),
  };
}

/** Request IDs a payee created (outgoing, to cancel / await response). */
export function usePayeeRequests(payee: `0x${string}` | undefined) {
  const contracts = useMemo(
    () =>
      PAYROLL_ADDRESSES.map((payrollAddress) => ({
        address: payrollAddress,
        abi: PAYROLL_ABI,
        functionName: "getPayeeRequests" as const,
        args: payee ? [payee] as const : undefined,
      })),
    [payee]
  );
  const query = useReadContracts({
    contracts,
    query: { enabled: !!payee, refetchInterval: 5000, placeholderData: keepPreviousData },
  });
  return {
    ...query,
    data: (query.data ?? []).flatMap((result, i) =>
      result.status === "success" && Array.isArray(result.result)
        ? (result.result as bigint[]).map((id) => ({ id, payrollAddress: PAYROLL_ADDRESSES[i] }))
        : []
    ),
  };
}

/**
 * All request/negotiation write actions in one hook, sharing a single tx state.
 * A given request card only drives one action at a time, so shared
 * pending/confirming is fine and keeps the surface small. All are async so the
 * caller can chain a USDC approval first where the action moves funds
 * (`acceptRequest` funds the stream; `counterRequest` escrows the new deposit).
 */
export function useRequestActions() {
  const { writeContractAsync, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const call = async (
    functionName: string,
    args: readonly unknown[],
    payrollAddress: `0x${string}` = PAYROLL_ADDRESS
  ) => {
    const gas = GAS_LIMITS[functionName as keyof typeof GAS_LIMITS];
    return writeContractAsync({
      address: payrollAddress,
      abi: PAYROLL_ABI,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      functionName: functionName as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args: args as any,
      gas,
      ...ARC_FEE,
    });
  };

  return {
    /** Payee opens a request asking `payer` to fund a stream. No funds move. */
    requestStream: (
      payer: `0x${string}`,
      ratePerSecond: bigint,
      deposit: bigint,
      invoiceRef: string,
      startAt: bigint = 0n,
      payrollAddress: `0x${string}` = PAYROLL_ADDRESS
    ) => call("requestStream", [payer, ratePerSecond, deposit, invoiceRef, startAt], payrollAddress),
    /** Payer accepts a pending request as-is (requires prior USDC approval). */
    acceptRequest: (requestId: bigint, payrollAddress: `0x${string}` = PAYROLL_ADDRESS) =>
      call("acceptRequest", [requestId], payrollAddress),
    /** Payer counters with new terms, escrowing the new deposit (needs approval). */
    counterRequest: (
      requestId: bigint,
      newRate: bigint,
      newDeposit: bigint,
      newStartAt: bigint = 0n,
      payrollAddress: `0x${string}` = PAYROLL_ADDRESS
    ) => call("counterRequest", [requestId, newRate, newDeposit, newStartAt], payrollAddress),
    /** Payee accepts the payer's counter — starts the stream instantly. */
    acceptCounter: (requestId: bigint, payrollAddress: `0x${string}` = PAYROLL_ADDRESS) =>
      call("acceptCounter", [requestId], payrollAddress),
    /** Payee rejects the counter; escrow refunds to the payer. */
    rejectCounter: (requestId: bigint, payrollAddress: `0x${string}` = PAYROLL_ADDRESS) =>
      call("rejectCounter", [requestId], payrollAddress),
    /** Anyone settles an expired counter, refunding the payer's escrow. */
    reclaimExpiredCounter: (requestId: bigint, payrollAddress: `0x${string}` = PAYROLL_ADDRESS) =>
      call("reclaimExpiredCounter", [requestId], payrollAddress),
    /** Payer declines a pending request. No funds were moved. */
    rejectRequest: (requestId: bigint, payrollAddress: `0x${string}` = PAYROLL_ADDRESS) =>
      call("rejectRequest", [requestId], payrollAddress),
    /** Payee cancels their own pending request. */
    cancelRequest: (requestId: bigint, payrollAddress: `0x${string}` = PAYROLL_ADDRESS) =>
      call("cancelRequest", [requestId], payrollAddress),
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
    reset,
  };
}
