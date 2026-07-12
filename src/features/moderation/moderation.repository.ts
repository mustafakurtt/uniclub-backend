import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "../../db";
import { users, userModerationActions } from "../../db/schema";
import { BaseRepository } from "../../core/db/base.repository";
import type { ModerationHistoryItem } from "./moderation.types";

/**
 * Kullanıcı moderasyonu veri erişimi. Feature durumu/banı SAHİPLENDİĞİ için hem
 * append-only moderasyon LOG'unu (BaseRepository — userModerationActions) hem de
 * users tablosundaki durum/şifre mutasyonlarını burada toplar.
 *
 * Log tablosu append-only: soft-delete/relational gerekmez → builder tabanlı.
 */
class ModerationRepository extends BaseRepository<typeof userModerationActions> {
  constructor() {
    super(db, userModerationActions); // create() = bir moderasyon işlemi kaydeder
  }

  /** Hedef kullanıcı bu tenant'a ait mi? (tenant-scope + varlık kontrolü tek sorguda) */
  findUserInTenant(universityId: string, userId: string) {
    return db.query.users.findFirst({ where: { id: userId, universityId } });
  }

  async setStatus(userId: string, status: "pending" | "active" | "suspended") {
    const [updated] = await db
      .update(users)
      .set({ status })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  /** Yeni şifre hash'ini yazar ve kullanıcıyı sonraki girişte değişime zorlar. */
  async setPassword(userId: string, passwordHash: string) {
    const [updated] = await db
      .update(users)
      .set({ passwordHash, mustChangePassword: true })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  /** Kullanıcının moderasyon geçmişi (en yeniden), işlemi yapan yöneticiyle. Keyset sayfalama. */
  async listHistoryForUser(userId: string, limit: number, cursor?: Date): Promise<ModerationHistoryItem[]> {
    const conditions = [eq(userModerationActions.userId, userId)];
    if (cursor) conditions.push(lt(userModerationActions.createdAt, cursor));

    const rows = await db
      .select({
        action: userModerationActions,
        actor: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(userModerationActions)
      // leftJoin: yönetici satırı silinse bile geçmiş kaydı akıştan düşmesin.
      .leftJoin(users, eq(userModerationActions.actorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(userModerationActions.createdAt))
      .limit(limit);

    return rows.map(({ action, actor }) => ({ ...action, actor }));
  }
}

export const moderationRepository = new ModerationRepository();
