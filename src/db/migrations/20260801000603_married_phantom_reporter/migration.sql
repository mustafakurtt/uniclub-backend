CREATE TYPE "poster_qr_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TYPE "poster_qr_target_type" AS ENUM('club', 'activity');--> statement-breakpoint
CREATE TABLE "poster_qr_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"university_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL UNIQUE,
	"status" "poster_qr_status" DEFAULT 'active'::"poster_qr_status" NOT NULL,
	"source_label" varchar(128) NOT NULL,
	"target_type" "poster_qr_target_type" NOT NULL,
	"target_club_id" uuid,
	"target_activity_id" uuid,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"scan_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poster_qr_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"qr_code_id" uuid NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "poster_qr_codes" ADD CONSTRAINT "poster_qr_codes_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "poster_qr_codes" ADD CONSTRAINT "poster_qr_codes_target_club_id_clubs_id_fkey" FOREIGN KEY ("target_club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "poster_qr_codes" ADD CONSTRAINT "poster_qr_codes_target_activity_id_activities_id_fkey" FOREIGN KEY ("target_activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "poster_qr_codes" ADD CONSTRAINT "poster_qr_codes_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "poster_qr_codes" ADD CONSTRAINT "poster_qr_codes_club_tenant_fkey" FOREIGN KEY ("target_club_id","university_id") REFERENCES "clubs"("id","university_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "poster_qr_scans" ADD CONSTRAINT "poster_qr_scans_qr_code_id_poster_qr_codes_id_fkey" FOREIGN KEY ("qr_code_id") REFERENCES "poster_qr_codes"("id") ON DELETE CASCADE;