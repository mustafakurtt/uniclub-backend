-- club_id NULL = okul geneli duyuru. Bileşik (club_id, university_id)→clubs FK Postgres
-- MATCH SIMPLE'da club_id NULL olduğunda uygulanmaz; tenant university_id→universities FK ile korunur.
ALTER TABLE "announcements" ALTER COLUMN "club_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "announcements_university_published_idx" ON "announcements" ("university_id","status","pinned" DESC NULLS LAST,"published_at" DESC NULLS LAST) WHERE "club_id" is null;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_club_id_clubs_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;
