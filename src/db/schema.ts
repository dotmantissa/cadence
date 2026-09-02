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
    // When the handle was last *changed* (not first set). Null until the first
    // change, so a first-time set via the gate never starts the 14-day cooldown.
    usernameChangedAt: timestamp("username_changed_at", { withTimezone: true }),
    // Primary wallet bound to the account (embedded or imported/connected).
    walletAddress: text("wallet_address"),
    email: text("email"),
    // A notification-only email a wallet-first user opted to add. Unlike `email`
    // (which mirrors the Privy login identity), this NEVER becomes a login: no
    // wallet is minted for it and it cannot be used to sign in. Stored lowercase;
    // guarded so one address is never bound to two accounts.
    notificationEmail: text("notification_email"),
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
    // Nulls stay distinct in Postgres, so unbound accounts don't collide; two
    // accounts can never hold the same notification email.
    notificationEmailIdx: uniqueIndex("users_notification_email_unique").on(
      t.notificationEmail
    ),
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

export type AppealEvidenceSource = {
  type:
    | "agreement"
    | "work_product"
    | "invoice"
    | "communication"
    | "acceptance_record"
    | "payment_record"
    | "identity_record"
    | "other";
  url: string;
  sha256: string;
  description: string;
};

/**
 * Off-chain orchestration for a cross-chain appeal. Arc remains authoritative
 * for the escrow and GenLayer remains authoritative for the verdict; this row
 * stores the committed evidence package and transaction progress so repeated
 * dashboard polls can advance the workflow idempotently.
 */
export const cancellationAppeals = pgTable(
  "cancellation_appeals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    caseId: text("case_id").notNull().unique(),
    streamId: text("stream_id").notNull(),
    cancellationNonce: text("cancellation_nonce").notNull(),
    payerAddress: text("payer_address").notNull(),
    payeeAddress: text("payee_address").notNull(),
    evidenceUri: text("evidence_uri").notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    evidencePackage: text("evidence_package").notNull(),
    sources: jsonb("sources").$type<AppealEvidenceSource[]>().notNull(),
    status: text("status").notNull().default("prepared"),
    fileTxHash: text("file_tx_hash"),
    adjudicationTxHash: text("adjudication_tx_hash"),
    relayTxHash: text("relay_tx_hash"),
    bantUri: text("bant_uri"),
    bantHash: text("bant_hash"),
    verdict: jsonb("verdict").$type<Record<string, unknown>>(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerIdx: index("cancellation_appeals_owner_idx").on(t.ownerId),
    streamIdx: index("cancellation_appeals_stream_idx").on(t.streamId),
  })
);

export const bantRooms = pgTable(
  "bant_rooms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: text("case_id").notNull().unique(),
    streamId: text("stream_id").notNull(),
    payerAddress: text("payer_address").notNull(),
    payeeAddress: text("payee_address").notNull(),
    opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("open"), // open | closed
    snapshot: text("snapshot"),
    snapshotHash: text("snapshot_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    streamIdx: index("bant_rooms_stream_idx").on(t.streamId),
  })
);

export const bantMessages = pgTable(
  "bant_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => bantRooms.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorAddress: text("author_address").notNull(),
    body: text("body").notNull(),
    evidenceUrl: text("evidence_url"),
    evidenceType: text("evidence_type"),
    evidenceDescription: text("evidence_description"),
    evidenceHash: text("evidence_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    roomIdx: index("bant_messages_room_idx").on(t.roomId),
    createdIdx: index("bant_messages_created_idx").on(t.createdAt),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Payee = typeof payees.$inferSelect;
export type StreamDraft = typeof streamDrafts.$inferSelect;
export type CancellationAppeal = typeof cancellationAppeals.$inferSelect;
export type BantRoom = typeof bantRooms.$inferSelect;
export type BantMessage = typeof bantMessages.$inferSelect;
