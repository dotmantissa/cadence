import { NextResponse } from "next/server";
import { requireUser } from "../../_auth";
import { deleteDraft } from "@/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Discard a draft. Scoped to the caller. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  const row = await deleteDraft(gate.user.id, id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
