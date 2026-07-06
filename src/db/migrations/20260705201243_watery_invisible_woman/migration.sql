CREATE TYPE "application_approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "application_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "club_role" AS ENUM('member', 'officer', 'president');--> statement-breakpoint
CREATE TYPE "club_status" AS ENUM('pending', 'approved', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "contact_platform" AS ENUM('whatsapp', 'instagram', 'discord', 'telegram', 'twitter', 'website', 'email', 'other');--> statement-breakpoint
CREATE TYPE "join_policy" AS ENUM('open', 'approval_required');--> statement-breakpoint
CREATE TYPE "membership_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "user_status" AS ENUM('pending', 'active', 'suspended');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"university_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"title" varchar(256) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_advisors" (
	"club_id" uuid,
	"user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "club_advisors_pkey" PRIMARY KEY("club_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "club_application_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"application_id" uuid NOT NULL,
	"step" integer NOT NULL,
	"approver_role" varchar(100),
	"approver_id" uuid,
	"status" "application_approval_status" DEFAULT 'pending'::"application_approval_status" NOT NULL,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"university_id" uuid NOT NULL,
	"proposed_name" varchar(256) NOT NULL,
	"description" text,
	"applicant_id" uuid NOT NULL,
	"status" "application_status" DEFAULT 'pending'::"application_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_contact_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"club_id" uuid NOT NULL,
	"platform" "contact_platform" NOT NULL,
	"url" varchar(512) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_gallery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"club_id" uuid NOT NULL,
	"image_url" varchar(512) NOT NULL,
	"caption" varchar(256),
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_members" (
	"club_id" uuid,
	"user_id" uuid,
	"role" "club_role" DEFAULT 'member'::"club_role" NOT NULL,
	"status" "membership_status" DEFAULT 'pending'::"membership_status" NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "club_members_pkey" PRIMARY KEY("club_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"university_id" uuid NOT NULL,
	"name" varchar(256) NOT NULL,
	"slug" varchar(256) NOT NULL,
	"description" text,
	"logo_url" varchar(512),
	"cover_url" varchar(512),
	"status" "club_status" DEFAULT 'pending'::"club_status" NOT NULL,
	"join_policy" "join_policy" DEFAULT 'open'::"join_policy" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"faculty_id" uuid NOT NULL,
	"name" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"token" varchar(128) NOT NULL UNIQUE,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faculties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"university_id" uuid NOT NULL,
	"name" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"key" varchar(100) NOT NULL UNIQUE,
	"description" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid,
	"permission_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_pkey" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"university_id" uuid,
	"name" varchar(100) NOT NULL,
	"description" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "universities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(256) NOT NULL,
	"slug" varchar(256) NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "university_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"university_id" uuid NOT NULL,
	"domain" varchar(256) NOT NULL UNIQUE,
	"domain_type" varchar(50) DEFAULT 'student' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"user_id" uuid,
	"permission_id" uuid,
	"granted" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_permissions_pkey" PRIMARY KEY("user_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid,
	"role_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_pkey" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"university_id" uuid NOT NULL,
	"department_id" uuid,
	"student_number" varchar(50),
	"email" varchar(256) NOT NULL,
	"password_hash" varchar(256) NOT NULL,
	"first_name" varchar(256) NOT NULL,
	"last_name" varchar(256) NOT NULL,
	"photo_url" varchar(512),
	"preferred_language" varchar(10) DEFAULT 'tr' NOT NULL,
	"status" "user_status" DEFAULT 'pending'::"user_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "club_advisors_club_id_idx" ON "club_advisors" ("club_id");--> statement-breakpoint
CREATE INDEX "club_advisors_user_id_idx" ON "club_advisors" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "application_step_idx" ON "club_application_approvals" ("application_id","step");--> statement-breakpoint
CREATE UNIQUE INDEX "club_platform_idx" ON "club_contact_links" ("club_id","platform");--> statement-breakpoint
CREATE INDEX "club_members_club_id_idx" ON "club_members" ("club_id");--> statement-breakpoint
CREATE INDEX "club_members_user_id_idx" ON "club_members" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "slug_per_university_idx" ON "clubs" ("university_id","slug");--> statement-breakpoint
CREATE INDEX "user_roles_user_id_idx" ON "user_roles" ("user_id");--> statement-breakpoint
CREATE INDEX "user_roles_role_id_idx" ON "user_roles" ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_per_university_idx" ON "users" ("university_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "student_number_per_university_idx" ON "users" ("university_id","student_number");--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id");--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_club_id_clubs_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id");--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "club_advisors" ADD CONSTRAINT "club_advisors_club_id_clubs_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id");--> statement-breakpoint
ALTER TABLE "club_advisors" ADD CONSTRAINT "club_advisors_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "club_application_approvals" ADD CONSTRAINT "club_application_approvals_yBV8mChuWOsQ_fkey" FOREIGN KEY ("application_id") REFERENCES "club_applications"("id");--> statement-breakpoint
ALTER TABLE "club_application_approvals" ADD CONSTRAINT "club_application_approvals_approver_id_users_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "club_applications" ADD CONSTRAINT "club_applications_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id");--> statement-breakpoint
ALTER TABLE "club_applications" ADD CONSTRAINT "club_applications_applicant_id_users_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "club_contact_links" ADD CONSTRAINT "club_contact_links_club_id_clubs_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id");--> statement-breakpoint
ALTER TABLE "club_gallery" ADD CONSTRAINT "club_gallery_club_id_clubs_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id");--> statement-breakpoint
ALTER TABLE "club_gallery" ADD CONSTRAINT "club_gallery_uploaded_by_users_id_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_club_id_clubs_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id");--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id");--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_faculty_id_faculties_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id");--> statement-breakpoint
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "faculties" ADD CONSTRAINT "faculties_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id");--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id");--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id");--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id");--> statement-breakpoint
ALTER TABLE "university_domains" ADD CONSTRAINT "university_domains_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id");--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_permissions_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id");--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id");