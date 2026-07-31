ALTER TABLE "club_application_approvals" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "club_members" ADD COLUMN "left_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_members" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "club_members" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;