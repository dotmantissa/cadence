import "server-only";

import {
  createPublicClient,
  fallback,
  http,
  isAddress,
  parseAbiItem,
  type Address,
} from "viem";
import { arcMainnet } from "./chains";
import { ARC_RPC_UPSTREAMS } from "./rpc-endpoints";
import { PAYROLL_ABI, PAYROLL_ADDRESS, USDC_ADDRESS } from "./contracts";

const transport = fallback(ARC_RPC_UPSTREAMS.map((url) => http(url)), { rank: false });
const client = createPublicClient({ chain: arcMainnet, transport });
const MAX_LOGS = 5_000;
const SCAN_WINDOW = 100_000n;
const CHUNK_SIZE = 25_000n;
const DEFAULT_PAYROLL_DEPLOYMENT_BLOCK = 21840316n;

const events = {
  streamCreated: parseAbiItem(
    "event StreamCreated(uint256 indexed streamId,address indexed employer,address indexed employee,uint128 ratePerSecond,uint128 deposit,string invoiceRef,uint64 startTime)"
  ),
  withdrawn: parseAbiItem(
    "event Withdrawn(uint256 indexed streamId,address indexed employee,uint128 amount)"
  ),
  toppedUp: parseAbiItem(
    "event StreamToppedUp(uint256 indexed streamId,address indexed employer,uint128 amount)"
  ),
  cancellationRequested: parseAbiItem(
    "event CancellationRequested(uint256 indexed streamId,uint64 indexed nonce,address indexed employer,uint128 accruedPaid,uint128 escrowedRefund,uint64 appealDeadline,bytes32 caseId,string reason)"
  ),
  cancellationResolved: parseAbiItem(
    "event CancellationResolved(uint256 indexed streamId,uint64 indexed nonce,bytes32 indexed caseId,bool appealUpheld,uint128 refunded,bytes32 verdictHash)"
  ),
  requestCreated: parseAbiItem(
    "event RequestCreated(uint256 indexed requestId,address indexed payee,address indexed payer,uint128 ratePerSecond,uint128 deposit,uint64 startAt,string invoiceRef)"
  ),
  requestAccepted: parseAbiItem(
    "event RequestAccepted(uint256 indexed requestId,uint256 indexed streamId)"
  ),
  requestRejected: parseAbiItem(
    "event RequestRejected(uint256 indexed requestId,address indexed by)"
  ),
  requestCancelled: parseAbiItem(
    "event RequestCancelled(uint256 indexed requestId,address indexed by)"
  ),
  requestExpired: parseAbiItem(
    "event RequestExpired(uint256 indexed requestId,uint128 refunded)"
  ),
} as const;

type EventName = keyof typeof events;
type EventLog = {
  blockNumber?: bigint | null;
  logIndex?: number | null;
  transactionHash?: `0x${string}`;
  args?: Record<string, unknown>;
};

export type AnalyticsPayload = {
  network: {
    name: string;
    chainId: number;
    latestBlock: string;
    rpc: string;
  };
  contract: {
    address: string;
    usdcAddress: string;
    balance: string;
    nextStreamId: string;
    scannedFromBlock: string;
    historyComplete: boolean;
  };
  metrics: {
    totalStreams: number;
    activeStreams: number;
    totalCommitted: string;
    totalWithdrawn: string;
    totalEarned: string;
    lockedBalance: string;
    uniqueEmployers: number;
    uniqueEmployees: number;
    withdrawals: number;
    topUps: number;
    cancellations: number;
    requests: number;
  };
  activity: AnalyticsActivity[];
};

export type AnalyticsActivity = {
  type: string;
  blockNumber: string;
  transactionHash: string;
  streamId: string | null;
  actor: string | null;
  counterparty: string | null;
  amount: string | null;
  timestamp: string;
};

export type ProtocolFeeConfig = {
  owner: string;
  feeRecipient: string;
  feeBps: number;
};

function asAddress(value: unknown): string | null {
  return typeof value === "string" && isAddress(value) ? value.toLowerCase() : null;
}

function asBigInt(value: unknown): bigint | null {
  return typeof value === "bigint" ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function logArgs(log: EventLog): Record<string, unknown> {
  return (log.args ?? {}) as Record<string, unknown>;
}

async function getEventLogs(
  event: (typeof events)[EventName],
  fromBlock: bigint,
  toBlock: bigint
) {
  return client.getLogs({
    address: PAYROLL_ADDRESS as Address,
    event,
    fromBlock,
    toBlock,
  }) as unknown as Promise<EventLog[]>;
}

async function scanLogs(latestBlock: bigint) {
  const configured = process.env.ARC_PAYROLL_DEPLOYMENT_BLOCK;
  const configuredBlock =
    configured && /^\d+$/.test(configured) ? BigInt(configured) : DEFAULT_PAYROLL_DEPLOYMENT_BLOCK;
  const fromBlock = configuredBlock ?? (latestBlock > SCAN_WINDOW ? latestBlock - SCAN_WINDOW : 0n);
  const chunks: { from: bigint; to: bigint }[] = [];
  for (let from = fromBlock; from <= latestBlock; from += CHUNK_SIZE) {
    chunks.push({ from, to: from + CHUNK_SIZE - 1n > latestBlock ? latestBlock : from + CHUNK_SIZE - 1n });
  }

  const grouped = new Map<EventName, EventLog[]>();
  for (const name of Object.keys(events) as EventName[]) grouped.set(name, []);
  for (const chunk of chunks) {
    const result = await Promise.all(
      (Object.keys(events) as EventName[]).map((name) =>
        getEventLogs(events[name], chunk.from, chunk.to)
      )
    );
    result.forEach((logs, index) => {
      const name = (Object.keys(events) as EventName[])[index];
      const current = grouped.get(name) ?? [];
      current.push(...logs);
      grouped.set(name, current);
    });
  }
  const total = [...grouped.values()].reduce((sum, logs) => sum + logs.length, 0);
  if (total > MAX_LOGS) {
    throw new Error("analytics event volume exceeds the configured safety limit");
  }
  return { grouped, fromBlock, complete: true };
}

function logSort(a: EventLog, b: EventLog) {
  const block = Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n));
  return block || Number((a.logIndex ?? 0) - (b.logIndex ?? 0));
}

function amount(value: unknown): string | null {
  const parsed = asBigInt(value);
  return parsed === null ? null : parsed.toString();
}

async function blockTimestamps(logs: EventLog[]) {
  const blocks = [...new Set(logs.map((log) => log.blockNumber?.toString()).filter(Boolean))];
  const entries = await Promise.all(
    blocks.map(async (block) => {
      const result = await client.getBlock({ blockNumber: BigInt(block!) });
      return [block!, result.timestamp.toString()] as const;
    })
  );
  return new Map(entries);
}

function makeActivity(
  type: string,
  log: EventLog,
  timestamps: Map<string, string>,
  args: Record<string, unknown>,
  actor: unknown,
  counterparty: unknown,
  eventAmount: unknown,
  streamId: unknown
): AnalyticsActivity {
  return {
    type,
    blockNumber: (log.blockNumber ?? 0n).toString(),
    transactionHash: log.transactionHash ?? "",
    streamId: asBigInt(streamId)?.toString() ?? null,
    actor: asAddress(actor),
    counterparty: asAddress(counterparty),
    amount: amount(eventAmount),
    timestamp: new Date(
      Number(BigInt(timestamps.get((log.blockNumber ?? 0n).toString()) ?? "0")) * 1000
    ).toISOString(),
  };
}

export async function getAdminAnalytics() {
  if (!/^0x[0-9a-fA-F]{40}$/.test(PAYROLL_ADDRESS)) {
    throw new Error("Mainnet PayrollManager address is not configured");
  }

  const [latestBlock, chainId, nextStreamId, contractBalance] = await Promise.all([
    client.getBlockNumber(),
    client.getChainId(),
    client.readContract({
      address: PAYROLL_ADDRESS as Address,
      abi: [{ type: "function", name: "nextStreamId", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" }] as const,
      functionName: "nextStreamId",
    }),
    client.readContract({
      address: USDC_ADDRESS,
      abi: [{ type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }] as const,
      functionName: "balanceOf",
      args: [PAYROLL_ADDRESS as Address],
    }),
  ]);
  const { grouped, fromBlock, complete } = await scanLogs(latestBlock);
  const created = [...(grouped.get("streamCreated") ?? [])].sort(logSort);
  const streamIds = created
    .map((log) => asBigInt(logArgs(log).streamId))
    .filter((id): id is bigint => id !== null);
  const streamStates = await Promise.all(
    streamIds.map((id) =>
      client.readContract({
        address: PAYROLL_ADDRESS as Address,
        abi: [{
          type: "function",
          name: "streams",
          inputs: [{ type: "uint256" }],
          outputs: [
            { type: "address" }, { type: "address" }, { type: "uint128" },
            { type: "uint64" }, { type: "uint64" }, { type: "uint128" },
            { type: "uint128" }, { type: "uint128" }, { type: "bool" }, { type: "string" },
          ],
          stateMutability: "view",
        }] as const,
        functionName: "streams",
        args: [id],
      })
    )
  );

  let activeStreams = 0;
  let totalCommitted = 0n;
  let totalWithdrawn = 0n;
  let totalEarned = 0n;
  const employers = new Set<string>();
  const employees = new Set<string>();
  const now = BigInt(Math.floor(Date.now() / 1000));
  for (const state of streamStates) {
    const [employer, employee, rate, , lastClaim, deposit, committed, withdrawn, active] =
      state as unknown as [Address, Address, bigint, bigint, bigint, bigint, bigint, bigint, boolean, string];
    const unclaimed =
      active && now > lastClaim
        ? (() => {
            const accrued = rate * (now - lastClaim);
            return accrued > deposit ? deposit : accrued;
          })()
        : 0n;
    if (active) activeStreams++;
    totalCommitted += committed;
    totalWithdrawn += withdrawn;
    totalEarned += withdrawn + unclaimed;
    employers.add(employer.toLowerCase());
    employees.add(employee.toLowerCase());
  }

  const allLogs = [...grouped.values()].flat().sort(logSort);
  const timestamps = await blockTimestamps(allLogs);
  const activity: AnalyticsActivity[] = [];
  const add = (
    type: string,
    log: EventLog,
    actor: unknown,
    counterparty: unknown,
    eventAmount: unknown,
    streamId: unknown
  ) => activity.push(makeActivity(type, log, timestamps, logArgs(log), actor, counterparty, eventAmount, streamId));
  for (const log of grouped.get("streamCreated") ?? []) {
    const args = logArgs(log);
    add("stream_created", log, args.employer, args.employee, args.deposit, args.streamId);
  }
  for (const log of grouped.get("withdrawn") ?? []) {
    const args = logArgs(log);
    add("withdrawn", log, args.employee, null, args.amount, args.streamId);
  }
  for (const log of grouped.get("toppedUp") ?? []) {
    const args = logArgs(log);
    add("stream_topped_up", log, args.employer, null, args.amount, args.streamId);
  }
  for (const log of grouped.get("cancellationRequested") ?? []) {
    const args = logArgs(log);
    add("cancellation_requested", log, args.employer, null, args.escrowedRefund, args.streamId);
  }
  for (const log of grouped.get("cancellationResolved") ?? []) {
    const args = logArgs(log);
    add("cancellation_resolved", log, null, null, args.refunded, args.streamId);
  }
  for (const name of ["requestCreated", "requestAccepted", "requestRejected", "requestCancelled", "requestExpired"] as const) {
    for (const log of grouped.get(name) ?? []) {
      const args = logArgs(log);
      add(name.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`), log, args.payer ?? args.by, args.payee, args.deposit ?? args.refunded, args.streamId);
    }
  }
  activity.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return {
    network: { name: "Arc Mainnet", chainId, latestBlock: latestBlock.toString(), rpc: ARC_RPC_UPSTREAMS[0] },
    contract: {
      address: PAYROLL_ADDRESS,
      usdcAddress: USDC_ADDRESS,
      balance: contractBalance.toString(),
      nextStreamId: nextStreamId.toString(),
      scannedFromBlock: fromBlock.toString(),
      historyComplete: complete,
    },
    metrics: {
      totalStreams: created.length,
      activeStreams,
      totalCommitted: totalCommitted.toString(),
      totalWithdrawn: totalWithdrawn.toString(),
      totalEarned: totalEarned.toString(),
      lockedBalance: contractBalance.toString(),
      uniqueEmployers: employers.size,
      uniqueEmployees: employees.size,
      withdrawals: (grouped.get("withdrawn") ?? []).length,
      topUps: (grouped.get("toppedUp") ?? []).length,
      cancellations: (grouped.get("cancellationRequested") ?? []).length,
      requests: (grouped.get("requestCreated") ?? []).length,
    },
    activity: activity.slice(0, 60),
  };
}

export async function getProtocolFeeConfig(): Promise<ProtocolFeeConfig> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(PAYROLL_ADDRESS)) {
    throw new Error("Mainnet PayrollManager address is not configured");
  }
  const [owner, feeRecipient, feeBps] = await Promise.all([
    client.readContract({
      address: PAYROLL_ADDRESS as Address,
      abi: PAYROLL_ABI,
      functionName: "owner",
    }),
    client.readContract({
      address: PAYROLL_ADDRESS as Address,
      abi: PAYROLL_ABI,
      functionName: "protocolFeeRecipient",
    }),
    client.readContract({
      address: PAYROLL_ADDRESS as Address,
      abi: PAYROLL_ABI,
      functionName: "protocolFeeBps",
    }),
  ]);
  return {
    owner: owner as string,
    feeRecipient: feeRecipient as string,
    feeBps: Number(feeBps),
  };
}
