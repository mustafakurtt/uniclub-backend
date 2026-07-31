ALTER TABLE "universities" ADD COLUMN "status_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "universities" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "universities" ADD COLUMN "status_changed_by" uuid;--> statement-breakpoint
ALTER TABLE "universities" ADD CONSTRAINT "universities_status_changed_by_users_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;