CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"uploader_id" uuid NOT NULL,
	"university_id" uuid,
	"storage_key" varchar(256) NOT NULL UNIQUE,
	"content_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"purpose" varchar(50) DEFAULT 'other' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "media_uploader_created_idx" ON "media" ("uploader_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploader_id_users_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id");