CREATE TYPE "academic_term_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "club_membership_event_type" AS ENUM('joined', 'role_changed', 'removed', 'left', 'join_rejected');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "academic_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"university_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "academic_term_status" DEFAULT 'open'::"academic_term_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_terms_id_university_unique" UNIQUE("id","university_id"),
	CONSTRAINT "academic_terms_ends_after_starts" CHECK ("ends_at" > "starts_at")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_membership_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"club_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"university_id" uuid NOT NULL,
	"event_type" "club_membership_event_type" NOT NULL,
	"role" "club_role",
	"previous_role" "club_role",
	"academic_term_id" uuid,
	"actor_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "academic_terms_university_starts_idx" ON "academic_terms" ("university_id","starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_membership_events_club_occurred_idx" ON "club_membership_events" ("club_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_membership_events_term_idx" ON "club_membership_events" ("academic_term_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_membership_events" ADD CONSTRAINT "club_membership_events_academic_term_id_academic_terms_id_fkey" FOREIGN KEY ("academic_term_id") REFERENCES "academic_terms"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_membership_events" ADD CONSTRAINT "club_membership_events_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_membership_events" ADD CONSTRAINT "club_membership_events_club_tenant_fkey" FOREIGN KEY ("club_id","university_id") REFERENCES "clubs"("id","university_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_membership_events" ADD CONSTRAINT "club_membership_events_user_tenant_fkey" FOREIGN KEY ("user_id","university_id") REFERENCES "users"("id","university_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_no_overlap" EXCLUDE USING gist (
	"university_id" WITH =,
	tstzrange("starts_at", "ends_at", '[]') WITH &&
);--> statement-breakpoint
INSERT INTO "club_membership_events" ("club_id", "user_id", "university_id", "event_type", "role", "occurred_at")
SELECT
	"club_id",
	"user_id",
	"university_id",
	'joined'::"club_membership_event_type",
	"role",
	"joined_at"
FROM "club_members"
WHERE "status" = 'approved' AND "left_at" IS NULL;
