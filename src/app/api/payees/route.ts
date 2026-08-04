import { NextResponse } from "next/server";
import { requireUser, badRequest } from "../_auth";
import { listPayees, addPayee } from "@/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** The caller's saved payees (address book). */
export async function GET(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;
  const rows = await listPayees(gate.user.id);
  return NextResponse.json({ payees: rows });
}

/** Add a payee to the address book. */
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

  const label = typeof b.label === "string" ? b.label.trim() : "";
  const address = typeof b.address === "string" ? b.address.trim() : "";
  if (!label) return badRequest("label is required");
  if (!ADDRESS.test(address)) return badRequest("address must be a 0x EVM address");

  const row = await addPayee(gate.user.id, {
    label: label.slice(0, 80),
    address,
    role: typeof b.role === "string" ? b.role.slice(0, 60) : null,
    note: typeof b.note === "string" ? b.note.slice(0, 280) : null,
  });
  return NextResponse.json({ payee: row }, { status: 201 });
}
