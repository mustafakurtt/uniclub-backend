CREATE TYPE "activity_club_role" AS ENUM('host', 'co_host');--> statement-breakpoint
CREATE TYPE "activity_status" AS ENUM('draft', 'published', 'cancelled');--> statement-breakpoint
CREATE TYPE "activity_visibility" AS ENUM('university', 'members');--> statement-breakpoint
CREATE TYPE "rsvp_status" AS ENUM('going', 'interested', 'waitlist');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"title" varchar(256) NOT NULL,
	"description" text,
	"location" varchar(512),
	"cover_url" varchar(512),
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp,
	"capacity" integer,
	"status" "activity_status" DEFAULT 'draft'::"activity_status" NOT NULL,
	"visibility" "activity_visibility" DEFAULT 'university'::"activity_visibility" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_attendees" (
	"activity_id" uuid,
	"user_id" uuid,
	"status" "rsvp_status" DEFAULT 'going'::"rsvp_status" NOT NULL,
	"checked_in_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "activity_attendees_pkey" PRIMARY KEY("activity_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "activity_clubs" (
	"activity_id" uuid,
	"club_id" uuid,
	"role" "activity_club_role" DEFAULT 'host'::"activity_club_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "activity_clubs_pkey" PRIMARY KEY("activity_id","club_id")
);
--> statement-breakpoint
CREATE INDEX "activities_starts_at_idx" ON "activities" ("starts_at");--> statement-breakpoint
CREATE INDEX "activity_attendees_activity_id_idx" ON "activity_attendees" ("activity_id");--> statement-breakpoint
CREATE INDEX "activity_attendees_user_id_idx" ON "activity_attendees" ("user_id");--> statement-breakpoint
CREATE INDEX "activity_clubs_activity_id_idx" ON "activity_clubs" ("activity_id");--> statement-breakpoint
CREATE INDEX "activity_clubs_club_id_idx" ON "activity_clubs" ("club_id");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_single_host_idx" ON "activity_clubs" ("activity_id") WHERE "role" = 'host';--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "activity_attendees" ADD CONSTRAINT "activity_attendees_activity_id_activities_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id");--> statement-breakpoint
ALTER TABLE "activity_attendees" ADD CONSTRAINT "activity_attendees_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "activity_clubs" ADD CONSTRAINT "activity_clubs_activity_id_activities_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id");--> statement-breakpoint
ALTER TABLE "activity_clubs" ADD CONSTRAINT "activity_clubs_club_id_clubs_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id");