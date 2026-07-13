import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "../../db";
import { users, userModerationActions } from "../../db/schema";
import { BaseRepository } from "../../core/db";
import type { ModerationHistoryItem } from "./moderation.types";

/**
 * Kullanıcı moderasyonu veri erişimi. Feature durumu/banı SAHİPLENDİĞİ için hem
 * append-only moderasyon LOG'unu (BaseRepository — userModerationActions) hem de
 * users tablosundaki durum/şifre mutasyonlarını burada toplar. users mutasyonları
 * için hafif bir BaseRepository örneği kullanılır (admin/auth ile aynı kalıp).
 *
 * Log tablosu append-only: soft-delete/relational gerekmez → builder tabanlı.
 */
const usersRepo = new BaseRepository(db, users);

class ModerationRepository extends BaseRepository<typeof userModerationActions> {
  constructor() {
    super(db, userModerationActions); // create() = bir moderasyon işlemi kaydeder
  }

  /** Hedef kullanıcı bu tenant'a ait mi? (tenant-scope + varlık kontrolü tek sorguda) */
  findUserInTenant(universityId: string, userId: string) {
    return usersRepo.findOne({ id: userId, universityId });
  }

  setStatus(userId: string, status: "pending" | "active" | "suspended") {
    return usersRepo.updateById(userId, { status });
  }

  /** Yeni şifre hash'ini yazar ve kullanıcıyı sonraki girişte değişime zorlar. */
  setPassword(userId: string, passwordHash: string) {
    return usersRepo.updateById(userId, { passwordHash, mustChangePassword: true });
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
