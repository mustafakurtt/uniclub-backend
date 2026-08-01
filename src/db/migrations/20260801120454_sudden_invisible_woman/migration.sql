CREATE TYPE "club_application_event_type" AS ENUM('revision_requested', 'resubmitted', 'approved', 'rejected');--> statement-breakpoint
ALTER TYPE "application_approval_status" ADD VALUE 'revision_requested';--> statement-breakpoint
ALTER TYPE "application_status" ADD VALUE 'revision_requested';--> statement-breakpoint
CREATE TABLE "club_application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"application_id" uuid NOT NULL,
	"step" integer NOT NULL,
	"event_type" "club_application_event_type" NOT NULL,
	"actor_id" uuid,
	"note" text,
	"proposed_name" varchar(256),
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "club_application_events_application_created_idx" ON "club_application_events" ("application_id","created_at");--> statement-breakpoint
ALTER TABLE "club_application_events" ADD CONSTRAINT "club_application_events_UbNfOK1XWjeh_fkey" FOREIGN KEY ("application_id") REFERENCES "club_applications"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_application_events" ADD CONSTRAINT "club_application_events_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL;