import { NextResponse } from "next/server";
import { requireUser } from "../_auth";
import { getUserByUsername } from "@/db/queries";
import { validateUsername } from "@/lib/username";

// Auth relies on runtime headers, so this is always dynamic.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolve an @handle to the wallet it should be paid at. `?u=<handle>` →
 * `{ walletAddress, username, displayName }`. Auth-gated: only signed-in users
 * can look up a payee, and we only ever return a public wallet address, never
 * email or other identity. 404 when the handle is unknown or has no wallet yet.
 */
export async function GET(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;

  const u = new URL(req.url).searchParams.get("u") ?? "";
  const check = validateUsername(u);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const target = await getUserByUsername(check.value);
  if (!target) {
    return NextResponse.json({ error: "no one goes by that handle" }, { status: 404 });
  }
  if (!target.walletAddress) {
    return NextResponse.json(
      { error: "that handle has no wallet to pay yet" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    walletAddress: target.walletAddress,
    username: target.username,
    displayName: target.displayName,
  });
}
