import { pgTable as table } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { timestamps } from "../../core/db/base.entity";
import { universities } from "./university";
import { users } from "./users";
import { clubs } from "./clubs";
import { compositeForeignKey } from "./helpers";

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
