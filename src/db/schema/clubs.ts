import { pgTable as table, pgEnum } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { timestamps } from "../../core/db/base.entity";
import { universities } from "./university";
import { users } from "./users";
import { compositeForeignKey } from "./helpers";

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
  /** Danışmanlıktan çekilme — NULL = aktif danışman. */
  leftAt: t.timestamp("left_at", { withTimezone: true }),
  leaveReason: t.text("leave_reason"),
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
 * ÇAPRAZ-TENANT KİLİDİ (bkz. docs/planning/schema-product.md §1.1)
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
