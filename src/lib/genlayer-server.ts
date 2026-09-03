import "server-only";

import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import {
  ExecutionResult,
  TransactionStatus,
  type TransactionHash,
} from "genlayer-js/types";
import type { ArcStreamAppeal } from "./arc-server";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

export function isGenLayerConfigured(): boolean {
  return Boolean(
    ADDRESS.test(process.env.GENLAYER_CONTRACT_ADDRESS ?? "") &&
      PRIVATE_KEY.test(process.env.GENLAYER_PRIVATE_KEY ?? "")
  );
}

export type GenLayerReadiness = {
  configured: boolean;
  reachable: boolean;
  contractAddress: string | null;
  accountAddress: string | null;
  error: string | null;
};

function configuredAddress(): `0x${string}` {
  const value = process.env.GENLAYER_CONTRACT_ADDRESS ?? "";
  if (!ADDRESS.test(value)) {
    throw new Error("GENLAYER_CONTRACT_ADDRESS is not configured");
  }
  return value as `0x${string}`;
}

function configuredPrivateKey(): `0x${string}` {
  const value = process.env.GENLAYER_PRIVATE_KEY ?? "";
  if (!PRIVATE_KEY.test(value)) {
    throw new Error("GENLAYER_PRIVATE_KEY is not configured");
  }
  return value as `0x${string}`;
}

function client() {
  return createClient({
    chain: studionet,
    account: createAccount(configuredPrivateKey()),
  });
}

function address(): `0x${string}` {
  return configuredAddress();
}

export async function getGenLayerReadiness(): Promise<GenLayerReadiness> {
  const contract = process.env.GENLAYER_CONTRACT_ADDRESS ?? "";
  const key = process.env.GENLAYER_PRIVATE_KEY ?? "";
  const configured = ADDRESS.test(contract) && PRIVATE_KEY.test(key);
  if (!configured) {
    return {
      configured: false,
      reachable: false,
      contractAddress: ADDRESS.test(contract) ? contract : null,
      accountAddress: null,
      error: "GenLayer adjudicator is not configured",
    };
  }

  const account = createAccount(key as `0x${string}`);
  try {
    const schema = await client().getContractSchema(address());
    if (!schema?.methods?.file_appeal_with_bant || !schema.methods.adjudicate) {
      throw new Error("configured GenLayer contract is missing the Cadence adjudicator methods");
    }
    return {
      configured: true,
      reachable: true,
      contractAddress: contract,
      accountAddress: account.address,
      error: null,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      contractAddress: contract,
      accountAddress: account.address,
      error: error instanceof Error ? error.message : "GenLayer adjudicator is unreachable",
    };
  }
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
      arc.payrollAddress.toLowerCase(),
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
    functionName: "get_verdict",
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
    let detail = "GenLayer transaction finalized with an execution error";
    try {
      const trace = await gl.debugTraceTransaction({ hash: txHash });
      const traceError = [trace.stderr, trace.genvm_log]
        .filter((value) => typeof value === "string" && value.trim())
        .join("\n")
        .trim();
      if (traceError) detail = traceError.slice(0, 1000);
    } catch {
      // Keep the stable error when the optional trace endpoint is unavailable.
    }
    return {
      state: "failed",
      error: detail,
    };
  }
  return { state: "finalized" };
}
