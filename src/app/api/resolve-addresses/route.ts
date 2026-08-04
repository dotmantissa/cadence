import { NextResponse } from "next/server";
import { requireUser, badRequest } from "../_auth";
import { getPublicIdentitiesByAddresses } from "@/db/queries";

// Auth relies on runtime headers, so this is always dynamic.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reverse-resolve a batch of wallet addresses to the public handle behind each,
 * so a stream list can search/label counterparties by @username instead of only
 * a raw 0x…. Auth-gated. POST `{ addresses: string[] }` →
 * `{ identities: { [lowercasedAddress]: { username, displayName } } }`.
 * Only public identity fields are returned — never email.
 */
export async function POST(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("expected a JSON body");
  }

  const addresses = (body as { addresses?: unknown })?.addresses;
  if (!Array.isArray(addresses) || addresses.some((a) => typeof a !== "string")) {
    return badRequest("addresses must be an array of strings");
  }
  // Bound the batch so a single request can't ask for the world.
  if (addresses.length > 200) {
    return badRequest("too many addresses (max 200)");
  }

  const identities = await getPublicIdentitiesByAddresses(addresses as string[]);
  return NextResponse.json({ identities });
}
