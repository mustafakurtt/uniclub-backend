ALTER TABLE "roles" ADD COLUMN "rank" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "university_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_user_email_idx" ON "users" ("email") WHERE "university_id" is null;