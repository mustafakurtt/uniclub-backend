CREATE TABLE "user_moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" varchar(50) NOT NULL,
	"reason" text,
	"previous_status" "user_status",
	"new_status" "user_status",
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "moderation_user_created_idx" ON "user_moderation_actions" ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "user_moderation_actions" ADD CONSTRAINT "user_moderation_actions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "user_moderation_actions" ADD CONSTRAINT "user_moderation_actions_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id");