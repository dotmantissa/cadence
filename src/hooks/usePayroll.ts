"use client";

import { useMemo, useRef, useState } from "react";
import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useConfig, usePublicClient, useAccount } from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
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

/**
 * Type of the wagmi public client, so the estimator helper can accept it without
 * pulling viem's client generics into every call site.
 */
type PublicClient = ReturnType<typeof usePublicClient>;

/**
 * Resolve a dynamic gas *limit* for a write so external wallets can skip their own
 * `eth_estimateGas` round-trip and pop the confirm prompt immediately.
 *
 * Why this exists: with an injected wallet (MetaMask/Coinbase), wagmi hands the tx
 * to the wallet, which then estimates gas against ITS OWN configured Arc RPC before
 * showing the prompt. That endpoint is outside our control and is usually what makes
 * the popup lag. When we supply an explicit `gas`, the wallet uses it as-is and skips
 * that estimate — the prompt appears at once (the user can still edit it).
 *
 * The limit is always a LIVE on-chain estimate (never a baked-in constant), run over
 * our reliable same-origin `/api/rpc` path with a 20% safety buffer. If the estimate
 * fails (e.g. a create/top-up whose USDC approval isn't mined yet, so `transferFrom`
 * would revert during estimation) or is slower than 1s, we return no `gas` at all and
 * the wallet falls back to estimating exactly as it does today — no regression, and
 * no hardcoded fallback number anywhere.
 */
async function dynamicGas(
  client: PublicClient,
  account: `0x${string}` | undefined,
  params: {
    address: `0x${string}`;
    abi: typeof PAYROLL_ABI | typeof ERC20_ABI;
    functionName: string;
    args: readonly unknown[];
  }
): Promise<{ gas?: bigint }> {
  if (!client || !account) return {};
  try {
    const estimate = client.estimateContractGas({
      address: params.address,
      // viem's estimateContractGas is heavily overloaded; the abi/functionName/args
      // are validated at the call sites that build them, so we widen here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      abi: params.abi as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      functionName: params.functionName as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args: params.args as any,
      account,
    });
    // Never let a slow estimate become the delay we're trying to remove: if it
    // doesn't resolve within 1s, drop it and let the wallet estimate instead.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("gas-estimate-timeout")), 1000)
    );
    const gas = (await Promise.race([estimate, timeout])) as bigint;
    // 20% headroom over the point estimate to absorb block-to-block variance.
    return { gas: (gas * 120n) / 100n };
  } catch {
    // Estimate reverted or timed out — omit gas so the wallet estimates as before.
    return {};
  }
}


/** Decoded shape of a `streams(id)` tuple, keyed for readability. */
export interface StreamMeta {
  id: bigint;
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
            id,
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
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const publicClient = usePublicClient();
  const { address } = useAccount();

  return {
    // Async-returning so the caller can await the hash, confirm the receipt, and
    // only then fire the "you cashed out" email (never on a rejected tx).
    withdraw: async (streamId: bigint) => {
      const gas = await dynamicGas(publicClient, address, {
        address: PAYROLL_ADDRESS,
        abi: PAYROLL_ABI,
        functionName: "withdraw",
        args: [streamId],
      });
      return writeContractAsync({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "withdraw", args: [streamId], ...gas, ...ARC_FEE });
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
  const publicClient = usePublicClient();
  const { address } = useAccount();

  return {
    // Async-returning so the caller can await the hash, confirm the receipt, read
    // the (possibly raised) new rate back, and then fire the top-up email.
    topUp: async (streamId: bigint, amount: bigint) => {
      const gas = await dynamicGas(publicClient, address, {
        address: PAYROLL_ADDRESS,
        abi: PAYROLL_ABI,
        functionName: "topUp",
        args: [streamId, amount],
      });
      return writeContractAsync({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "topUp", args: [streamId, amount], ...gas, ...ARC_FEE });
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
  const publicClient = usePublicClient();
  const { address } = useAccount();

  return {
    // Async so the caller can freeze the card the instant the tx is submitted
    // and refetch once it confirms, instead of the stream ticking on until the
    // next background poll happens to catch the state change.
    cancel: async (streamId: bigint) => {
      const gas = await dynamicGas(publicClient, address, {
        address: PAYROLL_ADDRESS,
        abi: PAYROLL_ABI,
        functionName: "cancelStream",
        args: [streamId],
      });
      return writeContractAsync({ address: PAYROLL_ADDRESS, abi: PAYROLL_ABI, functionName: "cancelStream", args: [streamId], ...gas, ...ARC_FEE });
    },
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
  const publicClient = usePublicClient();
  const { address } = useAccount();

  return {
    createStream: async (
      employee: `0x${string}`,
      ratePerSecond: bigint,
      deposit: bigint,
      invoiceRef: string,
      startAt: bigint = 0n
    ) => {
      const args = [employee, ratePerSecond, deposit, invoiceRef, startAt] as const;
      const gas = await dynamicGas(publicClient, address, {
        address: PAYROLL_ADDRESS,
        abi: PAYROLL_ABI,
        functionName: "createStream",
        args,
      });
      return writeContractAsync({
        address: PAYROLL_ADDRESS,
        abi: PAYROLL_ABI,
        functionName: "createStream",
        args,
        ...gas,
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
  const publicClient = usePublicClient();
  const { address } = useAccount();

  return {
    approve: async (amount: bigint) => {
      const gas = await dynamicGas(publicClient, address, {
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [PAYROLL_ADDRESS, amount],
      });
      return writeContractAsync({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [PAYROLL_ADDRESS, amount],
        ...gas,
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
  const publicClient = usePublicClient();
  const { address } = useAccount();
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
      const approveGas = await dynamicGas(publicClient, address, {
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [PAYROLL_ADDRESS, total],
      });
      const approveHash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [PAYROLL_ADDRESS, total],
        ...approveGas,
        ...ARC_FEE,
      });
      await waitForTransactionReceipt(config, { hash: approveHash });

      // 2. Open every stream in ONE transaction. All streams in a batch share
      //    the same start time (set together in the modal), so we read it off
      //    the first row.
      const employees = streams.map((s) => s.employee);
      const rates = streams.map((s) => s.ratePerSecond);
      const deposits = streams.map((s) => s.deposit);
      const refs = streams.map((s) => s.invoiceRef);
      const startAt = streams[0].startAt;

      // The approval above is already mined, so estimating the batch here works
      // cleanly (transferFrom of the total won't revert during estimation).
      const createGas = await dynamicGas(publicClient, address, {
        address: PAYROLL_ADDRESS,
        abi: PAYROLL_ABI,
        functionName: "createStreams",
        args: [employees, rates, deposits, refs, startAt],
      });
      const hash = await writeContractAsync({
        address: PAYROLL_ADDRESS,
        abi: PAYROLL_ABI,
        functionName: "createStreams",
        args: [employees, rates, deposits, refs, startAt],
        ...createGas,
        ...ARC_FEE,
      });
      await waitForTransactionReceipt(config, { hash });

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
  const publicClient = usePublicClient();
  const { address } = useAccount();

  const call = async (functionName: string, args: readonly unknown[]) => {
    const gas = await dynamicGas(publicClient, address, {
      address: PAYROLL_ADDRESS,
      abi: PAYROLL_ABI,
      functionName,
      args,
    });
    return writeContractAsync({
      address: PAYROLL_ADDRESS,
      abi: PAYROLL_ABI,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      functionName: functionName as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args: args as any,
      ...gas,
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
