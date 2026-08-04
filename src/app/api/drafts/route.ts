import { NextResponse } from "next/server";
import { requireUser, badRequest } from "../_auth";
import { listDrafts, saveDraft } from "@/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
// USDC base units per second, kept as a decimal string. Digits only, optional
// fractional part — we never trust the client to hand us a bigint.
const NUMERIC = /^\d+(\.\d+)?$/;

/** The caller's off-chain stream drafts (work-in-progress payroll setups). */
export async function GET(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;
  const rows = await listDrafts(gate.user.id);
  return NextResponse.json({ drafts: rows });
}

/**
 * Create or update a draft. Send an `id` to update an existing one, omit it to
 * create. Everything is optional so a half-filled form can be parked and
 * resumed later.
 */
export async function POST(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid json");
  }
  const b = (body ?? {}) as Record<string, unknown>;

  if (b.payeeAddress != null && !ADDRESS.test(String(b.payeeAddress))) {
    return badRequest("payeeAddress must be a 0x EVM address");
  }
  if (b.ratePerSecond != null && !NUMERIC.test(String(b.ratePerSecond))) {
    return badRequest("ratePerSecond must be a numeric string");
  }
  if (b.depositAmount != null && !NUMERIC.test(String(b.depositAmount))) {
    return badRequest("depositAmount must be a numeric string");
  }
  const status = b.status == null ? undefined : String(b.status);
  if (status && status !== "draft" && status !== "committed") {
    return badRequest("status must be draft or committed");
  }

  const str = (v: unknown) => (v == null ? null : String(v));

  const row = await saveDraft(gate.user.id, {
    id: typeof b.id === "string" ? b.id : undefined,
    payeeLabel: str(b.payeeLabel),
    payeeAddress: str(b.payeeAddress),
    ratePerSecond: str(b.ratePerSecond),
    depositAmount: str(b.depositAmount),
    invoiceRef: str(b.invoiceRef),
    status,
    onchainStreamId: str(b.onchainStreamId),
  });
  return NextResponse.json({ draft: row }, { status: 201 });
}
