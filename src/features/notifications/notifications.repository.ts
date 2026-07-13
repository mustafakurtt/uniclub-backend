import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { notifications } from "../../db/schema";
import { BaseRepository } from "../../core/db";
import { CreateNotificationPayload, Notification } from "./notifications.types";

/**
 * Bildirim veri erişimi. Tek sahip tablo (hard-delete). BaseRepository'den mekanik
 * CRUD + keyset sayfalamayı miras alır; okundu/okunmamış mutasyonları isNull/coalesce
 * SQL gerektirdiği için özel kalır.
 */
class NotificationsRepository extends BaseRepository<typeof notifications, typeof db.query.notifications> {
  constructor() {
    super(db, notifications, { query: db.query.notifications });
  }

  add(userId: string, payload: CreateNotificationPayload): Promise<Notification> {
    return this.create({
      userId,
      type: payload.type,
      title: payload.title,
      body: payload.body ?? null,
      data: payload.data ?? null,
    });
  }

  /**
   * Kullanıcının bildirim akışı, en yeniden eskiye — keyset (cursor) sayfalama
   * (`createdAt`'e göre). OFFSET yerine keyset: derin sayfada yavaşlamaz ve iki sayfa
   * arasında yeni bildirim gelirse kayıt atlamaz/tekrarlamaz.
   *
   * Not: `createdAt` teorik olarak eşitlenebilir; pratikte mikrosaniye çözünürlüğü
   * yeterlidir. Tam determinizm gerekirse (createdAt, id) bileşik cursor'a geçilmeli.
   */
  listByUser(userId: string, limit: number, cursor?: Date): Promise<Notification[]> {
    return this.listKeyset({ where: { userId }, cursorColumn: notifications.createdAt, cursor, limit });
  }

  /** Okunmamış bildirim sayısı — partial index (read_at is null) tarafından karşılanır. */
  async countUnread(userId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return row?.count ?? 0;
  }

  /**
   * Bildirimi okundu işaretler. `userId` koşulu ZORUNLU: aksi halde bir kullanıcı
   * başkasının bildirimini id'sini tahmin ederek okundu yapabilirdi (IDOR).
   * Zaten okunmuşsa `readAt` korunur (ilk okuma zamanı kaybolmasın).
   */
  async markRead(userId: string, notificationId: string): Promise<Notification | undefined> {
    const [updated] = await db
      .update(notifications)
      .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .returning();
    return updated;
  }

  /** Kullanıcının tüm okunmamışlarını okundu işaretler, etkilenen satır sayısını döner. */
  async markAllRead(userId: string): Promise<number> {
    const updated = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    return updated.length;
  }
}

export const notificationsRepository = new NotificationsRepository();
