ALTER TABLE "announcements" ADD COLUMN "scheduled_publish_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "scheduled_publish_at" timestamp with time zone;