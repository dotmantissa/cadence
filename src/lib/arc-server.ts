import "server-only";

import {
  createPublicClient,
  createWalletClient,
  fallback,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "./chains";
import { ARC_RPC_UPSTREAMS } from "./rpc-endpoints";
import { PAYROLL_ABI, PAYROLL_ADDRESS } from "./contracts";

const transport = fallback(
  ARC_RPC_UPSTREAMS.map((url) => http(url)),
  { rank: false }
);

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport,
});

export interface ArcStreamAppeal {
  streamId: bigint;
  employer: `0x${string}`;
  employee: `0x${string}`;
  ratePerSecond: bigint;
  invoiceRef: string;
  deliverables: string;
  cancellation: {
    nonce: bigint;
    requestedAt: bigint;
    appealDeadline: bigint;
    adjudicationDeadline: bigint;
    escrowedRefund: bigint;
    status: number;
    evidenceHash: Hex;
    verdictHash: Hex;
    reason: string;
    evidenceUri: string;
  };
  caseId: Hex;
  bantDeadline: bigint;
}

export async function readArcStreamAppeal(
  streamId: bigint
): Promise<ArcStreamAppeal> {
  const [streamRaw, deliverables, bantDeadline, cancellationRaw, caseId] = await Promise.all([
    publicClient.readContract({
      address: PAYROLL_ADDRESS,
      abi: PAYROLL_ABI,
      functionName: "streams",
      args: [streamId],
    }),
    publicClient.readContract({
      address: PAYROLL_ADDRESS,
      abi: PAYROLL_ABI,
      functionName: "deliverables",
      args: [streamId],
    }),
    publicClient.readContract({
      address: PAYROLL_ADDRESS,
      abi: PAYROLL_ABI,
      functionName: "bantDeadline",
      args: [streamId],
    }),
    publicClient.readContract({
      address: PAYROLL_ADDRESS,
      abi: PAYROLL_ABI,
      functionName: "cancellations",
      args: [streamId],
    }),
    publicClient.readContract({
      address: PAYROLL_ADDRESS,
      abi: PAYROLL_ABI,
      functionName: "cancellationCaseId",
      args: [streamId],
    }),
  ]);

  const [
    employer,
    employee,
    ratePerSecond,
    ,
    ,
    ,
    ,
    ,
    ,
    invoiceRef,
  ] = streamRaw;
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
  ] = cancellationRaw;

  return {
    streamId,
    employer,
    employee,
    ratePerSecond,
    invoiceRef,
    deliverables,
    cancellation: {
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
    },
    caseId,
    bantDeadline,
  };
}

function adjudicatorAccount() {
  const key = process.env.ADJUDICATOR_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("ADJUDICATOR_PRIVATE_KEY is not configured");
  }
  return privateKeyToAccount(key as Hex);
}

export async function relayArcVerdict(
  streamId: bigint,
  appealUpheld: boolean,
  verdictHash: Hex
) {
  const account = adjudicatorAccount();
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport,
  });
  const hash = await walletClient.writeContract({
    address: PAYROLL_ADDRESS,
    abi: PAYROLL_ABI,
    functionName: "resolveCancellation",
    args: [streamId, appealUpheld, verdictHash],
    gas: 300_000n,
    maxFeePerGas: 50_000_000_000n,
    maxPriorityFeePerGas: 2_000_000_000n,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
