import { NextResponse } from "next/server";
import { requireUser, badRequest } from "../_auth";
import { updateProfile } from "@/db/queries";

// Auth relies on runtime headers, so this is always dynamic.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current profile. Also (re)creates the users row on first login. */
export async function GET(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;
  return NextResponse.json({ user: gate.user });
}

/** Update display name / role / settings for the current user. */
export async function PATCH(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid json");
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const patch: {
    displayName?: string | null;
    role?: string | null;
    settings?: Record<string, unknown>;
  } = {};

  if ("displayName" in b) {
    patch.displayName =
      b.displayName == null ? null : String(b.displayName).slice(0, 120);
  }
  if ("role" in b) {
    const role = b.role == null ? null : String(b.role);
    if (role !== null && role !== "employer" && role !== "employee") {
      return badRequest("role must be employer, employee, or null");
    }
    patch.role = role;
  }
  if ("settings" in b && b.settings && typeof b.settings === "object") {
    patch.settings = b.settings as Record<string, unknown>;
  }

  const user = await updateProfile(gate.user.id, patch);
  return NextResponse.json({ user });
}
