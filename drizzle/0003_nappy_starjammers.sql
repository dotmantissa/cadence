ALTER TABLE "users" ADD COLUMN "notification_email" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_notification_email_unique" ON "users" USING btree ("notification_email");