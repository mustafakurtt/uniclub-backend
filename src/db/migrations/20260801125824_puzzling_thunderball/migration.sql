CREATE TYPE "formation_proposal_status" AS ENUM('collecting_support', 'submitted', 'withdrawn', 'expired');--> statement-breakpoint
CREATE TABLE "club_formation_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"university_id" uuid NOT NULL,
	"proposer_id" uuid NOT NULL,
	"proposed_name" varchar(256) NOT NULL,
	"description" text,
	"status" "formation_proposal_status" DEFAULT 'collecting_support'::"formation_proposal_status" NOT NULL,
	"support_count" integer DEFAULT 0 NOT NULL,
	"application_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_formation_supports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"proposal_id" uuid NOT NULL,
	"supporter_id" uuid NOT NULL,
	"university_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "club_formation_proposals_university_status_idx" ON "club_formation_proposals" ("university_id","status");--> statement-breakpoint
CREATE INDEX "club_formation_proposals_proposer_idx" ON "club_formation_proposals" ("proposer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "club_formation_supports_proposal_supporter_idx" ON "club_formation_supports" ("proposal_id","supporter_id");--> statement-breakpoint
ALTER TABLE "club_formation_proposals" ADD CONSTRAINT "club_formation_proposals_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_formation_proposals" ADD CONSTRAINT "club_formation_proposals_5zjRdeTmL9yq_fkey" FOREIGN KEY ("application_id") REFERENCES "club_applications"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "club_formation_proposals" ADD CONSTRAINT "club_formation_proposals_proposer_tenant_fkey" FOREIGN KEY ("proposer_id","university_id") REFERENCES "users"("id","university_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_formation_supports" ADD CONSTRAINT "club_formation_supports_QJRKWUjbCepT_fkey" FOREIGN KEY ("proposal_id") REFERENCES "club_formation_proposals"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_formation_supports" ADD CONSTRAINT "club_formation_supports_supporter_tenant_fkey" FOREIGN KEY ("supporter_id","university_id") REFERENCES "users"("id","university_id") ON DELETE RESTRICT;
