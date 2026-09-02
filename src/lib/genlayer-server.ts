import "server-only";

import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import {
  ExecutionResult,
  TransactionStatus,
  type TransactionHash,
} from "genlayer-js/types";
import type { ArcStreamAppeal } from "./arc-server";

const contractAddress = process.env.GENLAYER_CONTRACT_ADDRESS as
  | `0x${string}`
  | undefined;
const privateKey = process.env.GENLAYER_PRIVATE_KEY as
  | `0x${string}`
  | undefined;

export function isGenLayerConfigured(): boolean {
  return Boolean(contractAddress && privateKey);
}

function client() {
  if (!contractAddress) {
    throw new Error("GENLAYER_CONTRACT_ADDRESS is not configured");
  }
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("GENLAYER_PRIVATE_KEY is not configured");
  }
  return createClient({
    chain: studionet,
    account: createAccount(privateKey),
  });
}

function address(): `0x${string}` {
  if (!contractAddress) {
    throw new Error("GENLAYER_CONTRACT_ADDRESS is not configured");
  }
  return contractAddress;
}

export async function fileGenLayerAppeal(
  arc: ArcStreamAppeal,
  bantUri: string,
  bantHash: `0x${string}`
) {
  const hash = await client().writeContract({
    address: address(),
    functionName: "file_appeal_with_bant",
    args: [
      arc.caseId,
      BigInt(arcTestnetChainId),
      PAYROLL_ADDRESS_LOWER,
      arc.streamId,
      arc.cancellation.nonce,
      arc.employer.toLowerCase(),
      arc.employee.toLowerCase(),
      arc.ratePerSecond,
      arc.cancellation.escrowedRefund,
      arc.invoiceRef,
      arc.deliverables,
      arc.cancellation.reason,
      arc.cancellation.evidenceUri,
      arc.cancellation.evidenceHash,
      bantUri,
      bantHash,
    ],
    value: 0n,
  });
  return String(hash);
}

const arcTestnetChainId = 5042002;
const PAYROLL_ADDRESS_LOWER = (
  process.env.NEXT_PUBLIC_PAYROLL_ADDRESS ?? ""
).toLowerCase();

export async function adjudicateGenLayerAppeal(caseId: string) {
  const hash = await client().writeContract({
    address: address(),
    functionName: "adjudicate",
    args: [caseId],
    value: 0n,
  });
  return String(hash);
}

export async function readGenLayerCase(caseId: string) {
  return (await client().readContract({
    address: address(),
    functionName: "get_case",
    args: [caseId],
  })) as Record<string, unknown>;
}

export type GenLayerTxState =
  | { state: "pending" }
  | { state: "finalized" }
  | { state: "failed"; error: string };

export async function getGenLayerTxState(
  hash: string
): Promise<GenLayerTxState> {
  const gl = client();
  const txHash = hash as TransactionHash;
  const transaction = await gl.getTransaction({ hash: txHash });

  if (transaction.statusName === TransactionStatus.READY_TO_FINALIZE) {
    await gl.finalizeTransaction({ txId: txHash });
    return { state: "pending" };
  }
  if (transaction.statusName !== TransactionStatus.FINALIZED) {
    return { state: "pending" };
  }
  if (transaction.txExecutionResultName === ExecutionResult.FINISHED_WITH_ERROR) {
    return {
      state: "failed",
      error: "GenLayer transaction finalized with an execution error",
    };
  }
  return { state: "finalized" };
}
