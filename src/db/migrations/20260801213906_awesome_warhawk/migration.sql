CREATE TABLE "club_handover_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"club_id" uuid NOT NULL,
	"university_id" uuid NOT NULL,
	"academic_term_id" uuid NOT NULL,
	"general_meeting_id" uuid NOT NULL,
	"handover_at" timestamp with time zone NOT NULL,
	"recorded_by" uuid NOT NULL,
	"outgoing_board_snapshot" jsonb NOT NULL,
	"incoming_board_snapshot" jsonb NOT NULL,
	"transferred_items" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "club_handover_records_meeting_unique" ON "club_handover_records" ("general_meeting_id");--> statement-breakpoint
CREATE INDEX "club_handover_records_club_idx" ON "club_handover_records" ("club_id","handover_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "club_handover_records" ADD CONSTRAINT "club_handover_records_academic_term_id_academic_terms_id_fkey" FOREIGN KEY ("academic_term_id") REFERENCES "academic_terms"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_handover_records" ADD CONSTRAINT "club_handover_records_XQUnPH72mTrH_fkey" FOREIGN KEY ("general_meeting_id") REFERENCES "club_general_meetings"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_handover_records" ADD CONSTRAINT "club_handover_records_recorded_by_users_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_handover_records" ADD CONSTRAINT "club_handover_records_club_tenant_fkey" FOREIGN KEY ("club_id","university_id") REFERENCES "clubs"("id","university_id") ON DELETE CASCADE;