CREATE TABLE "tenant_admin_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"university_id" uuid NOT NULL,
	"email" varchar(256) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"role_name" varchar(100) NOT NULL,
	"token_hash" varchar(64) NOT NULL UNIQUE,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tenant_admin_invitations_university_idx" ON "tenant_admin_invitations" ("university_id");--> statement-breakpoint
CREATE INDEX "tenant_admin_invitations_email_idx" ON "tenant_admin_invitations" ("email");--> statement-breakpoint
ALTER TABLE "tenant_admin_invitations" ADD CONSTRAINT "tenant_admin_invitations_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tenant_admin_invitations" ADD CONSTRAINT "tenant_admin_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;