CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"university_id" uuid,
	"actor_id" uuid NOT NULL,
	"action" varchar(128) NOT NULL,
	"method" varchar(8) NOT NULL,
	"path" varchar(512) NOT NULL,
	"status" integer NOT NULL,
	"target_type" varchar(64),
	"target_id" varchar(128),
	"metadata" jsonb,
	"ip" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_logs_university_created_idx" ON "audit_logs" ("university_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs" ("actor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" ("target_type","target_id");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id");