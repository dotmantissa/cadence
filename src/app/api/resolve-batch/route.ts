import { NextResponse } from "next/server";
import { requireUser, badRequest } from "../_auth";
import { getPublicIdentitiesByAddresses, getUsersByUsernames } from "@/db/queries";
import { validateUsername } from "@/lib/username";

// Auth relies on runtime headers, so this is always dynamic.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** One resolved entry, in the same order it was sent. */
type Resolved = {
  input: string;
  kind: "address" | "username";
  status: "resolved" | "not_found" | "invalid";
  walletAddress: string | null;
  username: string | null;
  displayName: string | null;
  error?: string;
};

/**
 * Resolve a mixed batch of recipient entries (raw 0x addresses and/or @handles)
 * to wallets in a single round-trip, so a batch payment can validate a whole
 * recipient list at once instead of firing a request per row. Auth-gated.
 *
 * A recipient must be a registered Cadence user: a syntactically valid address
 * that no account holds resolves to `not_found`, mirroring the single-stream
 * flow. Only public identity fields are ever returned, never email.
 *
 * POST `{ entries: string[] }` → `{ results: Resolved[] }` (order preserved).
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

  const entries = (body as { entries?: unknown })?.entries;
  if (!Array.isArray(entries) || entries.some((e) => typeof e !== "string")) {
    return badRequest("entries must be an array of strings");
  }
  if (entries.length > 200) {
    return badRequest("too many entries (max 200)");
  }

  // Classify each entry once, collecting the addresses and handles we need to
  // look up in two batched queries.
  type Pending =
    | { kind: "address"; input: string; address: string }
    | { kind: "username"; input: string; handle: string }
    | { kind: "invalid"; input: string; error: string };

  const pending: Pending[] = (entries as string[]).map((raw) => {
    const trimmed = raw.trim();
    if (trimmed === "") return { kind: "invalid", input: raw, error: "empty entry" };
    if (ADDRESS_RE.test(trimmed)) {
      return { kind: "address", input: raw, address: trimmed.toLowerCase() };
    }
    if (trimmed.startsWith("0x")) {
      return { kind: "invalid", input: raw, error: "not a valid wallet address" };
    }
    const check = validateUsername(trimmed.replace(/^@/, ""));
    if (!check.ok) return { kind: "invalid", input: raw, error: check.error };
    return { kind: "username", input: raw, handle: check.value };
  });

  const addresses = pending.filter((p) => p.kind === "address").map((p) => p.address);
  const handles = pending.filter((p) => p.kind === "username").map((p) => p.handle);

  type AddressMap = Record<string, { username: string | null; displayName: string | null }>;
  type HandleMap = Record<string, { walletAddress: string | null; displayName: string | null }>;

  const [byAddress, byHandle] = await Promise.all([
    addresses.length
      ? getPublicIdentitiesByAddresses(addresses)
      : Promise.resolve({} as AddressMap),
    handles.length ? getUsersByUsernames(handles) : Promise.resolve({} as HandleMap),
  ]);

  const results: Resolved[] = pending.map((p) => {
    if (p.kind === "invalid") {
      return {
        input: p.input,
        kind: "address",
        status: "invalid",
        walletAddress: null,
        username: null,
        displayName: null,
        error: p.error,
      };
    }
    if (p.kind === "address") {
      const id = byAddress[p.address];
      if (!id) {
        return {
          input: p.input,
          kind: "address",
          status: "not_found",
          walletAddress: null,
          username: null,
          displayName: null,
          error: "not signed up on Cadence yet",
        };
      }
      return {
        input: p.input,
        kind: "address",
        status: "resolved",
        walletAddress: p.address,
        username: id.username,
        displayName: id.displayName,
      };
    }
    // username
    const found = byHandle[p.handle];
    if (!found || !found.walletAddress) {
      return {
        input: p.input,
        kind: "username",
        status: "not_found",
        walletAddress: null,
        username: null,
        displayName: null,
        error: found ? "that handle has no wallet yet" : "no one goes by that handle",
      };
    }
    return {
      input: p.input,
      kind: "username",
      status: "resolved",
      walletAddress: found.walletAddress.toLowerCase(),
      username: p.handle,
      displayName: found.displayName,
    };
  });

  return NextResponse.json({ results });
}
