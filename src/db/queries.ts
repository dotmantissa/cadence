import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "./index";
import { users, payees, streamDrafts } from "./schema";
import type { Caller } from "@/lib/privy-server";

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
