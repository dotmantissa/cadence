import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser, badRequest } from "../../_auth";
import {
  addBantMessage,
  getBantMessages,
  getBantRoom,
  getCancellationAppeal,
} from "@/db/queries";
import { readArcStreamAppeal } from "@/lib/arc-server";
import { APPEAL_SOURCE_TYPES, type AppealSourceType } from "@/lib/appeals";
import { hasVerifiedWallet } from "@/lib/auth-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SOURCE_BYTES = 500_000;

function publicHttps(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("evidence URL must be an https URL");
  const url = new URL(raw.trim());
  const host = url.hostname.toLowerCase();
  const second = Number(host.split(".")[1]);
  const privateIp =
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.startsWith("10.") ||
    host.startsWith("127.") ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.") ||
    (host.startsWith("172.") && second >= 16 && second <= 31);
  if (url.protocol !== "https:" || privateIp) {
    throw new Error("evidence URL must use a public https URL");
  }
  return url.toString();
}

async function hashSource(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`evidence source returned HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) {
      throw new Error("evidence source must be between 1 byte and 500 KB");
    }
    return `0x${createHash("sha256").update(bytes).digest("hex")}`;
  } finally {
    clearTimeout(timer);
  }
}

async function authorized(req: Request, caseId: string) {
  const gate = await requireUser(req);
  if ("response" in gate) return { response: gate.response } as const;
  const appeal = await getCancellationAppeal(caseId);
  if (!appeal) return { response: NextResponse.json({ error: "not found" }, { status: 404 }) } as const;
  const linkedWallet = [appeal.payerAddress, appeal.payeeAddress].find((address) =>
    hasVerifiedWallet(gate.caller.walletAddresses, address)
  );
  const wallet = linkedWallet ?? (appeal.ownerId === gate.user.id ? appeal.payeeAddress : undefined);
  if (!wallet) {
    return { response: NextResponse.json({ error: "forbidden" }, { status: 403 }) } as const;
  }
  return { user: gate.user, appeal, wallet } as const;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params;
  const result = await authorized(req, caseId.toLowerCase());
  if ("response" in result) return result.response;
  const room = await getBantRoom(result.appeal.caseId);
  if (!room) return NextResponse.json({ room: null, messages: [] });
  const messages = await getBantMessages(room.id);
  return NextResponse.json({
    room: {
      caseId: room.caseId,
      streamId: room.streamId,
      opensAt: room.opensAt,
      closesAt: room.closesAt,
      status: room.status,
    },
    messages,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params;
  const result = await authorized(req, caseId.toLowerCase());
  if ("response" in result) return result.response;
  const room = await getBantRoom(result.appeal.caseId);
  if (!room) return badRequest("Bant room is not open yet");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid json");
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const message = typeof input.body === "string" ? input.body.trim() : "";
  if (message.length < 1 || message.length > 4000) {
    return badRequest("message must be 1 to 4000 characters");
  }

  let arc;
  try {
    arc = await readArcStreamAppeal(BigInt(result.appeal.streamId));
  } catch {
    return NextResponse.json({ error: "could not read Arc Bant deadline" }, { status: 502 });
  }
  if (arc.cancellation.status !== 2) return badRequest("this appeal is no longer active");
  if (BigInt(Math.floor(Date.now() / 1000)) >= arc.bantDeadline) {
    return badRequest("the 24-hour Bant period has closed");
  }

  let evidenceUrl: string | null = null;
  let evidenceType: string | null = null;
  let evidenceDescription: string | null = null;
  let evidenceHash: string | null = null;
  if (input.evidenceUrl) {
    try {
      evidenceUrl = publicHttps(input.evidenceUrl);
      evidenceType = typeof input.evidenceType === "string" ? input.evidenceType.trim().toLowerCase() : "other";
      if (!APPEAL_SOURCE_TYPES.includes(evidenceType as AppealSourceType)) {
        return badRequest("unsupported evidence type");
      }
      evidenceDescription =
        typeof input.evidenceDescription === "string" ? input.evidenceDescription.trim() : "";
      if (evidenceDescription.length < 10 || evidenceDescription.length > 300) {
        return badRequest("evidence description must be 10 to 300 characters");
      }
      evidenceHash = await hashSource(evidenceUrl);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "could not commit evidence");
    }
  }

  const row = await addBantMessage({
    roomId: room.id,
    authorUserId: result.user.id,
    authorAddress: result.wallet,
    body: message,
    evidenceUrl,
    evidenceType,
    evidenceDescription,
    evidenceHash,
  });
  return NextResponse.json({ message: row }, { status: 201 });
}
