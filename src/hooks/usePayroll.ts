"use client";

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { PAYROLL_ADDRESS, PAYROLL_ABI, USDC_ADDRESS, ERC20_ABI } from "@/lib/contracts";

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
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    createStream: (employee: `0x${string}`, ratePerSecond: bigint, deposit: bigint, invoiceRef: string) =>
      writeContract({
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
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    approve: (amount: bigint) =>
      writeContract({
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
