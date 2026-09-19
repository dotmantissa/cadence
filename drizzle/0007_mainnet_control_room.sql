CREATE TABLE "project_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"fee_recipient" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_settings" ADD CONSTRAINT "project_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "admin_audit_logs_admin_idx" ON "admin_audit_logs" USING btree ("admin_user_id");
--> statement-breakpoint
CREATE INDEX "admin_audit_logs_created_idx" ON "admin_audit_logs" USING btree ("created_at");
