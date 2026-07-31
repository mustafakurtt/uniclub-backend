import { pgTable as table, pgEnum } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import * as t from "drizzle-orm/pg-core";
import { timestamps } from "../../core/db/base.entity";
import { users } from "./users";
import { clubs } from "./clubs";

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
//
// PAYLAŞILAN PG ENUM'LAR (bilinçli kuplaj):
// `activity_status` ve `activity_visibility` duyurular (`announcements`) ile de
// kullanılır — aynı semantik, tek tip yüzeyi. Yeni değer eklendiğinde DUYURULARI
// da düşün (duyuruda `cancelled` kullanılmaz; servis draft/published ile sınırlı).
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
  /** Planlanan yayın anı (UTC); taslak kalır, job tetiklenince published olur. */
  scheduledPublishAt: t.timestamp("scheduled_publish_at", { withTimezone: true }),

  createdBy: t.uuid("created_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
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
  activityId: t.uuid("activity_id").references(() => activities.id, { onDelete: "cascade" }).notNull(),
  clubId: t.uuid("club_id").references(() => clubs.id, { onDelete: "restrict" }).notNull(),
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
  activityId: t.uuid("activity_id").references(() => activities.id, { onDelete: "cascade" }).notNull(),
  userId: t.uuid("user_id").references(() => users.id, { onDelete: "restrict" }).notNull(),

  status: rsvpStatusEnum().default("going").notNull(),
  checkedInAt: t.timestamp("checked_in_at", { withTimezone: true }), // NULL = yoklamada işaretlenmedi (RSVP ≠ katılım)
  ...timestamps,
}, (cols) => [
  t.primaryKey({ columns: [cols.activityId, cols.userId] }), // bir kullanıcı bir etkinliğe tek RSVP
  t.index("activity_attendees_activity_id_idx").on(cols.activityId), // katılımcı listesi + sayaç
  t.index("activity_attendees_user_id_idx").on(cols.userId), // "etkinliklerim / takvimim"
]);
