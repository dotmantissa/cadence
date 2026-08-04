import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Off-chain layer only. Funds and streams live on-chain in PayrollManager;
 * this stores identity, preferences, and work-in-progress that has no business
 * on a blockchain. Never keys, never balances of record.
 */

/** One row per Privy user. `privyId` is the Privy DID (did:privy:...). */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    privyId: text("privy_id").notNull().unique(),
    // Public @handle. Nullable so existing rows backfill lazily; always stored
    // lowercase, so a plain unique index enforces case-insensitive uniqueness.
    username: text("username"),
    // Primary wallet bound to the account (embedded or imported/connected).
    walletAddress: text("wallet_address"),
    email: text("email"),
    displayName: text("display_name"),
    // "employer" | "employee" | null (undecided). Not a security boundary,
    // just which dashboard we land them on.
    role: text("role"),
    // Free-form UI prefs: theme, default rates, notification toggles, etc.
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    walletIdx: index("users_wallet_idx").on(t.walletAddress),
    usernameIdx: uniqueIndex("users_username_unique").on(t.username),
  })
);

/** Address book: people an employer pays, so they aren't retyping 0x strings. */
export const payees = pgTable(
  "payees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    address: text("address").notNull(),
    role: text("role"), // "contracts", "design", free text
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerIdx: index("payees_owner_idx").on(t.ownerId),
  })
);

/**
 * A stream being set up but not yet signed on-chain. Lets someone build a
 * payroll run, leave, and come back. Once it's created on-chain we mark it
 * committed and stash the resulting streamId.
 */
export const streamDrafts = pgTable(
  "stream_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    payeeLabel: text("payee_label"),
    payeeAddress: text("payee_address"),
    // USDC per second, 6-decimal base units, stored as string to keep bigint safe.
    ratePerSecond: numeric("rate_per_second"),
    depositAmount: numeric("deposit_amount"),
    invoiceRef: text("invoice_ref"),
    status: text("status").notNull().default("draft"), // draft | committed
    onchainStreamId: text("onchain_stream_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerIdx: index("stream_drafts_owner_idx").on(t.ownerId),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Payee = typeof payees.$inferSelect;
export type StreamDraft = typeof streamDrafts.$inferSelect;
