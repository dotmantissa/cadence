import "server-only";

import { NextResponse } from "next/server";
import { verifyCaller } from "@/lib/privy-server";
import { upsertUser, EmailBoundElsewhereError } from "@/db/queries";
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
  try {
    const user = await upsertUser(caller);
    return { user };
  } catch (e) {
    // The login email belongs to someone else's account (they bound it for
    // notifications). Refuse with a code the client turns into "sign in with
    // your wallet" and an immediate logout.
    if (e instanceof EmailBoundElsewhereError) {
      return {
        response: NextResponse.json(
          {
            error:
              "That email is already linked to an account. Sign in with the wallet on that account instead.",
            code: "email_bound_elsewhere",
          },
          { status: 403 }
        ),
      };
    }
    throw e;
  }
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
