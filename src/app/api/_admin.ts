import "server-only";

import { NextResponse } from "next/server";
import { verifyCaller, type Caller } from "@/lib/privy-server";

export const OFFICIAL_ADMIN_EMAIL = "cadenceonarc@gmail.com";

/**
 * Admin access is based on the verified email returned by Privy for the
 * authenticated session. The database profile is deliberately not trusted for
 * authorization because notification emails are user-editable.
 */
export async function requireAdmin(
  req: Request
): Promise<{ caller: Caller } | { response: NextResponse }> {
  const caller = await verifyCaller(req);
  if (!caller) {
    return {
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  const email = caller.email?.trim().toLowerCase();
  if (email !== OFFICIAL_ADMIN_EMAIL) {
    return {
      response: NextResponse.json({ error: "not found" }, { status: 404 }),
    } as const;
  }

  return { caller };
}
