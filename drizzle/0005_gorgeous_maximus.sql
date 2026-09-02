CREATE TABLE "bant_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"author_address" text NOT NULL,
	"body" text NOT NULL,
	"evidence_url" text,
	"evidence_type" text,
	"evidence_description" text,
	"evidence_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bant_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" text NOT NULL,
	"stream_id" text NOT NULL,
	"payer_address" text NOT NULL,
	"payee_address" text NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"snapshot" text,
	"snapshot_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bant_rooms_case_id_unique" UNIQUE("case_id")
);
--> statement-breakpoint
ALTER TABLE "cancellation_appeals" ADD COLUMN "bant_uri" text;--> statement-breakpoint
ALTER TABLE "cancellation_appeals" ADD COLUMN "bant_hash" text;--> statement-breakpoint
ALTER TABLE "bant_messages" ADD CONSTRAINT "bant_messages_room_id_bant_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."bant_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bant_messages" ADD CONSTRAINT "bant_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bant_messages_room_idx" ON "bant_messages" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "bant_messages_created_idx" ON "bant_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bant_rooms_stream_idx" ON "bant_rooms" USING btree ("stream_id");