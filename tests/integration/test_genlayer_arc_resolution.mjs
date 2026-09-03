import assert from "node:assert/strict";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;
const CASE_ID = /^0x[0-9a-fA-F]{64}$/;

const required = (name, value) => {
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const genlayerAddress = required(
  "GENLAYER_CONTRACT_ADDRESS",
  process.env.GENLAYER_CONTRACT_ADDRESS
);
const genlayerKey = required(
  "GENLAYER_PRIVATE_KEY",
  process.env.GENLAYER_PRIVATE_KEY
);
const arcPayroll = required(
  "ARC_PAYROLL_ADDRESS or NEXT_PUBLIC_PAYROLL_ADDRESS",
  process.env.ARC_PAYROLL_ADDRESS ?? process.env.NEXT_PUBLIC_PAYROLL_ADDRESS
);
const arcKey = required(
  "ARC_ADJUDICATOR_PRIVATE_KEY or ADJUDICATOR_PRIVATE_KEY",
  process.env.ARC_ADJUDICATOR_PRIVATE_KEY ?? process.env.ADJUDICATOR_PRIVATE_KEY
);
const streamId = required("E2E_STREAM_ID", process.env.E2E_STREAM_ID);

assert.match(genlayerAddress, ADDRESS, "invalid GenLayer contract address");
assert.match(genlayerKey, PRIVATE_KEY, "invalid GenLayer private key");
assert.match(arcPayroll, ADDRESS, "invalid Arc PayrollManager address");
assert.match(arcKey, PRIVATE_KEY, "invalid Arc adjudicator private key");
assert.match(streamId, /^\d+$/, "E2E_STREAM_ID must be decimal");

const gl = createClient({
  chain: studionet,
  account: createAccount(genlayerKey),
});
const arcAccount = privateKeyToAccount(arcKey);
const arc = createPublicClient({
  chain: {
    id: 5042002,
    name: "Arc Testnet",
    nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.io"] } },
  },
  transport: http(),
});
const wallet = createWalletClient({
  account: arcAccount,
  chain: arc.chain,
  transport: http(process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.io"),
});

const payrollAbi = parseAbi([
  "function adjudicator() view returns (address)",
  "function bantDeadline(uint256) view returns (uint64)",
  "function cancellationCaseId(uint256) view returns (bytes32)",
  "function cancellations(uint256) view returns (uint64,uint64,uint64,uint64,uint128,uint8,bytes32,bytes32,string,string)",
  "function resolveCancellation(uint256,bool,bytes32)",
]);

const caseId = await arc.readContract({
  address: arcPayroll,
  abi: payrollAbi,
  functionName: "cancellationCaseId",
  args: [BigInt(streamId)],
});
assert.match(caseId, CASE_ID, "Arc returned an invalid case id");
if (process.env.E2E_CASE_ID) {
  assert.equal(caseId.toLowerCase(), process.env.E2E_CASE_ID.toLowerCase());
}

const [caseState, verdict] = await Promise.all([
  gl.readContract({
    address: genlayerAddress,
    functionName: "get_case",
    args: [caseId],
  }),
  gl.readContract({
    address: genlayerAddress,
    functionName: "get_verdict",
    args: [caseId],
  }),
]);

assert.equal(caseState.status, "ruled", "GenLayer case is not ruled");
assert.equal(verdict.ready, true, "GenLayer verdict is not ready");
assert.equal(verdict.case_id.toLowerCase(), caseId.slice(2).toLowerCase());
assert.equal(typeof verdict.verdict_hash, "string");
assert.match(verdict.verdict_hash, /^[0-9a-fA-F]{64}$/);
assert.equal(typeof verdict.appeal_upheld, "boolean");

const cancellation = await arc.readContract({
  address: arcPayroll,
  abi: payrollAbi,
  functionName: "cancellations",
  args: [BigInt(streamId)],
});
assert.equal(Number(cancellation[5]), 2, "Arc cancellation is not Appealed");
assert.ok(
  BigInt(cancellation[3]) >= BigInt(Math.floor(Date.now() / 1000)),
  "Arc adjudication deadline has expired"
);
const bantDeadline = await arc.readContract({
  address: arcPayroll,
  abi: payrollAbi,
  functionName: "bantDeadline",
  args: [BigInt(streamId)],
});
assert.ok(
  bantDeadline <= BigInt(Math.floor(Date.now() / 1000)),
  "Arc Bant period is still active"
);
assert.equal(
  (await arc.readContract({
    address: arcPayroll,
    abi: payrollAbi,
    functionName: "adjudicator",
  })).toLowerCase(),
  arcAccount.address.toLowerCase(),
  "Arc adjudicator does not match the relay key"
);

const verdictHash = `0x${verdict.verdict_hash}`;
const txHash = await wallet.writeContract({
  address: arcPayroll,
  abi: payrollAbi,
  functionName: "resolveCancellation",
  args: [BigInt(streamId), verdict.appeal_upheld, verdictHash],
  gas: 300_000n,
  maxFeePerGas: 50_000_000_000n,
  maxPriorityFeePerGas: 2_000_000_000n,
});
const receipt = await arc.waitForTransactionReceipt({ hash: txHash });
assert.equal(receipt.status, "success");

const resolved = await arc.readContract({
  address: arcPayroll,
  abi: payrollAbi,
  functionName: "cancellations",
  args: [BigInt(streamId)],
});
assert.ok(
  Number(resolved[5]) === 3 || Number(resolved[5]) === 4,
  "Arc cancellation did not reach a terminal verdict state"
);
assert.equal(resolved[7].toLowerCase(), verdictHash.toLowerCase());

console.log(
  JSON.stringify({
    caseId,
    genlayerStatus: caseState.status,
    appealUpheld: verdict.appeal_upheld,
    arcTxHash: txHash,
    arcStatus: Number(resolved[5]),
  })
);
