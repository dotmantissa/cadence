"use client";

import { useMemo, useRef } from "react";
import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { keepPreviousData } from "@tanstack/react-query";
import { PAYROLL_ADDRESS, PAYROLL_ABI, USDC_ADDRESS, ERC20_ABI } from "@/lib/contracts";

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

export function useStream(streamId: bigint | undefined) {
  return useReadContract({
    address: PAYROLL_ADDRESS,
    abi: PAYROLL_ABI,
    functionName: "streams",
    args: streamId !== undefined ? [streamId] : undefined,
    query: { enabled: streamId !== undefined, refetchInterval: 2000 },
  });
}

export function useAccrued(streamId: bigint | undefined) {
  return useReadContract({
    address: PAYROLL_ADDRESS,
    abi: PAYROLL_ABI,
    functionName: "accrued",
    args: streamId !== undefined ? [streamId] : undefined,
    query: { enabled: streamId !== undefined, refetchInterval: 1000 },
  });
}

export function useRunway(streamId: bigint | undefined) {
  return useReadContract({
    address: PAYROLL_ADDRESS,
    abi: PAYROLL_ABI,
    functionName: "runway",
    args: streamId !== undefined ? [streamId] : undefined,
    query: { enabled: streamId !== undefined, refetchInterval: 5000 },
  });
}

export function useEmployerStreams(employer: `0x${string}` | undefined) {
  return useReadContract({
    address: PAYROLL_ADDRESS,
    abi: PAYROLL_ABI,
    functionName: "getEmployerStreams",
    args: employer ? [employer] : undefined,
    query: { enabled: !!employer, refetchInterval: 5000 },
  });
}

export function useEmployeeStreams(employee: `0x${string}` | undefined) {
  return useReadContract({
    address: PAYROLL_ADDRESS,
    abi: PAYROLL_ABI,
    functionName: "getEmployeeStreams",
    args: employee ? [employee] : undefined,
    query: { enabled: !!employee, refetchInterval: 5000 },
  });
}

export function useUsdcBalance(address: `0x${string}` | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 3000 },
  });
}

export function useUsdcAllowance(owner: `0x${string}` | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: owner ? [owner, PAYROLL_ADDRESS] : undefined,
    query: { enabled: !!owner, refetchInterval: 5000 },
  });
}

export function useWithdraw() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    withdraw: (streamId: bigint) =>
      writeContract({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "withdraw", args: [streamId] }),
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
      writeContract({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "topUp", args: [streamId, amount] }),
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
      writeContract({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "cancelStream", args: [streamId] }),
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
    createStream: (employee: `0x${string}`, ratePerSecond: bigint, deposit: bigint, invoiceRef: string) =>
      writeContractAsync({
        address: PAYROLL_ADDRESS,
        abi: PAYROLL_ABI,
        functionName: "createStream",
        args: [employee, ratePerSecond, deposit, invoiceRef],
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
      }),
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
  };
}
