import "server-only";

import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "./index";
import {
  users,
  payees,
  streamDrafts,
  cancellationAppeals,
  bantRooms,
  bantMessages,
  type AppealEvidenceSource,
} from "./schema";
import type { Caller } from "@/lib/privy-server";
import { PROFILE_RESERVED, USERNAME_COOLDOWN_MS } from "@/lib/username";

/**
 * Thrown when a login's email is already claimed by a different account, most
 * often because a wallet-first user added it as their notification email. The
 * login must not proceed: the owner signs in with their wallet, not this email.
 */
export class EmailBoundElsewhereError extends Error {
  constructor() {
    super("email_bound_elsewhere");
    this.name = "EmailBoundElsewhereError";
  }
}

/**
 * Is `email` already held by some account other than `exceptPrivyId`, as either
 * its login email or its notification email? One query across both columns, so
 * an address is unique across the whole users table regardless of how it got
 * there. Case-insensitive.
 */
async function emailOwnerExists(
  email: string,
  exceptPrivyId?: string
): Promise<boolean> {
  const value = email.trim().toLowerCase();
  const match = or(
    eq(sql`lower(${users.email})`, value),
    eq(sql`lower(${users.notificationEmail})`, value)
  );
  const [row] = await db
    .select({ privyId: users.privyId })
    .from(users)
    .where(exceptPrivyId ? and(match, ne(users.privyId, exceptPrivyId)) : match)
    .limit(1);
  return row != null;
}

/**
 * Fetch the users row for a caller, creating it on first sight and keeping the
 * linked email/wallet in sync on every login. This is the single entry point
 * every authenticated route uses to resolve a Privy DID to our internal id.
 *
 * Guard: if the caller signs in with an email that another account already owns
 * (a wallet user bound it for notifications), we refuse rather than mint a
 * second account for it. Callers turn this into a 403 the client acts on.
 */
export async function upsertUser(caller: Caller) {
  if (caller.email && (await emailOwnerExists(caller.email, caller.privyId))) {
    throw new EmailBoundElsewhereError();
  }
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

/**
 * Bind (or replace) a wallet user's notification-only email. Returns the fresh
 * row, or `{ conflict: true }` when the address is already tied to another
 * account. The unique index is the final backstop: if two binds race, the loser
 * gets a 23505 and we report it as a conflict rather than throwing.
 */
export async function setNotificationEmail(
  userId: string,
  privyId: string,
  email: string
): Promise<{ user: typeof users.$inferSelect } | { conflict: true }> {
  const value = email.trim().toLowerCase();
  if (await emailOwnerExists(value, privyId)) return { conflict: true };
  try {
    const [row] = await db
      .update(users)
      .set({ notificationEmail: value, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return { user: row };
  } catch (e) {
    if (isUniqueViolation(e)) return { conflict: true };
    throw e;
  }
}

/** Remove a wallet user's notification email. */
export async function clearNotificationEmail(userId: string) {
  const [row] = await db
    .update(users)
    .set({ notificationEmail: null, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return row;
}

/**
 * Resolve a wallet address to whatever email we can notify at, plus the public
 * identity for greeting copy. Returns null when the address maps to no account.
 * The email is for server-side sending only and must never be sent to a client.
 */
export async function getNotifiableByAddress(
  address: string
): Promise<
  | {
      email: string | null;
      username: string | null;
      displayName: string | null;
      settings: Record<string, unknown> | null;
    }
  | null
> {
  const value = address.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(value)) return null;
  const [row] = await db
    .select({
      email: users.email,
      notificationEmail: users.notificationEmail,
      username: users.username,
      displayName: users.displayName,
      settings: users.settings,
    })
    .from(users)
    .where(eq(sql`lower(${users.walletAddress})`, value))
    .limit(1);
  if (!row) return null;
  return {
    email: row.email ?? row.notificationEmail,
    username: row.username,
    displayName: row.displayName,
    // Carried so the send gate can respect this recipient's own notification
    // toggles, not just the caller's.
    settings: row.settings,
  };
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

export async function getCancellationAppeal(caseId: string) {
  const [row] = await db
    .select()
    .from(cancellationAppeals)
    .where(eq(cancellationAppeals.caseId, caseId))
    .limit(1);
  return row ?? null;
}

export async function prepareCancellationAppeal(input: {
  ownerId: string;
  caseId: string;
  streamId: string;
  payrollAddress: string;
  cancellationNonce: string;
  payerAddress: string;
  payeeAddress: string;
  evidenceUri: string;
  evidenceHash: string;
  evidencePackage: string;
  sources: AppealEvidenceSource[];
}) {
  const existing = await getCancellationAppeal(input.caseId);
  if (existing) return existing;
  const [row] = await db
    .insert(cancellationAppeals)
    .values(input)
    .returning();
  return row;
}

export async function updateCancellationAppeal(
  caseId: string,
  patch: Partial<{
    status: string;
    fileTxHash: string | null;
    adjudicationTxHash: string | null;
    relayTxHash: string | null;
    bantUri: string | null;
    bantHash: string | null;
    verdict: Record<string, unknown> | null;
    lastError: string | null;
  }>
) {
  const [row] = await db
    .update(cancellationAppeals)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(cancellationAppeals.caseId, caseId))
    .returning();
  return row ?? null;
}

/**
 * Atomically claim one workflow transition. Only one concurrent dashboard poll
 * can move a row out of the expected state and submit the next transaction.
 */
export async function claimCancellationAppeal(
  caseId: string,
  expectedStatuses: string[],
  nextStatus: string
) {
  if (expectedStatuses.length === 0) return null;
  const [row] = await db
    .update(cancellationAppeals)
    .set({ status: nextStatus, lastError: null, updatedAt: new Date() })
    .where(
      and(
        eq(cancellationAppeals.caseId, caseId),
        inArray(cancellationAppeals.status, expectedStatuses)
      )
    )
    .returning();
  return row ?? null;
}

export async function getBantRoom(caseId: string) {
  const [row] = await db
    .select()
    .from(bantRooms)
    .where(eq(bantRooms.caseId, caseId))
    .limit(1);
  return row ?? null;
}

export async function getBantMessages(roomId: string) {
  return db
    .select()
    .from(bantMessages)
    .where(eq(bantMessages.roomId, roomId))
    .orderBy(asc(bantMessages.createdAt));
}

export async function getBantMessageById(id: string) {
  const [row] = await db
    .select()
    .from(bantMessages)
    .where(eq(bantMessages.id, id))
    .limit(1);
  return row ?? null;
}

export async function ensureBantRoom(input: {
  caseId: string;
  streamId: string;
  payerAddress: string;
  payeeAddress: string;
  opensAt: Date;
  closesAt: Date;
}) {
  const existing = await getBantRoom(input.caseId);
  if (existing) return existing;
  const [row] = await db
    .insert(bantRooms)
    .values(input)
    .onConflictDoNothing({ target: bantRooms.caseId })
    .returning();
  return row ?? (await getBantRoom(input.caseId));
}

export async function addBantMessage(input: {
  roomId: string;
  authorUserId: string;
  authorAddress: string;
  body: string;
  evidenceUrl?: string | null;
  evidenceType?: string | null;
  evidenceDescription?: string | null;
  evidenceHash?: string | null;
}) {
  const [row] = await db.insert(bantMessages).values(input).returning();
  return row;
}

export async function closeBantRoom(
  caseId: string,
  snapshot: string,
  snapshotHash: string
) {
  const [row] = await db
    .update(bantRooms)
    .set({
      status: "closed",
      snapshot,
      snapshotHash,
      updatedAt: new Date(),
    })
    .where(and(eq(bantRooms.caseId, caseId), eq(bantRooms.status, "open")))
    .returning();
  return row ?? (await getBantRoom(caseId));
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
