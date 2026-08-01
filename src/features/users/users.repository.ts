import { db } from "../../db";
import { users } from "../../db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { BaseRepository } from "../../core/db";
import { UpdateProfilePayload } from "./users.types";

/**
 * Kullanıcı self-service veri erişimi. Birincil tablo `users` — profil/şifre yazımları
 * BaseRepository'nin `updateById`'siyle. Kulüp üyelikleri/başvuruları/danışmanlıkları
 * başka tabloları okuduğu için (cross-table) `db.query.*` ile özel kalır.
 */
class UsersRepository extends BaseRepository<typeof users, typeof db.query.users> {
  constructor() {
    super(db, users, { query: db.query.users });
  }

  findProfileById(userId: string) {
    return this.query!.findFirst({
      where: { id: userId },
      with: { university: true, department: true, roles: true },
    });
  }

  findUserById(userId: string) {
    return this.findById(userId);
  }

  updateProfile(userId: string, data: UpdateProfilePayload) {
    return this.updateById(userId, data);
  }

  async updatePasswordHash(userId: string, passwordHash: string) {
    // Şifre değişince mustChangePassword sıfırlanır; tokenVersion artar (diğer oturumlar düşer).
    const [updated] = await db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: false,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  findClubMembershipsByUser(userId: string) {
    return db.query.clubMembers.findMany({
      where: { userId },
      with: { club: true },
    });
  }

  findClubApplicationsByUser(userId: string) {
    return db.query.clubApplications.findMany({
      where: { applicantId: userId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Danışmanı olduğum kulüpler (advisor rolündeki personel için). */
  findAdvisedClubsByUser(userId: string) {
    return db.query.clubAdvisors.findMany({
      where: { userId, leftAt: { isNull: true } },
      with: { club: true },
    });
  }
}

export const usersRepository = new UsersRepository();
