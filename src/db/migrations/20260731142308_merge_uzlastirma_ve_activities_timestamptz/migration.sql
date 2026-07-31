ALTER TABLE "activities" ALTER COLUMN "starts_at" SET DATA TYPE timestamp with time zone USING "starts_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "ends_at" SET DATA TYPE timestamp with time zone USING "ends_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_attendees" ALTER COLUMN "checked_in_at" SET DATA TYPE timestamp with time zone USING "checked_in_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_attendees" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_attendees" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_clubs" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_clubs" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;