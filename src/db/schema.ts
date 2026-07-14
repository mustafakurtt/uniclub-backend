import { pgTable as table, pgEnum } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import * as t from "drizzle-orm/pg-core";
import { softDeleteColumn } from "../core/db/base.entity";

// ═══════════════════════════════════════════════
// ORTAK KOLONLAR (spread ile her tabloya eklenir)
// ═══════════════════════════════════════════════
export const baseTimestamps = {
  createdAt: t.timestamp("created_at").defaultNow().notNull(),
  updatedAt: t.timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
};

// ═══════════════════════════════════════════════
// UNIVERSITIES & DOMAINS (Tenant + çoklu domain desteği)
// ═══════════════════════════════════════════════
export const universities = table("universities", {
  id: t.uuid().primaryKey().defaultRandom(),
  name: t.varchar({ length: 256 }).notNull(),
  slug: t.varchar({ length: 256 }).notNull().unique(), // ileride SaaS subdomain için: xyz-universitesi.uygulaman.com
  ...baseTimestamps,
  ...softDeleteColumn,
});

export const universityDomains = table("university_domains", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t.uuid("university_id").references(() => universities.id).notNull(),
  domain: t.varchar({ length: 256 }).notNull().unique(), // "ogrenci.xyz.edu.tr", "xyz.edu.tr" gibi birden fazla olabilir
  domainType: t.varchar("domain_type", { length: 50 }).default("student").notNull(),
  ...baseTimestamps,
  ...softDeleteColumn,
});

// ═══════════════════════════════════════════════
// FACULTIES & DEPARTMENTS (Üniversite > Fakülte > Bölüm)
// ═══════════════════════════════════════════════
export const faculties = table("faculties", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t.uuid("university_id").references(() => universities.id).notNull(),
  name: t.varchar({ length: 256 }).notNull(), // "Mühendislik Fakültesi"
  ...baseTimestamps,
  ...softDeleteColumn,
});

export const departments = table("departments", {
  id: t.uuid().primaryKey().defaultRandom(),
  facultyId: t.uuid("faculty_id").references(() => faculties.id).notNull(),
  name: t.varchar({ length: 256 }).notNull(), // "Bilgisayar Mühendisliği"
  ...baseTimestamps,
  ...softDeleteColumn,
});
// Not: departments.universityId kasıtlı olarak eklenmedi.
// Bilgiye faculty -> university zinciriyle ulaşılır, tekrar (redundancy) yaratmamak için.

// ═══════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════
export const userStatusEnum = pgEnum("user_status", ["pending", "active", "suspended"]);

export const users = table("users", {
  id: t.uuid().primaryKey().defaultRandom(),
  // Bilinçli denormalize: hızlı tenant sorgusu için.
  // NULL = PLATFORM hesabı (super_admin, platform_support, ileride call_center vb.) —
  // hiçbir üniversiteye ait değildir, tenant scope'unu rolüyle bypass eder.
  // Öğrenci/personel hesaplarında her zaman doludur (kayıt e-posta domain'inden çıkarır).
  universityId: t.uuid("university_id").references(() => universities.id),
  departmentId: t.uuid("department_id").references(() => departments.id),

  studentNumber: t.varchar("student_number", { length: 50 }), // hoca/adminlerde NULL olabilir
  email: t.varchar({ length: 256 }).notNull(),
  passwordHash: t.varchar("password_hash", { length: 256 }).notNull(),

  firstName: t.varchar("first_name", { length: 256 }).notNull(),
  lastName: t.varchar("last_name", { length: 256 }).notNull(),
  photoUrl: t.varchar("photo_url", { length: 512 }),

  preferredLanguage: t.varchar("preferred_language", { length: 10 }).default("tr").notNull(), // ISO 639-1: "tr", "en"...

  status: userStatusEnum().default("pending").notNull(),
  // Admin şifre sıfırlaması sonrası true; kullanıcı bir sonraki girişte şifresini
  // değiştirmeye zorlanır (moderation feature'ı set eder, self change-password sıfırlar).
  mustChangePassword: t.boolean("must_change_password").default(false).notNull(),
  ...baseTimestamps,
}, (cols) => [
  t.uniqueIndex("email_per_university_idx").on(cols.universityId, cols.email),
  t.uniqueIndex("student_number_per_university_idx").on(cols.universityId, cols.studentNumber),
  // Postgres'te NULL'lar birbirinden farklı sayılır: (NULL, "a@b.com") iki kez
  // yazılabilirdi. Platform hesaplarının (university_id IS NULL) e-posta tekilliğini
  // yukarıdaki bileşik index SAĞLAMAZ — bu partial index onu kapatır.
  t.uniqueIndex("platform_user_email_idx")
    .on(cols.email)
    .where(sql`${cols.universityId} is null`),
]);

// ═══════════════════════════════════════════════
// USER MODERATION ACTIONS (kullanıcı moderasyon geçmişi — append-only)
// ═══════════════════════════════════════════════
// Her ban/unban/şifre-sıfırlama işlemini kim, ne zaman, hangi sebeple yaptı
// kaydeder. users.status anlık durumu tutar; bu tablo TARİHÇEyi tutar.
// Append-only (audit_logs gibi): satır güncellenmez → updatedAt/softDelete YOK.
// action: pgEnum DEĞİL, varchar + ModerationAction katalog (yeni tip migration istemesin).
export const userModerationActions = table("user_moderation_actions", {
  id: t.uuid().primaryKey().defaultRandom(),
  userId: t.uuid("user_id").references(() => users.id).notNull(),
  actorId: t.uuid("actor_id").references(() => users.id).notNull(), // işlemi yapan yönetici
  action: t.varchar({ length: 50 }).notNull(),
  reason: t.text(),
  previousStatus: userStatusEnum("previous_status"),
  newStatus: userStatusEnum("new_status"),
  createdAt: t.timestamp("created_at").defaultNow().notNull(),
}, (cols) => [
  t.index("moderation_user_created_idx").on(cols.userId, cols.createdAt.desc()),
]);

// ═══════════════════════════════════════════════
// EMAIL VERIFICATIONS (okul maili doğrulama akışı)
// ═══════════════════════════════════════════════
export const emailVerifications = table("email_verifications", {
  id: t.uuid().primaryKey().defaultRandom(),
  userId: t.uuid("user_id").references(() => users.id).notNull(),
  token: t.varchar({ length: 128 }).notNull().unique(),
  expiresAt: t.timestamp("expires_at").notNull(),
  usedAt: t.timestamp("used_at"), // NULL = henüz kullanılmadı
  ...baseTimestamps,
});

// ═══════════════════════════════════════════════
// ROLES & PERMISSIONS (claim-based, iki katmanlı sistemin global katmanı)
// ═══════════════════════════════════════════════
/**
 * İleride (bkz. docs/yonetim/07): bölge (region) kapsamı eklenecekse yol şudur —
 * `regions` tablosu + `universities.regionId`, ve `userRoles`'a nullable
 * `scopeUniversityId` / `scopeRegionId` kolonları. Böylece AYNI rol, kullanıcıya
 * farklı kapsamlarda (tek okul / bölge / global) atanabilir. Bu tur kapsam dışı.
 */
export const roles = table("roles", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t.uuid("university_id").references(() => universities.id), // NULL = sistem geneli varsayılan rol
  name: t.varchar({ length: 100 }).notNull(), // "student", "teacher", "admin"
  description: t.varchar({ length: 256 }),
  /**
   * Yetki derecesi — yüksek = daha yetkili (super_admin 100 ... student 10).
   * Kural: bir aktör yalnızca KENDİ rütbesinden DÜŞÜK bir rolü atayabilir/kaldırabilir
   * ve yalnızca kendinden düşük rütbeli bir kullanıcıya dokunabilir. Kendine dokunma
   * (self == eşit rütbe) bu kuralın doğal sonucu olarak engellenir.
   * DİKKAT: default 0'dır — yeni rol oluştururken rütbe bilinçli olarak set edilmelidir.
   */
  rank: t.integer().default(0).notNull(),
  ...baseTimestamps,
});

export const permissions = table("permissions", {
  id: t.uuid().primaryKey().defaultRandom(),
  key: t.varchar({ length: 100 }).notNull().unique(), // "club.approve", "announcement.create"
  description: t.varchar({ length: 256 }),
  ...baseTimestamps,
});

export const rolePermissions = table("role_permissions", {
  roleId: t.uuid("role_id").references(() => roles.id).notNull(),
  permissionId: t.uuid("permission_id").references(() => permissions.id).notNull(),
  ...baseTimestamps,
}, (cols) => [
  t.primaryKey({ columns: [cols.roleId, cols.permissionId] }),
]);

export const userRoles = table("user_roles", {
  userId: t.uuid("user_id").references(() => users.id).notNull(),
  roleId: t.uuid("role_id").references(() => roles.id).notNull(),
  ...baseTimestamps,
}, (cols) => [
  t.primaryKey({ columns: [cols.userId, cols.roleId] }),
  t.index("user_roles_user_id_idx").on(cols.userId),
  t.index("user_roles_role_id_idx").on(cols.roleId),
]);

export const userPermissions = table("user_permissions", {
  userId: t.uuid("user_id").references(() => users.id).notNull(),
  permissionId: t.uuid("permission_id").references(() => permissions.id).notNull(),
  granted: t.boolean().default(true).notNull(), // false = rolden gelen yetkiyi geri al
  ...baseTimestamps,
}, (cols) => [
  t.primaryKey({ columns: [cols.userId, cols.permissionId] }),
]);

// ═══════════════════════════════════════════════
// CLUBS
// ═══════════════════════════════════════════════
export const clubStatusEnum = pgEnum("club_status", ["pending", "approved", "rejected", "archived"]);
export const joinPolicyEnum = pgEnum("join_policy", ["open", "approval_required"]);

export const clubs = table("clubs", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t.uuid("university_id").references(() => universities.id).notNull(),

  name: t.varchar({ length: 256 }).notNull(),
  slug: t.varchar({ length: 256 }).notNull(), // "/clubs/robotik-kulubu"
  description: t.text(),
  logoUrl: t.varchar("logo_url", { length: 512 }),
  coverUrl: t.varchar("cover_url", { length: 512 }),

  status: clubStatusEnum().default("pending").notNull(),
  joinPolicy: joinPolicyEnum("join_policy").default("open").notNull(), // kulübe göre açık/onaylı katılım

  createdBy: t.uuid("created_by").references(() => users.id).notNull(),
  ...baseTimestamps,
}, (cols) => [
  t.uniqueIndex("slug_per_university_idx").on(cols.universityId, cols.slug),
]);

// Birden fazla danışman hoca desteği (many-to-many)
export const clubAdvisors = table("club_advisors", {
  clubId: t.uuid("club_id").references(() => clubs.id).notNull(),
  userId: t.uuid("user_id").references(() => users.id).notNull(),
  ...baseTimestamps,
}, (cols) => [
  t.primaryKey({ columns: [cols.clubId, cols.userId] }),
  t.index("club_advisors_club_id_idx").on(cols.clubId), // <-- EKLENDİ
  t.index("club_advisors_user_id_idx").on(cols.userId), // <-- EKLENDİ
]);

// Kulübün iletişim/sosyal medya linkleri (esnek, tek tek kolon değil)
export const contactPlatformEnum = pgEnum("contact_platform", [
  "whatsapp", "instagram", "discord", "telegram", "twitter", "website", "email", "other"
]);

export const clubContactLinks = table("club_contact_links", {
  id: t.uuid().primaryKey().defaultRandom(),
  clubId: t.uuid("club_id").references(() => clubs.id).notNull(),
  platform: contactPlatformEnum().notNull(),
  url: t.varchar({ length: 512 }).notNull(),
  ...baseTimestamps,
}, (cols) => [
  t.uniqueIndex("club_platform_idx").on(cols.clubId, cols.platform),
]);

// ═══════════════════════════════════════════════
// CLUB MEMBERS (kulüp bazlı rol katmanı — şimdilik dönemsel değil)
// ═══════════════════════════════════════════════
export const clubRoleEnum = pgEnum("club_role", ["member", "officer", "president"]);
export const membershipStatusEnum = pgEnum("membership_status", ["pending", "approved", "rejected"]);

export const clubMembers = table("club_members", {
  clubId: t.uuid("club_id").references(() => clubs.id).notNull(),
  userId: t.uuid("user_id").references(() => users.id).notNull(),

  role: clubRoleEnum().default("member").notNull(),
  status: membershipStatusEnum().default("pending").notNull(), // clubs.joinPolicy'ye göre app katmanında set edilir

  joinedAt: t.timestamp("joined_at").defaultNow().notNull(),
}, (cols) => [
  t.primaryKey({ columns: [cols.clubId, cols.userId] }),
  t.index("club_members_club_id_idx").on(cols.clubId),
  t.index("club_members_user_id_idx").on(cols.userId),
]);

// ═══════════════════════════════════════════════
// CLUB GALLERY
// ═══════════════════════════════════════════════
export const clubGallery = table("club_gallery", {
  id: t.uuid().primaryKey().defaultRandom(),
  clubId: t.uuid("club_id").references(() => clubs.id).notNull(),
  imageUrl: t.varchar("image_url", { length: 512 }).notNull(),
  caption: t.varchar({ length: 256 }),
  uploadedBy: t.uuid("uploaded_by").references(() => users.id).notNull(),
  ...baseTimestamps,
});

// ═══════════════════════════════════════════════
// ANNOUNCEMENTS (şimdilik sadece kulüp bazlı)
// ═══════════════════════════════════════════════
export const announcements = table("announcements", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t.uuid("university_id").references(() => universities.id).notNull(), // hızlı sorgu için denormalize
  clubId: t.uuid("club_id").references(() => clubs.id).notNull(), // ileride okul geneli için nullable'a çevrilebilir

  authorId: t.uuid("author_id").references(() => users.id).notNull(),
  title: t.varchar({ length: 256 }).notNull(),
  content: t.text().notNull(),
  ...baseTimestamps,
});

// ═══════════════════════════════════════════════
// NOTIFICATIONS (kalıcı bildirimler + gerçek zamanlı WS teslimatı)
// ═══════════════════════════════════════════════
export const notifications = table("notifications", {
  id: t.uuid().primaryKey().defaultRandom(),
  userId: t.uuid("user_id").references(() => users.id).notNull(),

  // pgEnum DEĞİL, bilinçli: bildirim tipleri sık sık eklenir ve her yeni tip
  // için migration üretmek istemiyoruz. Typo güvenliğini kod tarafındaki
  // `notifications.types.ts` → NotificationType (as const) katalogu sağlar
  // (aynı kalıp: *.permissions.ts). DB asıl kaynak olmaya devam eder.
  type: t.varchar({ length: 64 }).notNull(), // "account.verified", "club.application.decided"...

  title: t.varchar({ length: 256 }).notNull(),
  body: t.text(),
  // Derin link (deep link) için serbest yük: { clubId, applicationId, ... }
  data: t.jsonb().$type<Record<string, unknown>>(),

  readAt: t.timestamp("read_at"), // NULL = okunmamış
  ...baseTimestamps,
}, (cols) => [
  // Kullanıcının bildirim akışı (en yeniden eskiye) — keyset sayfalama bunu kullanır.
  t.index("notifications_user_created_idx").on(cols.userId, cols.createdAt.desc()),
  // Okunmamış sayacı: yalnızca okunmamış satırları indeksler, tablo büyüdükçe
  // sayaç sorgusu sabit maliyette kalır.
  t.index("notifications_unread_idx")
    .on(cols.userId)
    .where(sql`${cols.readAt} is null`),
]);

// ═══════════════════════════════════════════════
// PUSH SUBSCRIPTIONS (Web Push — uygulama kapalıyken bildirim)
// ═══════════════════════════════════════════════
// Tarayıcının Push API aboneliği. WebSocket'in tamamlayıcısı: WS yalnızca uygulama
// açıkken çalışır, bu abonelikler kapalıyken de (SW → OS bildirimi) teslimat sağlar.
// endpoint = cihazın benzersiz kimliği (UNIQUE → aynı cihaz tek satır, re-subscribe upsert).
export const pushSubscriptions = table("push_subscriptions", {
  id: t.uuid().primaryKey().defaultRandom(),
  userId: t.uuid("user_id").references(() => users.id).notNull(),
  endpoint: t.text().notNull().unique(),
  p256dh: t.text().notNull(), // istemci public anahtarı (payload şifreleme)
  auth: t.text().notNull(),   // istemci auth secret'ı
  ...baseTimestamps,
}, (cols) => [
  // Bir kullanıcının tüm cihazları (bildirim gönderiminde list, çıkışta delete).
  t.index("push_subscriptions_user_idx").on(cols.userId),
]);

// ═══════════════════════════════════════════════
// CLUB APPLICATIONS + GENİŞLETİLEBİLİR ONAY ZİNCİRİ
// ═══════════════════════════════════════════════
export const applicationStatusEnum = pgEnum("application_status", ["pending", "approved", "rejected"]);
export const applicationApprovalStatusEnum = pgEnum("application_approval_status", ["pending", "approved", "rejected"]);

export const clubApplications = table("club_applications", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t.uuid("university_id").references(() => universities.id).notNull(),

  proposedName: t.varchar("proposed_name", { length: 256 }).notNull(),
  description: t.text(),
  applicantId: t.uuid("applicant_id").references(() => users.id).notNull(),

  status: applicationStatusEnum().default("pending").notNull(), // özet durum, approvals adımlarından türetilir
  ...baseTimestamps,
});

// Her onay adımı ayrı bir satır. Şimdilik tek adım (step: 1) kullanılacak,
// ileride SKS gibi ikinci bir onay eklemek için sadece step: 2 satırı eklenir — şema değişmez.
export const clubApplicationApprovals = table("club_application_approvals", {
  id: t.uuid().primaryKey().defaultRandom(),
  applicationId: t.uuid("application_id").references(() => clubApplications.id).notNull(),

  step: t.integer().notNull(), // 1: danışman, 2: SKS (ileride)...
  approverRole: t.varchar("approver_role", { length: 100 }), // bilgi amaçlı: "advisor", "sks_officer"
  approverId: t.uuid("approver_id").references(() => users.id), // gerçekte onaylayan kişi

  status: applicationApprovalStatusEnum().default("pending").notNull(),
  reviewedAt: t.timestamp("reviewed_at"),
  ...baseTimestamps,
}, (cols) => [
  t.uniqueIndex("application_step_idx").on(cols.applicationId, cols.step),
]);

// ═══════════════════════════════════════════════
// AUDIT LOGS (append-only denetim izi)
// ═══════════════════════════════════════════════
// "Bu kullanıcıyı kim askıya aldı? Bu kulübü kim onayladı?" sorularının cevabı.
// Kayıtlar guard() zincirindeki auditTrail tarafından otomatik yazılır
// (bkz. core/rbac/audit-hook.ts + features/audit/audit.sink.ts).
// Append-only: satır asla güncellenmez → updatedAt bilinçli olarak YOK.
export const auditLogs = table("audit_logs", {
  id: t.uuid().primaryKey().defaultRandom(),
  // null = platform seviyesi işlem (tenant'sız super_admin aksiyonu, örn. üniversite oluşturma).
  universityId: t.uuid("university_id").references(() => universities.id),
  actorId: t.uuid("actor_id").references(() => users.id).notNull(),

  // İşlemin yetki anahtarı ("user.manage", "club.approve"...) — permission key ile aynı uzay.
  // pgEnum DEĞİL (notifications.type ile aynı gerekçe): yeni anahtar migration istememeli.
  action: t.varchar({ length: 128 }).notNull(),
  method: t.varchar({ length: 8 }).notNull(),
  path: t.varchar({ length: 512 }).notNull(),
  // HTTP yanıt kodu: 2xx başarılı işlem, 4xx reddedilmiş DENEME (o da denetim izidir).
  status: t.integer().notNull(),

  targetType: t.varchar("target_type", { length: 64 }), // "user", "club", "club_application"...
  targetId: t.varchar("target_id", { length: 128 }),
  // Serbest bağlam: { params, body } — hassas alanlar (şifre vb.) sink'te maskelenir.
  metadata: t.jsonb().$type<Record<string, unknown>>(),
  ip: t.varchar({ length: 64 }),

  createdAt: t.timestamp("created_at").defaultNow().notNull(),
}, (cols) => [
  // Tenant'ın denetim akışı (en yeniden eskiye) — keyset sayfalama bunu kullanır.
  t.index("audit_logs_university_created_idx").on(cols.universityId, cols.createdAt.desc()),
  // "Bu aktör neler yaptı?" filtresi.
  t.index("audit_logs_actor_created_idx").on(cols.actorId, cols.createdAt.desc()),
  // "Bu kaynağa kimler dokundu?" filtresi.
  t.index("audit_logs_target_idx").on(cols.targetType, cols.targetId),
]);