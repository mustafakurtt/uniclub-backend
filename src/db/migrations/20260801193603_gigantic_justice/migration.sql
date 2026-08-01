CREATE TYPE "club_advisor_invitation_status" AS ENUM('pending', 'accepted', 'declined', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "club_advisor_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"club_id" uuid NOT NULL,
	"university_id" uuid NOT NULL,
	"invitee_user_id" uuid NOT NULL,
	"invited_by" uuid,
	"status" "club_advisor_invitation_status" DEFAULT 'pending'::"club_advisor_invitation_status" NOT NULL,
	"message" text,
	"decline_reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_advisors" ADD COLUMN "left_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_advisors" ADD COLUMN "leave_reason" text;--> statement-breakpoint
CREATE INDEX "club_advisor_invitations_club_status_idx" ON "club_advisor_invitations" ("club_id","status");--> statement-breakpoint
CREATE INDEX "club_advisor_invitations_invitee_status_idx" ON "club_advisor_invitations" ("invitee_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "club_advisor_invitations_pending_pair_idx" ON "club_advisor_invitations" ("club_id","invitee_user_id") WHERE status = 'pending';--> statement-breakpoint
ALTER TABLE "club_advisor_invitations" ADD CONSTRAINT "club_advisor_invitations_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_advisor_invitations" ADD CONSTRAINT "club_advisor_invitations_invited_by_users_id_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "club_advisor_invitations" ADD CONSTRAINT "club_advisor_invitations_club_tenant_fkey" FOREIGN KEY ("club_id","university_id") REFERENCES "clubs"("id","university_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_advisor_invitations" ADD CONSTRAINT "club_advisor_invitations_invitee_tenant_fkey" FOREIGN KEY ("invitee_user_id","university_id") REFERENCES "users"("id","university_id") ON DELETE RESTRICT;