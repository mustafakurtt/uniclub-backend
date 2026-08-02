import { pgTable as table } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import * as t from "drizzle-orm/pg-core";
import { timestamps } from "../../core/db/base.entity";
import { universities } from "./university";
import { users } from "./users";
import { clubs } from "./clubs";
import { compositeForeignKey } from "./helpers";
import { activityStatusEnum, activityVisibilityEnum } from "./activities";

// ═══════════════════════════════════════════════
// ANNOUNCEMENTS (kulüp bazlı + okul geneli)
// ═══════════════════════════════════════════════
// Etkinliklerle aynı PG enum'ları paylaşır (`activity_status` / `activity_visibility`).
// İsim `activity_*` olsa da duyuru yaşam döngüsü aynı değer kümesini kullanır;
// etkinliğe yeni enum değeri eklenirse duyuru tarafını da değerlendir.
export const announcements = table("announcements", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t.uuid("university_id")
    .references(() => universities.id, { onDelete: "restrict" })
    .notNull(), // hızlı sorgu için denormalize
  // NULL = okul geneli duyuru (tenant yayını). Dolu = kulüp duyurusu.
  // Kulüp silme yok (yalnızca arşiv) → RESTRICT; activity_clubs ile aynı varsayım.
  clubId: t.uuid("club_id").references(() => clubs.id, { onDelete: "restrict" }),

  authorId: t.uuid("author_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  title: t.varchar({ length: 256 }).notNull(),
  content: t.text().notNull(),

  // Etkinliklerle aynı enum'lar (activity_status / activity_visibility) — frontend tek model.
  // Duyuruda `cancelled` kullanılmaz; servis yalnızca draft/published geçişlerini kabul eder.
  status: activityStatusEnum().default("draft").notNull(),
  publishedAt: t.timestamp("published_at", { withTimezone: true }),
  /** Tenant yerel saatinde planlanan yayın anı (UTC); yayınlanana kadar taslak kalır. */
  scheduledPublishAt: t.timestamp("scheduled_publish_at", { withTimezone: true }),
  pinned: t.boolean().notNull().default(false),
  visibility: activityVisibilityEnum().default("university").notNull(),
  /** Yayınlanmış duyuruda başlık/içerik değişince set edilir; taslakta null kalır. */
  editedAt: t.timestamp("edited_at", { withTimezone: true }),

  ...timestamps,
}, (cols) => [
  // Denormalize `university_id` kulübünkiyle SAPABİLİRDİ (iki ayrı tekil FK
  // birbirini kontrol etmez). Bileşik FK ikisini birbirine kilitler; yazar
  // tarafı bilinçli olarak serbest (bkz. clubGallery'deki aynı gerekçe).
  // Postgres MATCH SIMPLE: club_id NULL olduğunda bileşik FK uygulanmaz — tenant
  // kilidi okul geneli satırlarda university_id → universities FK ile korunur;
  // kulüp duyurularında (club_id dolu) kilidi aynen çalışır.
  compositeForeignKey({
    columns: [cols.clubId, cols.universityId],
    foreignColumns: [clubs.id, clubs.universityId],
    name: "announcements_club_tenant_fkey",
  }).onDelete("restrict"),
  // Kulüp detay sayfasının duyuru akışı (sabitlenen üstte, yayın zamanı azalan).
  t.index("announcements_club_published_idx").on(
    cols.clubId,
    cols.status,
    cols.pinned.desc(),
    cols.publishedAt.desc()
  ),
  // Okul geneli duyuru akışı (club_id IS NULL).
  t.index("announcements_university_published_idx")
    .on(cols.universityId, cols.status, cols.pinned.desc(), cols.publishedAt.desc())
    .where(sql`${cols.clubId} is null`),
]);
