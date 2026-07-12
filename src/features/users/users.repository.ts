import { eq } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { UpdateProfilePayload } from "./users.types";

export const usersRepository = {
  async findProfileById(userId: string) {
    return await db.query.users.findFirst({
      where: { id: userId },
      with: { university: true, department: true, roles: true },
    });
  },

  async findUserById(userId: string) {
    return await db.query.users.findFirst({ where: { id: userId } });
  },

  async updateProfile(userId: string, data: UpdateProfilePayload) {
    const [updated] = await db
      .update(schema.users)
      .set(data)
      .where(eq(schema.users.id, userId))
      .returning();
    return updated;
  },

  async updatePasswordHash(userId: string, passwordHash: string) {
    // Şifre değişince mustChangePassword sıfırlanır: admin sıfırlaması sonrası
    // kullanıcı kendi şifresini belirleyince "değiştirmeye zorla" bayrağı kalkar.
    await db
      .update(schema.users)
      .set({ passwordHash, mustChangePassword: false })
      .where(eq(schema.users.id, userId));
  },

  async findClubMembershipsByUser(userId: string) {
    return await db.query.clubMembers.findMany({
      where: { userId },
      with: { club: true },
    });
  },

  async findClubApplicationsByUser(userId: string) {
    return await db.query.clubApplications.findMany({
      where: { applicantId: userId },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Danışmanı olduğum kulüpler (advisor rolündeki personel için). */
  async findAdvisedClubsByUser(userId: string) {
    return await db.query.clubAdvisors.findMany({
      where: { userId },
      with: { club: true },
    });
  },
};
