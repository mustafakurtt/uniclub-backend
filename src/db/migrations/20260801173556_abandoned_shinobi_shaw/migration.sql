CREATE TYPE "club_application_appeal_status" AS ENUM('pending', 'upheld', 'dismissed');--> statement-breakpoint
ALTER TYPE "club_application_event_type" ADD VALUE IF NOT EXISTS 'checklist_updated';--> statement-breakpoint
ALTER TYPE "club_application_event_type" ADD VALUE IF NOT EXISTS 'appeal_submitted';--> statement-breakpoint
ALTER TYPE "club_application_event_type" ADD VALUE IF NOT EXISTS 'appeal_upheld';--> statement-breakpoint
ALTER TYPE "club_application_event_type" ADD VALUE IF NOT EXISTS 'appeal_dismissed';--> statement-breakpoint
ALTER TABLE "club_applications" ADD COLUMN IF NOT EXISTS "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_applications" ADD COLUMN IF NOT EXISTS "reject_approver_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "club_applications_id_tenant_idx" ON "club_applications" ("id","university_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_application_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"application_id" uuid NOT NULL,
	"university_id" uuid NOT NULL,
	"item_key" varchar(64) NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"note" text,
	"checked_by" uuid,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_application_appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"application_id" uuid NOT NULL,
	"university_id" uuid NOT NULL,
	"applicant_id" uuid NOT NULL,
	"note" text NOT NULL,
	"status" "club_application_appeal_status" DEFAULT 'pending'::"club_application_appeal_status" NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"same_actor_as_rejector" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "club_application_checklist_item_idx" ON "club_application_checklist_items" ("application_id","item_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "club_application_appeals_application_idx" ON "club_application_appeals" ("application_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_application_checklist_items" ADD CONSTRAINT "club_application_checklist_items_application_id_club_applications_id_fkey" FOREIGN KEY ("application_id") REFERENCES "club_applications"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_application_checklist_items" ADD CONSTRAINT "club_application_checklist_items_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_application_checklist_items" ADD CONSTRAINT "club_application_checklist_items_checked_by_users_id_fkey" FOREIGN KEY ("checked_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_application_checklist_items" ADD CONSTRAINT "club_application_checklist_application_tenant_fkey" FOREIGN KEY ("application_id","university_id") REFERENCES "club_applications"("id","university_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_application_appeals" ADD CONSTRAINT "club_application_appeals_application_id_club_applications_id_fkey" FOREIGN KEY ("application_id") REFERENCES "club_applications"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_application_appeals" ADD CONSTRAINT "club_application_appeals_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_application_appeals" ADD CONSTRAINT "club_application_appeals_reviewed_by_users_id_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_application_appeals" ADD CONSTRAINT "club_application_appeals_application_tenant_fkey" FOREIGN KEY ("application_id","university_id") REFERENCES "club_applications"("id","university_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_application_appeals" ADD CONSTRAINT "club_application_appeals_applicant_tenant_fkey" FOREIGN KEY ("applicant_id","university_id") REFERENCES "users"("id","university_id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_applications" ADD CONSTRAINT "club_applications_reject_approver_id_users_id_fkey" FOREIGN KEY ("reject_approver_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
