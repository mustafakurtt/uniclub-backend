CREATE TYPE "club_board_seat_type" AS ENUM('principal', 'alternate');--> statement-breakpoint
CREATE TYPE "club_board_title" AS ENUM('president', 'vice_president', 'secretary', 'treasurer', 'member');--> statement-breakpoint
CREATE TYPE "club_board_type" AS ENUM('management', 'audit');--> statement-breakpoint
CREATE TYPE "general_meeting_type" AS ENUM('ordinary', 'extraordinary');--> statement-breakpoint
CREATE TABLE "club_board_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"club_id" uuid NOT NULL,
	"university_id" uuid NOT NULL,
	"general_meeting_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"board_type" "club_board_type" NOT NULL,
	"seat_type" "club_board_seat_type" NOT NULL,
	"title" "club_board_title" NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_general_meeting_attendees" (
	"meeting_id" uuid,
	"club_id" uuid NOT NULL,
	"user_id" uuid,
	"university_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_general_meeting_attendees_pkey" PRIMARY KEY("meeting_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "club_general_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"club_id" uuid NOT NULL,
	"university_id" uuid NOT NULL,
	"academic_term_id" uuid NOT NULL,
	"meeting_type" "general_meeting_type" NOT NULL,
	"held_at" timestamp with time zone NOT NULL,
	"location" varchar(256) NOT NULL,
	"decisions" text NOT NULL,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "club_board_memberships_club_active_idx" ON "club_board_memberships" ("club_id","ended_at");--> statement-breakpoint
CREATE INDEX "club_board_memberships_meeting_idx" ON "club_board_memberships" ("general_meeting_id");--> statement-breakpoint
CREATE INDEX "club_general_meetings_club_held_idx" ON "club_general_meetings" ("club_id","held_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "club_board_memberships" ADD CONSTRAINT "club_board_memberships_iYeyGQ38Cq5p_fkey" FOREIGN KEY ("general_meeting_id") REFERENCES "club_general_meetings"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_board_memberships" ADD CONSTRAINT "club_board_memberships_club_tenant_fkey" FOREIGN KEY ("club_id","university_id") REFERENCES "clubs"("id","university_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_board_memberships" ADD CONSTRAINT "club_board_memberships_user_tenant_fkey" FOREIGN KEY ("user_id","university_id") REFERENCES "users"("id","university_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_general_meeting_attendees" ADD CONSTRAINT "club_general_meeting_attendees_9oRuDc6YsuEm_fkey" FOREIGN KEY ("meeting_id") REFERENCES "club_general_meetings"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_general_meeting_attendees" ADD CONSTRAINT "club_gm_attendees_club_tenant_fkey" FOREIGN KEY ("club_id","university_id") REFERENCES "clubs"("id","university_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_general_meeting_attendees" ADD CONSTRAINT "club_gm_attendees_user_tenant_fkey" FOREIGN KEY ("user_id","university_id") REFERENCES "users"("id","university_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_general_meetings" ADD CONSTRAINT "club_general_meetings_recorded_by_users_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_general_meetings" ADD CONSTRAINT "club_general_meetings_club_tenant_fkey" FOREIGN KEY ("club_id","university_id") REFERENCES "clubs"("id","university_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_general_meetings" ADD CONSTRAINT "club_general_meetings_term_tenant_fkey" FOREIGN KEY ("academic_term_id","university_id") REFERENCES "academic_terms"("id","university_id") ON DELETE RESTRICT;