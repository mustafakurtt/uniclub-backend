import { pgTable as table, pgEnum } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import * as t from "drizzle-orm/pg-core";
import { timestamps, softDeleteColumn } from "../core/db/base.entity";

// ═══════════════════════════════════════════════
// ORTAK KOLONLAR
// ═══════════════════════════════════════════════
// created_at/updated_at core'daki `timestamps`ten gelir (bkz. core/db/base.entity).
// Daha önce burada ikinci bir kopya (`baseTimestamps`) vardı ve o kopya
// timezone'suzdu — aynı tabloda `deleted_at` timestamptz iken `created_at`
// timestamp oluyordu. Tek kaynağa indirildi: TÜM zaman kolonları timestamptz.

/** Append-only tablolarda kullanılan tek kolon (satır güncellenmez → updated_at yok). */
const createdAtColumn = {
  createdAt: t.timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
};

/**
 * Bileşik (çok kolonlu) yabancı anahtar — çapraz-tenant kilidinin aracı.
 *
 * NEDEN SARMALAYICI: drizzle'ın `foreignKey()` jeneriği `foreignColumns`'u
 * eşlenmiş bir tip (`ColumnsWithTable<...>`) üzerinden çıkarmaya çalışıyor. Bu
 * şemadaki bileşik FK'lerle birlikte tsc bellek taşırıyor
 * ("FATAL ERROR: Zone Allocation failed - process out of memory") — yani
 * `bun run typecheck` hiç bitmiyor. Sarmalayıcı imzayı düz `PgColumn[]`'a
 * indirip o çıkarımı kesiyor.
 *
 * KAYIP: yalnızca "verilen `foreignColumns` gerçekten tek ve aynı tablodan mı"
 * derleme zamanı kontrolü. Çalışma zamanı davranışı birebir aynı — `foreignKey`
 * kolon nesnelerinin kendisini okur. Hata yaparsan sessizce geçmez ama tsc yerine
 * bir adım sonra, `db:generate`/`db:migrate` aşamasında ortaya çıkar.
 */
const compositeForeignKey = (config: {
  name: string;
  columns: t.PgColumn[];
  foreignColumns: t.PgColumn[];
}) => t.foreignKey(config as never);

// ═══════════════════════════════════════════════
// UNIVERSITIES & DOMAINS (Tenant + çoklu domain desteği)
// ═══════════════════════════════════════════════
export const universities = table("universities", {
  id: t.uuid().primaryKey().defaultRandom(),
  name: t.varchar({ length: 256 }).notNull(),
  slug: t.varchar({ length: 256 }).notNull().unique(), // ileride SaaS subdomain için: xyz-universitesi.uygulaman.com
  ...timestamps,
  ...softDeleteColumn,
});

export const universityDomains = table("university_domains", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t.uuid("university_id")
    .references(() => universities.id, { onDelete: "cascade" })
    .notNull(),
  domain: t.varchar({ length: 256 }).notNull().unique(), // "ogrenci.xyz.edu.tr", "xyz.edu.tr" gibi birden fazla olabilir
  domainType: t.varchar("domain_type", { length: 50 }).default("student").notNull(),
  ...timestamps,
  ...softDeleteColumn,
}, (cols) => [
  // Kayıt akışı tenant'ı e-postanın domain'inden bulur. Domain büyük harfle
  // yazılırsa eşleşme kaçar ve "domain kayıtlı değil" hatası alınır. Uygulama
  // katmanı küçük harfe çeviriyor; bu kısıt onu unutan bir yolu da kapatır.
  t.check("university_domains_domain_lowercase", sql`${cols.domain} = lower(${cols.domain})`),
]);

// ═══════════════════════════════════════════════
// FACULTIES & DEPARTMENTS (Üniversite > Fakülte > Bölüm)
// ═══════════════════════════════════════════════
export const faculties = table("faculties", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t.uuid("university_id")
    .references(() => universities.id, { onDelete: "restrict" })
    .notNull(),
  name: t.varchar({ length: 256 }).notNull(), // "Mühendislik Fakültesi"
  ...timestamps,
  ...softDeleteColumn,
});

export const departments = table("departments", {
  id: t.uuid().primaryKey().defaultRandom(),
  facultyId: t.uuid("faculty_id")
    .references(() => faculties.id, { onDelete: "restrict" })
    .notNull(),
  name: t.varchar({ length: 256 }).notNull(), // "Bilgisayar Mühendisliği"
  ...timestamps,
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
  ...timestamps,
  // KVKK silme talebi = ANONİMLEŞTİRME (bkz. docs/SEMA_VE_URUN_YOL_HARITASI.md §1.2).
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
// ROLES & PERMISSIONS (claim-based, iki katmanlı sistemin global katmanı)
// ═══════════════════════════════════════════════
/**
 * İleride (bkz. docs/design/07): bölge (region) kapsamı eklenecekse yol şudur —
 * `regions` tablosu + `universities.regionId`, ve `userRoles`'a nullable
 * `scopeUniversityId` / `scopeRegionId` kolonları. Böylece AYNI rol, kullanıcıya
 * farklı kapsamlarda (tek okul / bölge / global) atanabilir. Bu tur kapsam dışı.
 */
export const roles = table("roles", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t.uuid("university_id").references(() => universities.id, { onDelete: "cascade" }), // NULL = sistem geneli varsayılan rol
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
  ...timestamps,
}, (cols) => [
  // Aynı tenant'ta iki tane "university_admin" olamaz: aksi halde effective
  // permission ve rütbe çözümlemesi hangi satırı kastettiğimize göre değişirdi.
  t.uniqueIndex("role_name_per_university_idx").on(cols.universityId, cols.name),
  // Global şablon roller (university_id IS NULL) için yukarıdaki bileşik index
  // yetmez — Postgres NULL'ları birbirinden farklı sayar (users'taki aynı tuzak).
  t.uniqueIndex("global_role_name_idx")
    .on(cols.name)
    .where(sql`${cols.universityId} is null`),
]);

export const permissions = table("permissions", {
  id: t.uuid().primaryKey().defaultRandom(),
  key: t.varchar({ length: 100 }).notNull().unique(), // "club.approve", "announcement.create"
  description: t.varchar({ length: 256 }),
  ...timestamps,
});

export const rolePermissions = table("role_permissions", {
  roleId: t.uuid("role_id").references(() => roles.id, { onDelete: "cascade" }).notNull(),
  permissionId: t.uuid("permission_id").references(() => permissions.id, { onDelete: "cascade" }).notNull(),
  ...timestamps,
}, (cols) => [
  t.primaryKey({ columns: [cols.roleId, cols.permissionId] }),
]);

export const userRoles = table("user_roles", {
  userId: t.uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  roleId: t.uuid("role_id").references(() => roles.id, { onDelete: "cascade" }).notNull(),
  ...timestamps,
}, (cols) => [
  t.primaryKey({ columns: [cols.userId, cols.roleId] }),
  t.index("user_roles_user_id_idx").on(cols.userId),
  t.index("user_roles_role_id_idx").on(cols.roleId),
]);

export const userPermissions = table("user_permissions", {
  userId: t.uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  permissionId: t.uuid("permission_id").references(() => permissions.id, { onDelete: "cascade" }).notNull(),
  granted: t.boolean().default(true).notNull(), // false = rolden gelen yetkiyi geri al
  ...timestamps,
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
  universityId: t.uuid("university_id")
    .references(() => universities.id, { onDelete: "restrict" })
    .notNull(),

  name: t.varchar({ length: 256 }).notNull(),
  slug: t.varchar({ length: 256 }).notNull(), // "/clubs/robotik-kulubu"
  description: t.text(),
  logoUrl: t.varchar("logo_url", { length: 512 }),
  coverUrl: t.varchar("cover_url", { length: 512 }),

  status: clubStatusEnum().default("pending").notNull(),
  joinPolicy: joinPolicyEnum("join_policy").default("open").notNull(), // kulübe göre açık/onaylı katılım

  createdBy: t.uuid("created_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
  ...timestamps,
}, (cols) => [
  t.uniqueIndex("slug_per_university_idx").on(cols.universityId, cols.slug),
  t.index("clubs_created_by_idx").on(cols.createdBy), // "kurduğum kulüpler"
  // Bileşik yabancı anahtarların hedefi — bkz. users'taki eşi.
  t.unique("clubs_id_university_unique").on(cols.id, cols.universityId),
]);

// Birden fazla danışman hoca desteği (many-to-many)
export const clubAdvisors = table("club_advisors", {
  clubId: t.uuid("club_id").notNull(),
  userId: t.uuid("user_id").notNull(),
  // Tek kolonluk FK'ler yerine BİLEŞİK FK kullanılıyor (bkz. clubMembers).
  universityId: t.uuid("university_id").notNull(),
  ...timestamps,
}, (cols) => [
  t.primaryKey({ columns: [cols.clubId, cols.userId] }),
  compositeForeignKey({
    columns: [cols.clubId, cols.universityId],
    foreignColumns: [clubs.id, clubs.universityId],
    name: "club_advisors_club_tenant_fkey",
  }).onDelete("cascade"),
  compositeForeignKey({
    columns: [cols.userId, cols.universityId],
    foreignColumns: [users.id, users.universityId],
    name: "club_advisors_user_tenant_fkey",
  }).onDelete("cascade"),
  t.index("club_advisors_club_id_idx").on(cols.clubId),
  t.index("club_advisors_user_id_idx").on(cols.userId),
]);

// Kulübün iletişim/sosyal medya linkleri (esnek, tek tek kolon değil)
// platform: pgEnum DEĞİL, bilinçli — bu liste sık büyür (linkedin, youtube,
// tiktok...) ve her yeni platform için migration üretmek istemiyoruz. Typo
// güvenliğini kod tarafındaki `clubs.types.ts` → ContactPlatform (as const)
// katalogu sağlar (aynı kalıp: notifications.type, audit_logs.action).
export const clubContactLinks = table("club_contact_links", {
  id: t.uuid().primaryKey().defaultRandom(),
  clubId: t.uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
  platform: t.varchar({ length: 32 }).notNull(),
  url: t.varchar({ length: 512 }).notNull(),
  ...timestamps,
}, (cols) => [
  t.uniqueIndex("club_platform_idx").on(cols.clubId, cols.platform),
]);

// ═══════════════════════════════════════════════
// CLUB MEMBERS (kulüp bazlı rol katmanı — şimdilik dönemsel değil)
// ═══════════════════════════════════════════════
export const clubRoleEnum = pgEnum("club_role", ["member", "officer", "president"]);
export const membershipStatusEnum = pgEnum("membership_status", ["pending", "approved", "rejected"]);

/**
 * ÇAPRAZ-TENANT KİLİDİ (bkz. docs/SEMA_VE_URUN_YOL_HARITASI.md §1.1)
 *
 * Bu tablo eskiden yalnızca (club_id, user_id) tutuyordu. O halde A üniversitesindeki
 * bir kullanıcıyı B üniversitesinin kulübüne yazan bir servis hatası, veritabanı
 * seviyesinde TAMAMEN GEÇERLİ bir satırdı — tek savunma uygulama katmanıydı.
 *
 * Çözüm: satır kendi `university_id`'sini taşır ve İKİ bileşik yabancı anahtarla
 * hem kulübe hem kullanıcıya bağlanır. İkisi de aynı `university_id` kolonunu
 * kullandığı için Postgres şunu zorunlu kılar:
 *
 *     kulübün üniversitesi == satırın üniversitesi == kullanıcının üniversitesi
 *
 * Yani çapraz-tenant üyelik artık YAZILAMAZ; servis hatası 500 değil, kısıt ihlali
 * olarak DB'de durur. `university_id` burada denormalizasyon değil, kilidin kendisidir.
 *
 * Yan etki (kasıtlı): platform hesaplarının `university_id`'si NULL olduğu için
 * (super_admin, platform_support) hiçbir kulübe üye/danışman olamazlar.
 */
export const clubMembers = table("club_members", {
  clubId: t.uuid("club_id").notNull(),
  userId: t.uuid("user_id").notNull(),
  universityId: t.uuid("university_id").notNull(),

  role: clubRoleEnum().default("member").notNull(),
  status: membershipStatusEnum().default("pending").notNull(), // clubs.joinPolicy'ye göre app katmanında set edilir

  joinedAt: t.timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  /**
   * Üyelikten ayrılma anı. NULL = hâlâ üye.
   *
   * Ayrılma artık satırı SİLMİYOR: silinirse "geçen dönem kim üyeydi", "kaç kişi
   * ayrıldı" gibi sorular kalıcı olarak cevapsız kalır — kulübün okula/danışmana
   * verdiği faaliyet raporunun ham verisi budur.
   *
   * BİLİNEN SINIR: birincil anahtar hâlâ (club_id, user_id) olduğu için bir kişi
   * aynı kulüpten ayrılıp tekrar katılırsa AYNI satır yeniden kullanılır — yani
   * yalnızca EN SON ayrılış saklanır, çoklu giriş-çıkış döngüsü tutulamaz. Tam
   * tarihçe için birincil anahtarın vekil (surrogate) bir `id`ye çevrilip
   * "(club_id, user_id) WHERE left_at IS NULL" kısmi tekillik index'ine geçmesi
   * gerekir. Bu bilinçli olarak ERTELENDİ: asıl değerini dönem (academic term)
   * kavramıyla kazanacak, o yüzden Tier 3.3 ile birlikte yapılmalı.
   */
  leftAt: t.timestamp("left_at", { withTimezone: true }),
  ...timestamps,
}, (cols) => [
  t.primaryKey({ columns: [cols.clubId, cols.userId] }),
  compositeForeignKey({
    columns: [cols.clubId, cols.universityId],
    foreignColumns: [clubs.id, clubs.universityId],
    name: "club_members_club_tenant_fkey",
  }).onDelete("cascade"),
  compositeForeignKey({
    columns: [cols.userId, cols.universityId],
    foreignColumns: [users.id, users.universityId],
    name: "club_members_user_tenant_fkey",
  }).onDelete("cascade"),
  t.index("club_members_club_id_idx").on(cols.clubId),
  t.index("club_members_user_id_idx").on(cols.userId),
]);

// ═══════════════════════════════════════════════
// CLUB GALLERY
// ═══════════════════════════════════════════════
export const clubGallery = table("club_gallery", {
  id: t.uuid().primaryKey().defaultRandom(),
  clubId: t.uuid("club_id").notNull(),
  // Kulüp tarafı bileşik FK ile kilitli (bkz. clubMembers). YÜKLEYEN tarafında
  // bileşik FK YOK: `uploadedBy` zaten kulüp üyeliğiyle sınırlanıyor ve buraya
  // bir tenant kilidi koymak, platform hesaplarının içerik girmesini KALICI
  // olarak yasaklardı — bu bir ürün kararı, sessizce şemaya gömülmemeli.
  universityId: t.uuid("university_id").notNull(),
  imageUrl: t.varchar("image_url", { length: 512 }).notNull(),
  caption: t.varchar({ length: 256 }),
  uploadedBy: t.uuid("uploaded_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
  ...timestamps,
}, (cols) => [
  compositeForeignKey({
    columns: [cols.clubId, cols.universityId],
    foreignColumns: [clubs.id, clubs.universityId],
    name: "club_gallery_club_tenant_fkey",
  }).onDelete("cascade"),
  // Kulüp detay sayfasının galeri sorgusu.
  t.index("club_gallery_club_idx").on(cols.clubId, cols.createdAt.desc()),
]);

// ═══════════════════════════════════════════════
// ANNOUNCEMENTS (şimdilik sadece kulüp bazlı)
// ═══════════════════════════════════════════════
export const announcements = table("announcements", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t.uuid("university_id")
    .references(() => universities.id, { onDelete: "restrict" })
    .notNull(), // hızlı sorgu için denormalize
  clubId: t.uuid("club_id").notNull(), // ileride okul geneli için nullable'a çevrilebilir

  authorId: t.uuid("author_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  title: t.varchar({ length: 256 }).notNull(),
  content: t.text().notNull(),
  ...timestamps,
}, (cols) => [
  // Denormalize `university_id` kulübünkiyle SAPABİLİRDİ (iki ayrı tekil FK
  // birbirini kontrol etmez). Bileşik FK ikisini birbirine kilitler; yazar
  // tarafı bilinçli olarak serbest (bkz. clubGallery'deki aynı gerekçe).
  compositeForeignKey({
    columns: [cols.clubId, cols.universityId],
    foreignColumns: [clubs.id, clubs.universityId],
    name: "announcements_club_tenant_fkey",
  }).onDelete("cascade"),
  // Kulüp detay sayfasının duyuru akışı (en yeniden eskiye) — en sık çağrılan okuma.
  t.index("announcements_club_created_idx").on(cols.clubId, cols.createdAt.desc()),
]);

// ═══════════════════════════════════════════════
// NOTIFICATIONS (kalıcı bildirimler + gerçek zamanlı WS teslimatı)
// ═══════════════════════════════════════════════
export const notifications = table("notifications", {
  id: t.uuid().primaryKey().defaultRandom(),
  userId: t.uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),

  // pgEnum DEĞİL, bilinçli: bildirim tipleri sık sık eklenir ve her yeni tip
  // için migration üretmek istemiyoruz. Typo güvenliğini kod tarafındaki
  // `notifications.types.ts` → NotificationType (as const) katalogu sağlar
  // (aynı kalıp: *.permissions.ts). DB asıl kaynak olmaya devam eder.
  type: t.varchar({ length: 64 }).notNull(), // "account.verified", "club.application.decided"...

  title: t.varchar({ length: 256 }).notNull(),
  body: t.text(),
  // Derin link (deep link) için serbest yük: { clubId, applicationId, ... }
  data: t.jsonb().$type<Record<string, unknown>>(),

  readAt: t.timestamp("read_at", { withTimezone: true }), // NULL = okunmamış
  ...timestamps,
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
  userId: t.uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  endpoint: t.text().notNull().unique(),
  p256dh: t.text().notNull(), // istemci public anahtarı (payload şifreleme)
  auth: t.text().notNull(),   // istemci auth secret'ı
  ...timestamps,
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
  universityId: t.uuid("university_id")
    .references(() => universities.id, { onDelete: "restrict" })
    .notNull(),

  proposedName: t.varchar("proposed_name", { length: 256 }).notNull(),
  description: t.text(),
  applicantId: t.uuid("applicant_id").notNull(),

  status: applicationStatusEnum().default("pending").notNull(), // özet durum, approvals adımlarından türetilir
  ...timestamps,
}, (cols) => [
  // Başvuran, başvurduğu üniversitenin kullanıcısı OLMAK ZORUNDA. Akış zaten
  // `requireTenant()` ile korunuyor (bkz. clubs/routes/applications.routes.ts),
  // bu kısıt onu DB'de kalıcı kılar.
  // Not: `clubApplicationApprovals.approverId` bilinçli olarak kilitlenmedi —
  // bir platform hesabının (super_admin) onay adımına düşmesi meşru bir senaryo.
  compositeForeignKey({
    columns: [cols.applicantId, cols.universityId],
    foreignColumns: [users.id, users.universityId],
    name: "club_applications_applicant_tenant_fkey",
  }).onDelete("restrict"),
  // Yönetim panelindeki başvuru listesi (tenant + duruma göre filtre).
  t.index("club_applications_university_status_idx").on(cols.universityId, cols.status),
  // "Başvurularım".
  t.index("club_applications_applicant_idx").on(cols.applicantId),
]);

// Her onay adımı ayrı bir satır. Şimdilik tek adım (step: 1) kullanılacak,
// ileride SKS gibi ikinci bir onay eklemek için sadece step: 2 satırı eklenir — şema değişmez.
export const clubApplicationApprovals = table("club_application_approvals", {
  id: t.uuid().primaryKey().defaultRandom(),
  applicationId: t.uuid("application_id")
    .references(() => clubApplications.id, { onDelete: "cascade" })
    .notNull(),

  step: t.integer().notNull(), // 1: danışman, 2: SKS (ileride)...
  approverRole: t.varchar("approver_role", { length: 100 }), // bilgi amaçlı: "advisor", "sks_officer"
  approverId: t.uuid("approver_id").references(() => users.id, { onDelete: "set null" }), // gerçekte onaylayan kişi

  status: applicationApprovalStatusEnum().default("pending").notNull(),
  /**
   * Karar gerekçesi. Reddederken ZORUNLU (API katmanında): öğrenci başvurusunun
   * neden reddedildiğini bilmeden düzeltip yeniden başvuramaz — ve gerekçesiz
   * ret, denetlenebilir bir karar değildir. Onayda serbest (opsiyonel not).
   */
  note: t.text(),
  reviewedAt: t.timestamp("reviewed_at", { withTimezone: true }),
  ...timestamps,
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
// FK'ler restrict: denetim izi bir kayıttır, başka bir satırın silinmesinin
// yan etkisiyle kaybolamaz/anonimleşemez.
export const auditLogs = table("audit_logs", {
  id: t.uuid().primaryKey().defaultRandom(),
  // null = platform seviyesi işlem (tenant'sız super_admin aksiyonu, örn. üniversite oluşturma).
  universityId: t.uuid("university_id").references(() => universities.id, { onDelete: "restrict" }),
  actorId: t.uuid("actor_id").references(() => users.id, { onDelete: "restrict" }).notNull(),

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

  ...createdAtColumn,
}, (cols) => [
  // Tenant'ın denetim akışı (en yeniden eskiye) — keyset sayfalama bunu kullanır.
  t.index("audit_logs_university_created_idx").on(cols.universityId, cols.createdAt.desc()),
  // "Bu aktör neler yaptı?" filtresi.
  t.index("audit_logs_actor_created_idx").on(cols.actorId, cols.createdAt.desc()),
  // "Bu kaynağa kimler dokundu?" filtresi.
  t.index("audit_logs_target_idx").on(cols.targetType, cols.targetId),
]);

// ═══════════════════════════════════════════════
// ACTIVITIES (kulüp etkinlikleri)
// ═══════════════════════════════════════════════
// "events" DEĞİL "activities": kod tabanında "event" zaten realtime katmanın
// terimi (notifications ServerEvent / WS { event: ... }). Domain'i activities
// yaparak bu karışıklığı önlüyoruz.
//
// Etkinliğin KULÜBÜ burada TUTULMAZ (kasıtlı): kulüp↔etkinlik M:N'dir
// (activity_clubs). Böylece iki kulüp — ve ileride iki ÜNİVERSİTE (turnuva) —
// aynı etkinliği paylaşabilir, ŞEMA DEĞİŞMEDEN. universityId de yok: etkinliğin
// tenant'ı host/co_host kulüplerinden TÜRETİLİR (departments'ın university'yi
// faculty üzerinden türetmesiyle aynı normalizasyon felsefesi) — böylece
// cross-university etkinlikte "tek tenant" yalanına düşmeyiz.
export const activityStatusEnum = pgEnum("activity_status", ["draft", "published", "cancelled"]);
// university = tenant'taki herkes görür+katılır (keşif); members = yalnızca host
// kulübün onaylı üyeleri.
export const activityVisibilityEnum = pgEnum("activity_visibility", ["university", "members"]);

export const activities = table("activities", {
  id: t.uuid().primaryKey().defaultRandom(),

  title: t.varchar({ length: 256 }).notNull(),
  description: t.text(),
  location: t.varchar({ length: 512 }), // fiziksel adres/oda ya da online link
  coverUrl: t.varchar("cover_url", { length: 512 }),

  // timestamptz (Tier 0.2): etkinlik saati bu üründeki en kritik zaman verisi —
  // çok saat dilimli bir SaaS'ta tz'siz saklamak doğrudan kayıp-saat hatasıdır.
  startsAt: t.timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: t.timestamp("ends_at", { withTimezone: true }), // nullable: bitiş belirsiz olabilir
  capacity: t.integer(), // NULL = sınırsız

  status: activityStatusEnum().default("draft").notNull(),
  visibility: activityVisibilityEnum().default("university").notNull(),

  createdBy: t.uuid("created_by").references(() => users.id).notNull(),
  ...timestamps,
}, (cols) => [
  // "Yaklaşan etkinlikler" zaman sorgusu (keşif akışında da kullanılır).
  t.index("activities_starts_at_idx").on(cols.startsAt),
]);

// Etkinliğe katılan kulüpler (M:N). clubs.createdBy + clubAdvisors deseninin
// etkinlik karşılığı: TAM BİR 'host' (sahibi/kontrol eden) + sıfır veya daha
// fazla 'co_host'. Aynı üniversiteden de farklı üniversiteden de olabilir —
// yapı ikisini de kaldırır; "kim ortak olabilir" bir POLİTİKA sorusudur, şema değil.
export const activityClubRoleEnum = pgEnum("activity_club_role", ["host", "co_host"]);
// co-host daveti: host davet eder (invited), hedef kulüp staff'ı kabul eder (accepted).
// Host satırı DAİMA accepted'tır (kendi etkinliği). Yalnızca 'accepted' bağlar
// tenant/görünürlük/keşifte sayılır — invited bir co-host henüz "katılan kulüp" değildir.
export const activityClubStatusEnum = pgEnum("activity_club_status", ["invited", "accepted"]);

export const activityClubs = table("activity_clubs", {
  activityId: t.uuid("activity_id").references(() => activities.id).notNull(),
  clubId: t.uuid("club_id").references(() => clubs.id).notNull(),
  role: activityClubRoleEnum().default("host").notNull(),
  status: activityClubStatusEnum().default("accepted").notNull(),
  ...timestamps,
}, (cols) => [
  t.primaryKey({ columns: [cols.activityId, cols.clubId] }),
  t.index("activity_clubs_activity_id_idx").on(cols.activityId),
  t.index("activity_clubs_club_id_idx").on(cols.clubId), // "kulübün etkinlikleri"
  // Etkinlik başına EN FAZLA bir 'host' — kontrol tekildir, DB garanti eder.
  t.uniqueIndex("activity_single_host_idx").on(cols.activityId).where(sql`${cols.role} = 'host'`),
]);

// RSVP + yoklama. Kulüpten BAĞIMSIZ: katılım kişiseldir (kullanıcı ↔ etkinlik).
// Skor/sıralama (leaderboard) BİLİNÇLİ OLARAK burada tutulmaz — o geldiğinde
// kendi tablolarını (tournaments/match_results...) alır; bu tablo yalnızca
// "gelecek mi / geldi mi" niyet+yoklamasıdır.
export const rsvpStatusEnum = pgEnum("rsvp_status", ["going", "interested", "waitlist"]);

export const activityAttendees = table("activity_attendees", {
  activityId: t.uuid("activity_id").references(() => activities.id).notNull(),
  userId: t.uuid("user_id").references(() => users.id).notNull(),

  status: rsvpStatusEnum().default("going").notNull(),
  checkedInAt: t.timestamp("checked_in_at", { withTimezone: true }), // NULL = yoklamada işaretlenmedi (RSVP ≠ katılım)
  ...timestamps,
}, (cols) => [
  t.primaryKey({ columns: [cols.activityId, cols.userId] }), // bir kullanıcı bir etkinliğe tek RSVP
  t.index("activity_attendees_activity_id_idx").on(cols.activityId), // katılımcı listesi + sayaç
  t.index("activity_attendees_user_id_idx").on(cols.userId), // "etkinliklerim / takvimim"
]);

// ═══════════════════════════════════════════════
// MEDIA (yüklenen dosyalar — logo/kapak/galeri/avatar)
// ═══════════════════════════════════════════════
// Yüklenen her dosyanın kaydı: kim yükledi, nerede (storageKey), ne (contentType/
// boyut), ne amaçla. Dosyanın kendisi core/storage adaptöründe (disk/S3); bu tablo
// META'yı + sahipliği tutar. URL'ler storageKey'den türetilir (UPLOAD_PUBLIC_BASE_URL).
//
// Not: Mevcut *Url alanları (clubs.logoUrl, users.photoUrl, clubGallery.imageUrl...)
// hâlâ düz URL string'i taşır — upload endpoint'i bir URL üretir, o alanlara YAZILIR.
// Böylece şema/ilişki karmaşası olmadan gerçek yükleme eklenir (referans sayımı yok;
// yetim dosya temizliği ileride bir job'a bırakılır).
export const media = table("media", {
  id: t.uuid().primaryKey().defaultRandom(),
  uploaderId: t.uuid("uploader_id").references(() => users.id).notNull(),
  // Platform hesapları (universityId NULL) da yükleyebilir → nullable.
  universityId: t.uuid("university_id").references(() => universities.id),

  storageKey: t.varchar("storage_key", { length: 256 }).notNull().unique(), // "<uuid>.<ext>"
  contentType: t.varchar("content_type", { length: 100 }).notNull(),
  sizeBytes: t.integer("size_bytes").notNull(),
  // pgEnum DEĞİL (notification.type ile aynı gerekçe): yeni amaç migration istemesin.
  purpose: t.varchar({ length: 50 }).default("other").notNull(), // avatar/club_logo/club_cover/gallery/other

  ...createdAtColumn, // dosyalar değişmez → updatedAt YOK (append-only kalıbı)
}, (cols) => [
  t.index("media_uploader_created_idx").on(cols.uploaderId, cols.createdAt.desc()),
]);
