import { pgTable as table, pgEnum } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import * as t from "drizzle-orm/pg-core";
import { timestamps, softDeleteColumn } from "../../core/db/base.entity";
import { universities, departments } from "./university";
import { createdAtColumn } from "./helpers";

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
  universityId: t.uuid("university_id").references(() => universities.id, { onDelete: "restrict" }),
  // Bölüm silinirse kullanıcı hesabı ayakta kalır, yalnızca bölüm bağı düşer.
  departmentId: t.uuid("department_id").references(() => departments.id, { onDelete: "set null" }),

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
  // Oturum iptali (session epoch). JWT claim ile karşılaştırılır — enforceAuthzPolicy.
  // Şifre değişimi / sıfırlama bump eder; askıya alma status üzerinden (bump yok).
  tokenVersion: t.integer("token_version").default(0).notNull(),
  ...timestamps,
  // KVKK silme talebi = ANONİMLEŞTİRME (bkz. docs/planning/schema-product.md §1.2).
  // Satır fiziksel olarak silinmez: `auditLogs`, `announcements`, moderasyon
  // geçmişi gibi KAYITLARIN aktörü olarak ayakta kalması gerekir (o FK'ler
  // bilerek `restrict`). Bunun yerine kimliği tanımlayan alanlar maskelenir ve
  // burası doldurulur. `deleted_at IS NOT NULL` = hesap silinmiş sayılır:
  // giriş yapamaz, yetki taşımaz (bkz. shared/rbac/rbac.repository.ts).
  //
  // NOT: `user_status` enum'una "deleted" değeri EKLENMEDİ — Postgres'te
  // `ALTER TYPE ... ADD VALUE` transaction içinde çalışmaz, drizzle migration'ları
  // ise transaction içinde koşar. İşaret bu kolon.
  ...softDeleteColumn,
}, (cols) => [
  t.uniqueIndex("email_per_university_idx").on(cols.universityId, cols.email),
  t.uniqueIndex("student_number_per_university_idx").on(cols.universityId, cols.studentNumber),
  // Postgres'te NULL'lar birbirinden farklı sayılır: (NULL, "a@b.com") iki kez
  // yazılabilirdi. Platform hesaplarının (university_id IS NULL) e-posta tekilliğini
  // yukarıdaki bileşik index SAĞLAMAZ — bu partial index onu kapatır.
  t.uniqueIndex("platform_user_email_idx")
    .on(cols.email)
    .where(sql`${cols.universityId} is null`),
  // Yukarıdaki index'ler büyük/küçük harfe DUYARLIDIR: "Ali@x.edu.tr" ile
  // "ali@x.edu.tr" iki ayrı satır olabilirdi (aynı kişi, iki hesap). E-posta
  // uygulama katmanında küçük harfe çevriliyor; bu kısıt o adımı atlayan her
  // yolu (seed, script, ileride eklenecek bir rota) sessizce geçmek yerine
  // patlatır — yani tekilliği fiilen case-insensitive yapar.
  t.check("users_email_lowercase", sql`${cols.email} = lower(${cols.email})`),
  // Bileşik yabancı anahtarların hedefi (bkz. clubMembers/clubAdvisors).
  // `id` zaten tekil olduğu için bu kısıt yeni bir kural getirmez — yalnızca
  // "(kullanıcı, üniversitesi)" çiftini FK'lerin referans alabileceği bir hedef
  // haline getirir. Platform hesaplarında university_id NULL'dur; MATCH SIMPLE
  // gereği o satırlar hiçbir tenant-bağlı çocuk kayda eşleşemez — kasıtlı.
  t.unique("users_id_university_unique").on(cols.id, cols.universityId),
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
  // restrict: moderasyon geçmişi bir kayıttır — ne hedefi ne de işlemi yapan
  // silinerek yok edilebilmeli. Kullanıcı "silme" yolu anonimleştirmedir.
  userId: t.uuid("user_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  actorId: t.uuid("actor_id").references(() => users.id, { onDelete: "restrict" }).notNull(), // işlemi yapan yönetici
  action: t.varchar({ length: 50 }).notNull(),
  reason: t.text(),
  previousStatus: userStatusEnum("previous_status"),
  newStatus: userStatusEnum("new_status"),
  ...createdAtColumn,
}, (cols) => [
  t.index("moderation_user_created_idx").on(cols.userId, cols.createdAt.desc()),
]);

// ═══════════════════════════════════════════════
// EMAIL VERIFICATIONS (okul maili doğrulama akışı)
// ═══════════════════════════════════════════════
export const emailVerifications = table("email_verifications", {
  id: t.uuid().primaryKey().defaultRandom(),
  userId: t.uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  // Token'ın KENDİSİ değil, SHA-256 özeti saklanır (64 hex karakter). Token bir
  // kimlik bilgisidir: düz saklanırsa bir DB dump'ı ya da salt-okunur erişim,
  // dolaşımdaki tüm doğrulama linklerini kullanılabilir hale getirir. Şifrede
  // yapılanın aynısı. Düz token yalnızca maildeki linkte yaşar.
  tokenHash: t.varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: t.timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: t.timestamp("used_at", { withTimezone: true }), // NULL = henüz kullanılmadı
  ...timestamps,
}, (cols) => [
  // Kullanıcının açık token'larını iptal etme (resend akışı) bu index'i kullanır.
  t.index("email_verifications_user_idx").on(cols.userId),
]);

// ═══════════════════════════════════════════════
// PASSWORD RESETS (self-servis şifre sıfırlama)
// ═══════════════════════════════════════════════
export const passwordResets = table("password_resets", {
  id: t.uuid().primaryKey().defaultRandom(),
  userId: t.uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tokenHash: t.varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: t.timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: t.timestamp("used_at", { withTimezone: true }),
  ...createdAtColumn,
}, (cols) => [
  t.index("password_resets_user_idx").on(cols.userId),
]);
