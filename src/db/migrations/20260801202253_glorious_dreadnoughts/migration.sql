CREATE TYPE "club_application_committee_vote" AS ENUM('approve', 'reject');--> statement-breakpoint
CREATE TYPE "application_approval_step_kind" AS ENUM('role_sequential', 'committee_majority');--> statement-breakpoint
CREATE TABLE "approval_committee_members" (
	"committee_id" uuid,
	"user_id" uuid,
	"university_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_committee_members_pkey" PRIMARY KEY("committee_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "approval_committees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"university_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_committees_id_university_unique" UNIQUE("id","university_id")
);
--> statement-breakpoint
CREATE TABLE "club_application_committee_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"application_id" uuid NOT NULL,
	"university_id" uuid NOT NULL,
	"approval_step" integer NOT NULL,
	"committee_id" uuid NOT NULL,
	"voter_user_id" uuid NOT NULL,
	"vote" "club_application_committee_vote" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_application_approvals" ADD COLUMN "step_kind" "application_approval_step_kind" DEFAULT 'role_sequential'::"application_approval_step_kind" NOT NULL;--> statement-breakpoint
ALTER TABLE "club_application_approvals" ADD COLUMN "committee_id" uuid;--> statement-breakpoint
CREATE INDEX "approval_committees_university_idx" ON "approval_committees" ("university_id");--> statement-breakpoint
CREATE UNIQUE INDEX "club_app_committee_votes_pair_idx" ON "club_application_committee_votes" ("application_id","approval_step","voter_user_id");--> statement-breakpoint
CREATE INDEX "club_app_committee_votes_application_step_idx" ON "club_application_committee_votes" ("application_id","approval_step");--> statement-breakpoint
ALTER TABLE "approval_committee_members" ADD CONSTRAINT "approval_committee_members_2h5H6obZjdhY_fkey" FOREIGN KEY ("committee_id") REFERENCES "approval_committees"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_committee_members" ADD CONSTRAINT "approval_committee_members_user_tenant_fkey" FOREIGN KEY ("user_id","university_id") REFERENCES "users"("id","university_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "approval_committee_members" ADD CONSTRAINT "approval_committee_members_committee_tenant_fkey" FOREIGN KEY ("committee_id","university_id") REFERENCES "approval_committees"("id","university_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_committees" ADD CONSTRAINT "approval_committees_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_application_approvals" ADD CONSTRAINT "club_application_approvals_Nexsigd3izwJ_fkey" FOREIGN KEY ("committee_id") REFERENCES "approval_committees"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_application_committee_votes" ADD CONSTRAINT "club_application_committee_votes_R188mrAIeDRJ_fkey" FOREIGN KEY ("application_id") REFERENCES "club_applications"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_application_committee_votes" ADD CONSTRAINT "club_application_committee_votes_WCJGCsL1fJyk_fkey" FOREIGN KEY ("committee_id") REFERENCES "approval_committees"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_application_committee_votes" ADD CONSTRAINT "club_app_committee_votes_application_tenant_fkey" FOREIGN KEY ("application_id","university_id") REFERENCES "club_applications"("id","university_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_application_committee_votes" ADD CONSTRAINT "club_app_committee_votes_voter_tenant_fkey" FOREIGN KEY ("voter_user_id","university_id") REFERENCES "users"("id","university_id") ON DELETE RESTRICT;