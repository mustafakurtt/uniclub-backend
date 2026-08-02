CREATE TABLE "club_application_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"application_id" uuid NOT NULL,
	"university_id" uuid NOT NULL,
	"document_type_key" varchar(64) NOT NULL,
	"media_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "club_application_documents_type_idx" ON "club_application_documents" ("application_id","document_type_key");--> statement-breakpoint
ALTER TABLE "club_application_documents" ADD CONSTRAINT "club_application_documents_zEk8S4Gsf54e_fkey" FOREIGN KEY ("application_id") REFERENCES "club_applications"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_application_documents" ADD CONSTRAINT "club_application_documents_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_application_documents" ADD CONSTRAINT "club_application_documents_media_id_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_application_documents" ADD CONSTRAINT "club_application_documents_application_tenant_fkey" FOREIGN KEY ("application_id","university_id") REFERENCES "club_applications"("id","university_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_application_documents" ADD CONSTRAINT "club_application_documents_uploader_tenant_fkey" FOREIGN KEY ("uploaded_by","university_id") REFERENCES "users"("id","university_id") ON DELETE RESTRICT;