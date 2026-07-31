import { pgTable as table } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import * as t from "drizzle-orm/pg-core";
import { timestamps } from "../../core/db/base.entity";
import { users } from "./users";

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
