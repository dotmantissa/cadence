CREATE TABLE "payees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"label" text NOT NULL,
	"address" text NOT NULL,
	"role" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"payee_label" text,
	"payee_address" text,
	"rate_per_second" numeric,
	"deposit_amount" numeric,
	"invoice_ref" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"onchain_stream_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"privy_id" text NOT NULL,
	"wallet_address" text,
	"email" text,
	"display_name" text,
	"role" text,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_privy_id_unique" UNIQUE("privy_id")
);
--> statement-breakpoint
ALTER TABLE "payees" ADD CONSTRAINT "payees_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_drafts" ADD CONSTRAINT "stream_drafts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payees_owner_idx" ON "payees" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "stream_drafts_owner_idx" ON "stream_drafts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "users_wallet_idx" ON "users" USING btree ("wallet_address");