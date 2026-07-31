-- Tier 0 şema düzeltmeleri (bkz. docs/planning/schema-product.md).
--
-- ZAMAN TİPİ DÖNÜŞÜMÜ HAKKINDA: aşağıdaki `::timestamp with time zone` cast'leri
-- mevcut değerleri OTURUMUN saat dilimine göre yorumlar. Eski kolonlar
-- `timestamp` (tz'siz) idi ve değerleri `now()` ile, sunucunun TimeZone ayarına
-- göre yazılmıştı — yani yazma ve dönüştürme aynı TimeZone altında olduğu sürece
-- cast birebir doğrudur. Postgres imajı UTC ile çalışır (docker-compose ve
-- docker-compose.prod.yml TZ'yi değiştirmez). Sunucunun TimeZone'u bir noktada
-- değiştirilmişse bu migration ÖNCESİNDE yedek alın ve dönüşümü elle doğrulayın.
ALTER TABLE "email_verifications" DROP CONSTRAINT "email_verifications_token_key";--> statement-breakpoint
ALTER TABLE "email_verifications" DROP COLUMN "token";--> statement-breakpoint
ALTER TABLE "announcements" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "announcements" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_advisors" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_advisors" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_application_approvals" ALTER COLUMN "reviewed_at" SET DATA TYPE timestamp with time zone USING "reviewed_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_application_approvals" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_application_approvals" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_applications" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_applications" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_contact_links" ALTER COLUMN "platform" SET DATA TYPE varchar(32) USING "platform"::varchar(32);--> statement-breakpoint
ALTER TABLE "club_contact_links" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_contact_links" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_gallery" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_gallery" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_members" ALTER COLUMN "joined_at" SET DATA TYPE timestamp with time zone USING "joined_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "departments" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "departments" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_verifications" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_verifications" ALTER COLUMN "used_at" SET DATA TYPE timestamp with time zone USING "used_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_verifications" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_verifications" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "faculties" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "faculties" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "read_at" SET DATA TYPE timestamp with time zone USING "read_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "permissions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "permissions" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "role_permissions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "role_permissions" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "universities" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "universities" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "university_domains" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "university_domains" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_moderation_actions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_permissions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_permissions" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_roles" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_roles" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
CREATE INDEX "announcements_club_created_idx" ON "announcements" ("club_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "club_applications_university_status_idx" ON "club_applications" ("university_id","status");--> statement-breakpoint
CREATE INDEX "club_applications_applicant_idx" ON "club_applications" ("applicant_id");--> statement-breakpoint
CREATE INDEX "club_gallery_club_idx" ON "club_gallery" ("club_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "clubs_created_by_idx" ON "clubs" ("created_by");--> statement-breakpoint
CREATE INDEX "email_verifications_user_idx" ON "email_verifications" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_name_per_university_idx" ON "roles" ("university_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "global_role_name_idx" ON "roles" ("name") WHERE "university_id" is null;--> statement-breakpoint
ALTER TABLE "announcements" DROP CONSTRAINT "announcements_university_id_universities_id_fkey", ADD CONSTRAINT "announcements_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "announcements" DROP CONSTRAINT "announcements_club_id_clubs_id_fkey", ADD CONSTRAINT "announcements_club_id_clubs_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "announcements" DROP CONSTRAINT "announcements_author_id_users_id_fkey", ADD CONSTRAINT "announcements_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_university_id_universities_id_fkey", ADD CONSTRAINT "audit_logs_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_id_users_id_fkey", ADD CONSTRAINT "audit_logs_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_advisors" DROP CONSTRAINT "club_advisors_club_id_clubs_id_fkey", ADD CONSTRAINT "club_advisors_club_id_clubs_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_advisors" DROP CONSTRAINT "club_advisors_user_id_users_id_fkey", ADD CONSTRAINT "club_advisors_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_application_approvals" DROP CONSTRAINT "club_application_approvals_yBV8mChuWOsQ_fkey", ADD CONSTRAINT "club_application_approvals_yBV8mChuWOsQ_fkey" FOREIGN KEY ("application_id") REFERENCES "club_applications"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_application_approvals" DROP CONSTRAINT "club_application_approvals_approver_id_users_id_fkey", ADD CONSTRAINT "club_application_approvals_approver_id_users_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "club_applications" DROP CONSTRAINT "club_applications_university_id_universities_id_fkey", ADD CONSTRAINT "club_applications_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_applications" DROP CONSTRAINT "club_applications_applicant_id_users_id_fkey", ADD CONSTRAINT "club_applications_applicant_id_users_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_contact_links" DROP CONSTRAINT "club_contact_links_club_id_clubs_id_fkey", ADD CONSTRAINT "club_contact_links_club_id_clubs_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_gallery" DROP CONSTRAINT "club_gallery_club_id_clubs_id_fkey", ADD CONSTRAINT "club_gallery_club_id_clubs_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_gallery" DROP CONSTRAINT "club_gallery_uploaded_by_users_id_fkey", ADD CONSTRAINT "club_gallery_uploaded_by_users_id_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_members" DROP CONSTRAINT "club_members_club_id_clubs_id_fkey", ADD CONSTRAINT "club_members_club_id_clubs_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_members" DROP CONSTRAINT "club_members_user_id_users_id_fkey", ADD CONSTRAINT "club_members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "clubs" DROP CONSTRAINT "clubs_university_id_universities_id_fkey", ADD CONSTRAINT "clubs_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "clubs" DROP CONSTRAINT "clubs_created_by_users_id_fkey", ADD CONSTRAINT "clubs_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "departments" DROP CONSTRAINT "departments_faculty_id_faculties_id_fkey", ADD CONSTRAINT "departments_faculty_id_faculties_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "email_verifications" DROP CONSTRAINT "email_verifications_user_id_users_id_fkey", ADD CONSTRAINT "email_verifications_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "faculties" DROP CONSTRAINT "faculties_university_id_universities_id_fkey", ADD CONSTRAINT "faculties_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_user_id_users_id_fkey", ADD CONSTRAINT "notifications_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_subscriptions" DROP CONSTRAINT "push_subscriptions_user_id_users_id_fkey", ADD CONSTRAINT "push_subscriptions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_role_id_roles_id_fkey", ADD CONSTRAINT "role_permissions_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_permission_id_permissions_id_fkey", ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "roles" DROP CONSTRAINT "roles_university_id_universities_id_fkey", ADD CONSTRAINT "roles_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "university_domains" DROP CONSTRAINT "university_domains_university_id_universities_id_fkey", ADD CONSTRAINT "university_domains_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_moderation_actions" DROP CONSTRAINT "user_moderation_actions_user_id_users_id_fkey", ADD CONSTRAINT "user_moderation_actions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "user_moderation_actions" DROP CONSTRAINT "user_moderation_actions_actor_id_users_id_fkey", ADD CONSTRAINT "user_moderation_actions_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "user_permissions" DROP CONSTRAINT "user_permissions_user_id_users_id_fkey", ADD CONSTRAINT "user_permissions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_permissions" DROP CONSTRAINT "user_permissions_permission_id_permissions_id_fkey", ADD CONSTRAINT "user_permissions_permission_id_permissions_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_user_id_users_id_fkey", ADD CONSTRAINT "user_roles_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_role_id_roles_id_fkey", ADD CONSTRAINT "user_roles_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_university_id_universities_id_fkey", ADD CONSTRAINT "users_university_id_universities_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_department_id_departments_id_fkey", ADD CONSTRAINT "users_department_id_departments_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "university_domains" ADD CONSTRAINT "university_domains_domain_lowercase" CHECK ("domain" = lower("domain"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));--> statement-breakpoint
DROP TYPE "contact_platform";