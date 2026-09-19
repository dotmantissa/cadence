import "server-only";

import { NextResponse } from "next/server";
import { requireUser } from "./_auth";

export const OFFICIAL_ADMIN_EMAIL = "cadenceonarc@gmail.com";

/**
 * Admin access is based on the verified email returned by Privy for the
 * authenticated session. The database profile is deliberately not trusted for
 * authorization because notification emails are user-editable.
 */
export async function requireAdmin(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate;

  const email = gate.caller.email?.trim().toLowerCase();
  if (email !== OFFICIAL_ADMIN_EMAIL) {
    return {
      response: NextResponse.json({ error: "not found" }, { status: 404 }),
    } as const;
  }

  return gate;
}
