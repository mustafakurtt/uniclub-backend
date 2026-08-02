CREATE TABLE "activity_social_preview_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"university_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_social_preview_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"university_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_social_preview_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"university_id" uuid NOT NULL,
	"gallery_image_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_social_preview_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"university_id" uuid NOT NULL,
	"gallery_image_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_gallery" ADD CONSTRAINT "club_gallery_id_university_unique" UNIQUE("id","university_id");--> statement-breakpoint
CREATE INDEX "activity_social_preview_comments_activity_idx" ON "activity_social_preview_comments" ("activity_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "activity_social_preview_likes_activity_user_unique" ON "activity_social_preview_likes" ("activity_id","user_id");--> statement-breakpoint
CREATE INDEX "activity_social_preview_likes_activity_idx" ON "activity_social_preview_likes" ("activity_id");--> statement-breakpoint
CREATE INDEX "gallery_social_preview_comments_image_idx" ON "gallery_social_preview_comments" ("gallery_image_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "gallery_social_preview_likes_image_user_unique" ON "gallery_social_preview_likes" ("gallery_image_id","user_id");--> statement-breakpoint
CREATE INDEX "gallery_social_preview_likes_image_idx" ON "gallery_social_preview_likes" ("gallery_image_id");--> statement-breakpoint
ALTER TABLE "activity_social_preview_comments" ADD CONSTRAINT "activity_social_preview_comments_H0MxXl1rplM5_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "activity_social_preview_comments" ADD CONSTRAINT "activity_social_preview_comments_activity_id_activities_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "activity_social_preview_comments" ADD CONSTRAINT "activity_social_preview_comments_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "activity_social_preview_likes" ADD CONSTRAINT "activity_social_preview_likes_VCvAcey7qVNZ_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "activity_social_preview_likes" ADD CONSTRAINT "activity_social_preview_likes_activity_id_activities_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "activity_social_preview_likes" ADD CONSTRAINT "activity_social_preview_likes_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "gallery_social_preview_comments" ADD CONSTRAINT "gallery_social_preview_comments_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "gallery_social_preview_comments" ADD CONSTRAINT "gallery_social_preview_comments_image_tenant_fkey" FOREIGN KEY ("gallery_image_id","university_id") REFERENCES "club_gallery"("id","university_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gallery_social_preview_likes" ADD CONSTRAINT "gallery_social_preview_likes_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "gallery_social_preview_likes" ADD CONSTRAINT "gallery_social_preview_likes_image_tenant_fkey" FOREIGN KEY ("gallery_image_id","university_id") REFERENCES "club_gallery"("id","university_id") ON DELETE CASCADE;