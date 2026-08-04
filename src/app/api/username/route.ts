import { NextResponse } from "next/server";
import { requireUser, badRequest } from "../_auth";
import { isUsernameAvailable, setUsername } from "@/db/queries";
import { validateUsername } from "@/lib/username";

// Auth relies on runtime headers, so this is always dynamic.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Availability check. `?u=<handle>` → `{ available, reason? }`. Always 200 when
 * the request itself is well-formed: an unavailable name is a valid answer, not
 * an error. A malformed handle comes back `available: false` with the reason.
 */
export async function GET(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;

  const u = new URL(req.url).searchParams.get("u") ?? "";
  const check = validateUsername(u);
  if (!check.ok) {
    return NextResponse.json({ available: false, reason: check.error });
  }
  // A user re-checking the handle they already own should see it as available.
  if (gate.user.username === check.value) {
    return NextResponse.json({ available: true });
  }
  const available = await isUsernameAvailable(check.value);
  return NextResponse.json({
    available,
    reason: available ? undefined : "already taken",
  });
}

/**
 * Claim a handle for the current user. `{ username }` → `{ user }` on success,
 * 400 on a bad format, 409 when someone else grabbed it (including races).
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
  const raw = (body as { username?: unknown })?.username;
  if (typeof raw !== "string") return badRequest("username is required");

  const check = validateUsername(raw);
  if (!check.ok) return badRequest(check.error);

  const result = await setUsername(gate.user.id, check.value);
  if ("taken" in result) {
    return NextResponse.json({ error: "already taken" }, { status: 409 });
  }
  return NextResponse.json({ user: result.user });
}
