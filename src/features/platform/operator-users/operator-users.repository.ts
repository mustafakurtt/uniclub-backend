import { isNull } from "drizzle-orm";
import { db } from "../../../db";
import { users, userRoles } from "../../../db/schema";
import type { PlatformUserListItem } from "./operator-users.types";

/**
 * Platform hesapları (users.universityId IS NULL) veri erişimi.
 */
export const operatorUsersRepository = {
  async listPlatformUsers(): Promise<PlatformUserListItem[]> {
    const rows = await db.query.users.findMany({
      where: { universityId: { isNull: true }, deletedAt: { isNull: true } },
      columns: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
      with: { roles: { columns: { name: true } } },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      status: row.status,
      mustChangePassword: row.mustChangePassword,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      roles: row.roles.map((r) => r.name),
    }));
  },

  async findPlatformUserByEmail(email: string) {
    return await db.query.users.findFirst({
      where: { email, universityId: { isNull: true }, deletedAt: { isNull: true } },
      columns: { id: true },
    });
  },

  async insertPlatformUser(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
  }) {
    const [user] = await db
      .insert(users)
      .values({
        universityId: null,
        departmentId: null,
        studentNumber: null,
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        status: "active",
        mustChangePassword: true,
      })
      .returning({
        id: users.id,
        universityId: users.universityId,
        departmentId: users.departmentId,
        studentNumber: users.studentNumber,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        photoUrl: users.photoUrl,
        preferredLanguage: users.preferredLanguage,
        status: users.status,
        mustChangePassword: users.mustChangePassword,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        deletedAt: users.deletedAt,
      });
    return user;
  },

  async createPlatformUserWithRole(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    roleId: string;
  }) {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          universityId: null,
          departmentId: null,
          studentNumber: null,
          email: data.email,
          passwordHash: data.passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          status: "active",
          mustChangePassword: true,
        })
        .returning({
          id: users.id,
          universityId: users.universityId,
          departmentId: users.departmentId,
          studentNumber: users.studentNumber,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          photoUrl: users.photoUrl,
          preferredLanguage: users.preferredLanguage,
          status: users.status,
          mustChangePassword: users.mustChangePassword,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          deletedAt: users.deletedAt,
        });

      await tx.insert(userRoles).values({ userId: user.id, roleId: data.roleId });

      return user;
    });
  },
};
