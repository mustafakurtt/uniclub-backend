import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../../db";
import { notificationMutes } from "../../db/schema";

export type NotificationMuteRow = typeof notificationMutes.$inferSelect;

class NotificationMutesRepository {
  /** Kullanıcının tüm susturma kayıtları. */
  listByUser(userId: string): Promise<NotificationMuteRow[]> {
    return db
      .select()
      .from(notificationMutes)
      .where(eq(notificationMutes.userId, userId))
      .orderBy(notificationMutes.createdAt);
  }

  /**
   * Fan-out filtresi: verilen adaylardan bu bildirim için susturulmuş user_id kümesi.
   * Tek sorgu — alıcı sayısından bağımsız.
   */
  async findMutedUserIds(
    userIds: string[],
    type: string,
    clubId: string | null
  ): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();

    const clubMatch = clubId
      ? or(isNull(notificationMutes.clubId), eq(notificationMutes.clubId, clubId))
      : isNull(notificationMutes.clubId);

    const rows = await db
      .select({ userId: notificationMutes.userId })
      .from(notificationMutes)
      .where(
        and(
          inArray(notificationMutes.userId, userIds),
          or(isNull(notificationMutes.type), eq(notificationMutes.type, type)),
          clubMatch
        )
      );

    return new Set(rows.map((r) => r.userId));
  }

  /** Susturma ekle — idempotent (UNIQUE + onConflictDoNothing). */
  async addMute(
    userId: string,
    type: string | null,
    clubId: string | null
  ): Promise<void> {
    await db
      .insert(notificationMutes)
      .values({ userId, type, clubId })
      .onConflictDoNothing({
        target: [notificationMutes.userId, notificationMutes.type, notificationMutes.clubId],
      });
  }

  /** Susturmayı kaldır — idempotent (satır yoksa no-op). */
  async removeMute(userId: string, type: string | null, clubId: string | null): Promise<void> {
    const typeCond =
      type === null ? isNull(notificationMutes.type) : eq(notificationMutes.type, type);
    const clubCond =
      clubId === null ? isNull(notificationMutes.clubId) : eq(notificationMutes.clubId, clubId);

    await db
      .delete(notificationMutes)
      .where(and(eq(notificationMutes.userId, userId), typeCond, clubCond));
  }
}

export const notificationMutesRepository = new NotificationMutesRepository();
