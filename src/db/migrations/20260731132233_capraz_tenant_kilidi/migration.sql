-- ÇAPRAZ-TENANT KİLİDİ (bkz. docs/SEMA_VE_URUN_YOL_HARITASI.md §1.1)
--
-- Kulüp-kullanıcı bağı tutan tablolar kendi `university_id`'lerini taşır ve İKİ
-- bileşik FK ile hem kulübe hem kullanıcıya bağlanır. İkisi de aynı kolonu
-- kullandığı için Postgres şunu zorunlu kılar:
--     kulübün üniversitesi == satırın üniversitesi == kullanıcının üniversitesi
--
-- ⚠️ MEVCUT VERİDE ÇAPRAZ-TENANT SATIR VARSA bu migration, FK eklenirken
-- HATA VERİR ve geri alınır (transaction). Bu doğru davranıştır: kısıt sessizce
-- gevşetilmemeli. Uygulamadan ÖNCE aşağıdaki sorgularla kontrol edin —
-- boş dönmeleri beklenir:
--
--   SELECT cm.club_id, cm.user_id FROM club_members cm
--     JOIN clubs c ON c.id = cm.club_id
--     JOIN users u ON u.id = cm.user_id
--    WHERE u.university_id IS DISTINCT FROM c.university_id;
--
--   SELECT ca.club_id, ca.user_id FROM club_advisors ca
--     JOIN clubs c ON c.id = ca.club_id
--     JOIN users u ON u.id = ca.user_id
--    WHERE u.university_id IS DISTINCT FROM c.university_id;
--
--   SELECT a.id FROM announcements a
--     JOIN clubs c ON c.id = a.club_id
--    WHERE a.university_id IS DISTINCT FROM c.university_id;
--
--   SELECT ap.id FROM club_applications ap
--     JOIN users u ON u.id = ap.applicant_id
--    WHERE u.university_id IS DISTINCT FROM ap.university_id;
--
-- Satır dönerse bu, uygulamanın geçmişte çapraz-tenant veri yazdığının kanıtıdır;
-- önce o satırlar elle düzeltilmeli (doğru tenant'a taşınmalı ya da silinmeli).

-- 1) Tek kolonluk FK'ler bırakılıyor — yerlerini bileşik olanlar alacak.
ALTER TABLE "announcements" DROP CONSTRAINT "announcements_club_id_clubs_id_fkey";--> statement-breakpoint
ALTER TABLE "club_advisors" DROP CONSTRAINT "club_advisors_club_id_clubs_id_fkey";--> statement-breakpoint
ALTER TABLE "club_advisors" DROP CONSTRAINT "club_advisors_user_id_users_id_fkey";--> statement-breakpoint
ALTER TABLE "club_applications" DROP CONSTRAINT "club_applications_applicant_id_users_id_fkey";--> statement-breakpoint
ALTER TABLE "club_gallery" DROP CONSTRAINT "club_gallery_club_id_clubs_id_fkey";--> statement-breakpoint
ALTER TABLE "club_members" DROP CONSTRAINT "club_members_club_id_clubs_id_fkey";--> statement-breakpoint
ALTER TABLE "club_members" DROP CONSTRAINT "club_members_user_id_users_id_fkey";--> statement-breakpoint

-- 2) Yeni kolon ÜÇ adımda: NULL'a izin ver → kulüpten doldur → NOT NULL yap.
--    (Doğrudan NOT NULL eklemek, satırı olan bir tabloda patlar.)
ALTER TABLE "club_advisors" ADD COLUMN "university_id" uuid;--> statement-breakpoint
ALTER TABLE "club_gallery" ADD COLUMN "university_id" uuid;--> statement-breakpoint
ALTER TABLE "club_members" ADD COLUMN "university_id" uuid;--> statement-breakpoint

UPDATE "club_advisors" ca SET "university_id" = c."university_id" FROM "clubs" c WHERE c."id" = ca."club_id";--> statement-breakpoint
UPDATE "club_gallery" cg SET "university_id" = c."university_id" FROM "clubs" c WHERE c."id" = cg."club_id";--> statement-breakpoint
UPDATE "club_members" cm SET "university_id" = c."university_id" FROM "clubs" c WHERE c."id" = cm."club_id";--> statement-breakpoint

ALTER TABLE "club_advisors" ALTER COLUMN "university_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "club_gallery" ALTER COLUMN "university_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "club_members" ALTER COLUMN "university_id" SET NOT NULL;--> statement-breakpoint

-- 3) Bileşik FK'lerin referans alabilmesi için hedef tekillik kısıtları.
--    `id` zaten tekil olduğundan yeni bir kural getirmezler.
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_id_university_unique" UNIQUE("id","university_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_university_unique" UNIQUE("id","university_id");--> statement-breakpoint

-- 4) Kilidin kendisi.
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_club_tenant_fkey" FOREIGN KEY ("club_id","university_id") REFERENCES "clubs"("id","university_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_advisors" ADD CONSTRAINT "club_advisors_club_tenant_fkey" FOREIGN KEY ("club_id","university_id") REFERENCES "clubs"("id","university_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_advisors" ADD CONSTRAINT "club_advisors_user_tenant_fkey" FOREIGN KEY ("user_id","university_id") REFERENCES "users"("id","university_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_applications" ADD CONSTRAINT "club_applications_applicant_tenant_fkey" FOREIGN KEY ("applicant_id","university_id") REFERENCES "users"("id","university_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "club_gallery" ADD CONSTRAINT "club_gallery_club_tenant_fkey" FOREIGN KEY ("club_id","university_id") REFERENCES "clubs"("id","university_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_club_tenant_fkey" FOREIGN KEY ("club_id","university_id") REFERENCES "clubs"("id","university_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_user_tenant_fkey" FOREIGN KEY ("user_id","university_id") REFERENCES "users"("id","university_id") ON DELETE CASCADE;
