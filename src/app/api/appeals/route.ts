import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyMessage, type Hex } from "viem";
import { requireUser, badRequest } from "../_auth";
import { prepareCancellationAppeal } from "@/db/queries";
import { readArcStreamAppeal } from "@/lib/arc-server";
import {
  appealAuthorizationMessage,
  APPEAL_SOURCE_TYPES,
  type AppealSourceType,
} from "@/lib/appeals";
import { hasVerifiedWallet } from "@/lib/auth-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX = /^[0-9a-f]{64}$/;
const MAX_SOURCE_BYTES = 500_000;

function privateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.")
  ) {
    return true;
  }
  if (host.startsWith("172.")) {
    const second = Number(host.split(".")[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

function httpsUrl(raw: unknown, label: string): string {
  if (typeof raw !== "string") throw new Error(`${label} must be an https URL`);
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error(`${label} must be an https URL`);
  }
  if (parsed.protocol !== "https:" || privateHost(parsed.hostname)) {
    throw new Error(`${label} must use a public https URL`);
  }
  return parsed.toString();
}

async function fetchCommittedSource(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      headers: { accept: "*/*" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`evidence source returned HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_SOURCE_BYTES) {
      throw new Error("evidence source must be between 1 byte and 500 KB");
    }
    return createHash("sha256").update(bytes).digest("hex");
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid json");
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const streamIdRaw = input.streamId;
  if (
    (typeof streamIdRaw !== "string" && typeof streamIdRaw !== "number") ||
    !/^\d+$/.test(String(streamIdRaw))
  ) {
    return badRequest("streamId must be a decimal string");
  }

  const statement = typeof input.statement === "string" ? input.statement.trim() : "";
  if (statement.length < 40 || statement.length > 4000) {
    return badRequest("statement must be 40 to 4000 characters");
  }
  if (!Array.isArray(input.sources) || input.sources.length < 1 || input.sources.length > 8) {
    return badRequest("provide one to eight evidence sources");
  }
  const walletAddress = typeof input.walletAddress === "string" ? input.walletAddress.trim() : "";
  if (!ADDRESS.test(walletAddress)) return badRequest("walletAddress must be an EVM address");
  const proof = (input.walletProof ?? {}) as Record<string, unknown>;
  const signature = typeof proof.signature === "string" ? proof.signature : "";
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    return badRequest("walletProof.signature must be a signed message");
  }

  let arc;
  try {
    arc = await readArcStreamAppeal(BigInt(String(streamIdRaw)));
  } catch {
    return NextResponse.json({ error: "could not read the Arc cancellation" }, { status: 502 });
  }
  if (walletAddress.toLowerCase() !== arc.employee.toLowerCase()) {
    return NextResponse.json({ error: "only the payee can file this appeal" }, { status: 403 });
  }
  const expectedMessage = appealAuthorizationMessage(arc.streamId, arc.employee);
  if (proof.message !== expectedMessage) {
    return NextResponse.json({ error: "invalid payee authorization" }, { status: 403 });
  }
  let authorizedBySignature = false;
  try {
    authorizedBySignature = await verifyMessage({
      address: arc.employee,
      message: expectedMessage,
      signature: signature as Hex,
    });
  } catch {
    authorizedBySignature = false;
  }
  if (!authorizedBySignature && !hasVerifiedWallet(gate.caller.walletAddresses, arc.employee)) {
    return NextResponse.json({ error: "only the payee can file this appeal" }, { status: 403 });
  }
  if (arc.cancellation.status !== 1) {
    return badRequest("this cancellation is no longer in its appeal window");
  }
  if (arc.cancellation.nonce === 0n || arc.cancellation.escrowedRefund === 0n) {
    return badRequest("this cancellation has no appealable escrow");
  }

  const normalizedSources: {
    type: AppealSourceType;
    url: string;
    sha256: string;
    description: string;
  }[] = [];
  const seen = new Set<string>();
  try {
    for (const raw of input.sources) {
      const source = (raw ?? {}) as Record<string, unknown>;
      const type = typeof source.type === "string" ? source.type.trim().toLowerCase() : "";
      if (!APPEAL_SOURCE_TYPES.includes(type as AppealSourceType)) {
        throw new Error("unsupported evidence source type");
      }
      const url = httpsUrl(source.url, "evidence source");
      if (seen.has(url)) throw new Error("evidence source URLs must be unique");
      seen.add(url);
      const description =
        typeof source.description === "string" ? source.description.trim() : "";
      if (description.length < 10 || description.length > 300) {
        throw new Error("source descriptions must be 10 to 300 characters");
      }
      const sha256 = await fetchCommittedSource(url);
      normalizedSources.push({
        type: type as AppealSourceType,
        url,
        sha256,
        description,
      });
    }
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "could not commit evidence");
  }

  const caseId = arc.caseId.toLowerCase();
  if (!HEX.test(caseId.replace(/^0x/, ""))) return badRequest("invalid Arc case id");
  const evidencePackage = JSON.stringify(
    {
      statement,
      requested_remedy: "continue_stream",
      sources: normalizedSources,
    },
    null,
    2
  );
  const evidenceHash = `0x${createHash("sha256").update(evidencePackage, "utf8").digest("hex")}`;
  const evidenceUri = new URL(
    `/api/appeals/evidence/${caseId.slice(2)}`,
    new URL(req.url).origin
  ).toString();

  const row = await prepareCancellationAppeal({
    ownerId: gate.user.id,
    caseId,
    streamId: arc.streamId.toString(),
    cancellationNonce: arc.cancellation.nonce.toString(),
    payerAddress: arc.employer.toLowerCase(),
    payeeAddress: arc.employee.toLowerCase(),
    evidenceUri,
    evidenceHash,
    evidencePackage,
    sources: normalizedSources,
  });

  return NextResponse.json({
    appeal: {
      caseId: row.caseId,
      evidenceUri: row.evidenceUri,
      evidenceHash: row.evidenceHash,
      status: row.status,
      fileTxHash: row.fileTxHash,
      adjudicationTxHash: row.adjudicationTxHash,
      relayTxHash: row.relayTxHash,
      verdict: row.verdict,
      lastError: row.lastError,
    },
  });
}
