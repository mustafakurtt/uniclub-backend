import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { CreateNotificationPayload, Notification } from "./notifications.types";

export const notificationsRepository = {
  async create(userId: string, payload: CreateNotificationPayload): Promise<Notification> {
    const [inserted] = await db
      .insert(schema.notifications)
      .values({
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body ?? null,
        data: payload.data ?? null,
      })
      .returning();
    return inserted;
  },

  /**
   * Kullanıcının bildirim akışı, en yeniden eskiye.
   *
   * OFFSET değil **keyset** (cursor) sayfalama: cursor, son görülen satırın
   * `createdAt`'idir. OFFSET, sayfa derinleştikçe yavaşlar ve iki sayfa arasında
   * yeni bildirim gelirse kayıt atlanır/tekrarlanır — akış (feed) için yanlıştır.
   *
   * Not: `createdAt` teorik olarak eşitlenebilir; pratikte timestamp çözünürlüğü
   * (mikrosaniye) yeterlidir. Tam determinizm gerekirse (createdAt, id) bileşik
   * cursor'a geçilmelidir.
   */
  async listByUser(userId: string, limit: number, cursor?: Date): Promise<Notification[]> {
    return await db
      .select()
      .from(schema.notifications)
      .where(
        cursor
          ? and(eq(schema.notifications.userId, userId), lt(schema.notifications.createdAt, cursor))
          : eq(schema.notifications.userId, userId)
      )
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit);
  },

  /** Okunmamış bildirim sayısı — partial index (read_at is null) tarafından karşılanır. */
  async countUnread(userId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
    return row?.count ?? 0;
  },

  /**
   * Bildirimi okundu işaretler. `userId` koşulu ZORUNLU: aksi halde bir kullanıcı
   * başkasının bildirimini id'sini tahmin ederek okundu yapabilirdi (IDOR).
   * Zaten okunmuşsa `readAt` korunur (ilk okuma zamanı kaybolmasın).
   */
  async markRead(userId: string, notificationId: string): Promise<Notification | undefined> {
    const [updated] = await db
      .update(schema.notifications)
      .set({ readAt: sql`coalesce(${schema.notifications.readAt}, now())` })
      .where(
        and(eq(schema.notifications.id, notificationId), eq(schema.notifications.userId, userId))
      )
      .returning();
    return updated;
  },

  /** Kullanıcının tüm okunmamışlarını okundu işaretler, etkilenen satır sayısını döner. */
  async markAllRead(userId: string): Promise<number> {
    const updated = await db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)))
      .returning({ id: schema.notifications.id });
    return updated.length;
  },
};
