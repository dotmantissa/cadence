"use client";

import { useMemo, useRef } from "react";
import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { keepPreviousData } from "@tanstack/react-query";
import { PAYROLL_ADDRESS, PAYROLL_ABI, USDC_ADDRESS, ERC20_ABI } from "@/lib/contracts";

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

/** Decoded shape of a `streams(id)` tuple, keyed for readability. */
export interface StreamMeta {
  id: bigint;
  employer: `0x${string}`;
  employee: `0x${string}`;
  ratePerSecond: bigint;
  startTime: bigint;
  lastClaimTime: bigint;
  deposit: bigint;
  active: boolean;
  invoiceRef: string;
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
export function useStreamsMeta(ids: readonly bigint[] | undefined) {
  const idKey = (ids ?? []).map((i) => i.toString()).join(",");

  const contracts = useMemo(
    () =>
      (ids ?? []).map((id) => ({
        address: PAYROLL_ADDRESS,
        abi: PAYROLL_ABI,
        functionName: "streams" as const,
        args: [id] as const,
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
        const key = id.toString();
        const res = data[i];
        if (res && res.status === "success" && res.result) {
          const [employer, employee, ratePerSecond, startTime, lastClaimTime, deposit, active, invoiceRef] =
            res.result as unknown as [
              `0x${string}`,
              `0x${string}`,
              bigint,
              bigint,
              bigint,
              bigint,
              boolean,
              string
            ];
          const meta: StreamMeta = {
            id,
            employer,
            employee,
            ratePerSecond,
            startTime,
            lastClaimTime,
            deposit,
            active,
            invoiceRef,
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

export function useEmployerStreams(employer: `0x${string}` | undefined) {
  return useReadContract({
    address: PAYROLL_ADDRESS,
    abi: PAYROLL_ABI,
    functionName: "getEmployerStreams",
    args: employer ? [employer] : undefined,
    query: { enabled: !!employer, refetchInterval: 5000, placeholderData: keepPreviousData },
  });
}

export function useEmployeeStreams(employee: `0x${string}` | undefined) {
  return useReadContract({
    address: PAYROLL_ADDRESS,
    abi: PAYROLL_ABI,
    functionName: "getEmployeeStreams",
    args: employee ? [employee] : undefined,
    query: { enabled: !!employee, refetchInterval: 5000, placeholderData: keepPreviousData },
  });
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

export function useUsdcAllowance(owner: `0x${string}` | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: owner ? [owner, PAYROLL_ADDRESS] : undefined,
    query: { enabled: !!owner, refetchInterval: 5000, placeholderData: keepPreviousData },
  });
}

export function useWithdraw() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    withdraw: (streamId: bigint) =>
      writeContract({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "withdraw", args: [streamId], ...ARC_FEE }),
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  };
}

export function useTopUp() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    topUp: (streamId: bigint, amount: bigint) =>
      writeContract({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "topUp", args: [streamId, amount], ...ARC_FEE }),
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  };
}

export function useCancelStream() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    cancel: (streamId: bigint) =>
      writeContract({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "cancelStream", args: [streamId], ...ARC_FEE }),
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  };
}

export function useCreateStream() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    createStream: (
      employee: `0x${string}`,
      ratePerSecond: bigint,
      deposit: bigint,
      invoiceRef: string,
      startAt: bigint = 0n
    ) =>
      writeContractAsync({
        address: PAYROLL_ADDRESS,
        abi: PAYROLL_ABI,
        functionName: "createStream",
        args: [employee, ratePerSecond, deposit, invoiceRef, startAt],
        ...ARC_FEE,
      }),
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
    approve: (amount: bigint) =>
      writeContractAsync({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [PAYROLL_ADDRESS, amount],
        ...ARC_FEE,
      }),
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  };
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
export function useRequestsMeta(ids: readonly bigint[] | undefined) {
  const idKey = (ids ?? []).map((i) => i.toString()).join(",");

  const contracts = useMemo(
    () =>
      (ids ?? []).map((id) => ({
        address: PAYROLL_ADDRESS,
        abi: PAYROLL_ABI,
        functionName: "requests" as const,
        args: [id] as const,
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
      .map((id, i) => {
        const key = id.toString();
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
            id,
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
  return useReadContract({
    address: PAYROLL_ADDRESS,
    abi: PAYROLL_ABI,
    functionName: "getPayerRequests",
    args: payer ? [payer] : undefined,
    query: { enabled: !!payer, refetchInterval: 5000, placeholderData: keepPreviousData },
  });
}

/** Request IDs a payee created (outgoing, to cancel / await response). */
export function usePayeeRequests(payee: `0x${string}` | undefined) {
  return useReadContract({
    address: PAYROLL_ADDRESS,
    abi: PAYROLL_ABI,
    functionName: "getPayeeRequests",
    args: payee ? [payee] : undefined,
    query: { enabled: !!payee, refetchInterval: 5000, placeholderData: keepPreviousData },
  });
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

  const call = (functionName: string, args: readonly unknown[]) =>
    writeContractAsync({
      address: PAYROLL_ADDRESS,
      abi: PAYROLL_ABI,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      functionName: functionName as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args: args as any,
      ...ARC_FEE,
    });

  return {
    /** Payee opens a request asking `payer` to fund a stream. No funds move. */
    requestStream: (
      payer: `0x${string}`,
      ratePerSecond: bigint,
      deposit: bigint,
      invoiceRef: string,
      startAt: bigint = 0n
    ) => call("requestStream", [payer, ratePerSecond, deposit, invoiceRef, startAt]),
    /** Payer accepts a pending request as-is (requires prior USDC approval). */
    acceptRequest: (requestId: bigint) => call("acceptRequest", [requestId]),
    /** Payer counters with new terms, escrowing the new deposit (needs approval). */
    counterRequest: (requestId: bigint, newRate: bigint, newDeposit: bigint, newStartAt: bigint = 0n) =>
      call("counterRequest", [requestId, newRate, newDeposit, newStartAt]),
    /** Payee accepts the payer's counter — starts the stream instantly. */
    acceptCounter: (requestId: bigint) => call("acceptCounter", [requestId]),
    /** Payee rejects the counter; escrow refunds to the payer. */
    rejectCounter: (requestId: bigint) => call("rejectCounter", [requestId]),
    /** Anyone settles an expired counter, refunding the payer's escrow. */
    reclaimExpiredCounter: (requestId: bigint) => call("reclaimExpiredCounter", [requestId]),
    /** Payer declines a pending request. No funds were moved. */
    rejectRequest: (requestId: bigint) => call("rejectRequest", [requestId]),
    /** Payee cancels their own pending request. */
    cancelRequest: (requestId: bigint) => call("cancelRequest", [requestId]),
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
    reset,
  };
}
