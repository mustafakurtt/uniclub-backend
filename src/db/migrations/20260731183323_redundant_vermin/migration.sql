ALTER INDEX "announcements_club_created_idx" RENAME TO "announcements_club_published_idx";--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "status" "activity_status" DEFAULT 'draft'::"activity_status" NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "visibility" "activity_visibility" DEFAULT 'university'::"activity_visibility" NOT NULL;--> statement-breakpoint
UPDATE "announcements" SET "status" = 'published', "published_at" = "created_at";--> statement-breakpoint
DROP INDEX "announcements_club_published_idx";--> statement-breakpoint
CREATE INDEX "announcements_club_published_idx" ON "announcements" ("club_id","status","pinned" DESC NULLS LAST,"published_at" DESC NULLS LAST);