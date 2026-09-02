CREATE TABLE "cancellation_appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"case_id" text NOT NULL,
	"stream_id" text NOT NULL,
	"cancellation_nonce" text NOT NULL,
	"payer_address" text NOT NULL,
	"payee_address" text NOT NULL,
	"evidence_uri" text NOT NULL,
	"evidence_hash" text NOT NULL,
	"evidence_package" text NOT NULL,
	"sources" jsonb NOT NULL,
	"status" text DEFAULT 'prepared' NOT NULL,
	"file_tx_hash" text,
	"adjudication_tx_hash" text,
	"relay_tx_hash" text,
	"verdict" jsonb,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cancellation_appeals_case_id_unique" UNIQUE("case_id")
);
--> statement-breakpoint
ALTER TABLE "cancellation_appeals" ADD CONSTRAINT "cancellation_appeals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cancellation_appeals_owner_idx" ON "cancellation_appeals" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "cancellation_appeals_stream_idx" ON "cancellation_appeals" USING btree ("stream_id");