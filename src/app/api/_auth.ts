import "server-only";

import { NextResponse } from "next/server";
import { verifyCaller } from "@/lib/privy-server";
import { upsertUser } from "@/db/queries";
import type { User } from "@/db/schema";

/**
 * Authenticate a request and resolve it to our internal user row, creating or
 * syncing that row on the way through. Every protected route starts here.
 *
 * Returns either `{ user }` or a ready-to-send 401 `response`. Split this way so
 * handlers can `if ("response" in gate) return gate.response;` and then use the
 * user with no further null checks.
 */
export async function requireUser(
  req: Request
): Promise<{ user: User } | { response: NextResponse }> {
  const caller = await verifyCaller(req);
  if (!caller) {
    return {
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  const user = await upsertUser(caller);
  return { user };
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
