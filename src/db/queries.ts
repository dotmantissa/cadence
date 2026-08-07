import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./index";
import { users, payees, streamDrafts } from "./schema";
import type { Caller } from "@/lib/privy-server";
import { PROFILE_RESERVED, USERNAME_COOLDOWN_MS } from "@/lib/username";

/**
 * Fetch the users row for a caller, creating it on first sight and keeping the
 * linked email/wallet in sync on every login. This is the single entry point
 * every authenticated route uses to resolve a Privy DID to our internal id.
 */
export async function upsertUser(caller: Caller) {
  const [row] = await db
    .insert(users)
    .values({
      privyId: caller.privyId,
      email: caller.email,
      walletAddress: caller.walletAddress,
    })
    .onConflictDoUpdate({
      target: users.privyId,
      set: {
        // Only overwrite with a real value; don't clobber a stored address if
        // the token lookup came back empty this time.
        ...(caller.email ? { email: caller.email } : {}),
        ...(caller.walletAddress ? { walletAddress: caller.walletAddress } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function updateProfile(
  userId: string,
  patch: {
    displayName?: string | null;
    role?: string | null;
    settings?: Record<string, unknown>;
  }
) {
  const [row] = await db
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return row;
}

/** Postgres unique-violation. Lets us turn a race into a clean "taken". */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "23505"
  );
}

/** Case-insensitive lookup by handle (handles are stored lowercase). */
export async function getUserByUsername(username: string) {
  const value = username.trim().toLowerCase();
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.username, value))
    .limit(1);
  return row ?? null;
}

/**
 * Reverse-resolve a batch of wallet addresses to the public handle behind each,
 * so a payer/payee can see "who" a stream's counterparty is instead of a raw
 * 0x… . Case-insensitive (addresses may be stored checksummed). Returns a map
 * from lowercased address → { username, displayName }; only addresses that map
 * to a known user appear. Never returns email or any other private field.
 */
export async function getPublicIdentitiesByAddresses(
  addresses: string[]
): Promise<Record<string, { username: string | null; displayName: string | null }>> {
  const cleaned = Array.from(
    new Set(addresses.map((a) => a.trim().toLowerCase()).filter((a) => /^0x[0-9a-f]{40}$/.test(a)))
  );
  if (cleaned.length === 0) return {};

  const rows = await db
    .select({
      walletAddress: users.walletAddress,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(inArray(sql`lower(${users.walletAddress})`, cleaned));

  const map: Record<string, { username: string | null; displayName: string | null }> = {};
  for (const r of rows) {
    if (!r.walletAddress) continue;
    map[r.walletAddress.toLowerCase()] = { username: r.username, displayName: r.displayName };
  }
  return map;
}

/**
 * Forward-resolve a batch of @handles to the wallet behind each, in one query,
 * so a batch payment can look up many payees at once instead of firing a lookup
 * per row. Case-insensitive (handles are stored lowercase). Returns a map from
 * lowercased handle → { walletAddress, displayName }; only handles that map to a
 * known user appear. Never returns email or any other private field.
 */
export async function getUsersByUsernames(
  usernames: string[]
): Promise<Record<string, { walletAddress: string | null; displayName: string | null }>> {
  const cleaned = Array.from(
    new Set(usernames.map((u) => u.trim().toLowerCase()).filter((u) => u.length > 0))
  );
  if (cleaned.length === 0) return {};

  const rows = await db
    .select({
      walletAddress: users.walletAddress,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(inArray(users.username, cleaned));

  const map: Record<string, { walletAddress: string | null; displayName: string | null }> = {};
  for (const r of rows) {
    if (!r.username) continue;
    map[r.username.toLowerCase()] = {
      walletAddress: r.walletAddress,
      displayName: r.displayName,
    };
  }
  return map;
}

/**
 * Whether a handle can still be claimed. Reserved words are never available;
 * otherwise it's free only if no row holds it. Assumes the caller has already
 * validated the format.
 */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const value = username.trim().toLowerCase();
  if (PROFILE_RESERVED.has(value)) return false;
  const existing = await getUserByUsername(value);
  return existing === null;
}

/**
 * Claim a handle for a user. Writes lowercase and relies on the unique index to
 * settle races: if two people grab the same name at once, the loser gets a
 * 23505 and we report it as taken rather than throwing.
 *
 * Rate-limiting: a *change* (the row already has a handle) is allowed at most
 * once every 14 days, measured from the last change. A first-time set — the
 * blocking gate every new user passes through — is never a change, so it neither
 * blocks nor starts the clock; the first later change is free and starts it.
 * Re-submitting the exact same handle is a no-op, not a change.
 */
export async function setUsername(
  userId: string,
  username: string
): Promise<
  | { user: typeof users.$inferSelect }
  | { taken: true }
  | { cooldown: true; nextAt: Date }
> {
  const value = username.trim().toLowerCase();

  const [current] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!current) throw new Error("user not found");

  // Idempotent: setting the handle you already hold isn't a change.
  if (current.username === value) return { user: current };

  const isChange = current.username != null;
  if (isChange && current.usernameChangedAt) {
    const nextAt = new Date(
      current.usernameChangedAt.getTime() + USERNAME_COOLDOWN_MS
    );
    if (nextAt.getTime() > Date.now()) return { cooldown: true, nextAt };
  }

  try {
    const [row] = await db
      .update(users)
      .set({
        username: value,
        updatedAt: new Date(),
        // Start the cooldown only on a real change; a first-time set leaves it
        // null so the user can still correct a fresh handle.
        ...(isChange ? { usernameChangedAt: new Date() } : {}),
      })
      .where(eq(users.id, userId))
      .returning();
    return { user: row };
  } catch (e) {
    if (isUniqueViolation(e)) return { taken: true };
    throw e;
  }
}

export async function listPayees(ownerId: string) {
  return db
    .select()
    .from(payees)
    .where(eq(payees.ownerId, ownerId))
    .orderBy(desc(payees.createdAt));
}

export async function addPayee(
  ownerId: string,
  input: { label: string; address: string; role?: string | null; note?: string | null }
) {
  const [row] = await db
    .insert(payees)
    .values({ ownerId, ...input })
    .returning();
  return row;
}

export async function deletePayee(ownerId: string, id: string) {
  const [row] = await db
    .delete(payees)
    .where(and(eq(payees.id, id), eq(payees.ownerId, ownerId)))
    .returning();
  return row ?? null;
}

export async function listDrafts(ownerId: string) {
  return db
    .select()
    .from(streamDrafts)
    .where(eq(streamDrafts.ownerId, ownerId))
    .orderBy(desc(streamDrafts.updatedAt));
}

export async function saveDraft(
  ownerId: string,
  input: {
    id?: string;
    payeeLabel?: string | null;
    payeeAddress?: string | null;
    ratePerSecond?: string | null;
    depositAmount?: string | null;
    invoiceRef?: string | null;
    status?: string;
    onchainStreamId?: string | null;
  }
) {
  // Update in place when an id is supplied and the draft belongs to the caller,
  // otherwise create a fresh draft.
  if (input.id) {
    const { id, ...rest } = input;
    const [row] = await db
      .update(streamDrafts)
      .set({ ...rest, updatedAt: new Date() })
      .where(and(eq(streamDrafts.id, id), eq(streamDrafts.ownerId, ownerId)))
      .returning();
    if (row) return row;
  }
  const { id: _ignore, ...rest } = input;
  void _ignore;
  const [row] = await db
    .insert(streamDrafts)
    .values({ ownerId, ...rest })
    .returning();
  return row;
}

export async function deleteDraft(ownerId: string, id: string) {
  const [row] = await db
    .delete(streamDrafts)
    .where(and(eq(streamDrafts.id, id), eq(streamDrafts.ownerId, ownerId)))
    .returning();
  return row ?? null;
}
