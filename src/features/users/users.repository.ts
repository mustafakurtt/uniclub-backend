import { db } from "../../db";
import { users } from "../../db/schema";
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
    // Şifre değişince mustChangePassword sıfırlanır: admin sıfırlaması sonrası
    // kullanıcı kendi şifresini belirleyince "değiştirmeye zorla" bayrağı kalkar.
    await this.updateById(userId, { passwordHash, mustChangePassword: false });
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
      where: { userId },
      with: { club: true },
    });
  }
}

export const usersRepository = new UsersRepository();
