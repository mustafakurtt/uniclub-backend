import { eq, and, isNull } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { CreateUserPayload, UniversityDomain, User } from "./auth.types";

export const authRepository = {
  /**
   * Domain adresine göre üniversiteyi ve domain tipini bulur.
   */
  async findUniversityByDomain(domain: string): Promise<UniversityDomain | undefined> {
    return await db.query.universityDomains.findFirst({
      where: { 
        domain: domain 
      },
    });
  },

  /**
   * Aynı üniversite içinde bu e-posta daha önce alınmış mı kontrol eder.
   */
  async findUserByEmailAndTenant(email: string, universityId: string): Promise<User | undefined> {
    return await db.query.users.findFirst({
      where: {
        email: email,
        universityId: universityId
      },
    });
  },

  /**
   * Yeni kullanıcıyı ve rolünü tek bir Transaction (İşlem bloğu) içinde kaydeder.
   */
  async createUserWithRole(userData: CreateUserPayload, roleName: string): Promise<User> {
    return await db.transaction(async (tx) => {
      // 1. Kullanıcıyı oluştur
      const [insertedUser] = await tx.insert(schema.users).values(userData).returning();

      // 2. İstenen rolü bul (V2 obje syntax'ı ile)
      const roleRecord = await tx.query.roles.findFirst({
        where: { 
          name: roleName 
        },
      });

      // 3. Kullanıcıya rolü ata
      if (roleRecord) {
        await tx.insert(schema.userRoles).values({
          userId: insertedUser.id,
          roleId: roleRecord.id,
        });
      }

      return insertedUser;
    });
  },

  async findUserByEmail(email: string): Promise<User | undefined> {
    return await db.query.users.findFirst({
      where: { email: email }
    });
  },

  /**
   * E-posta doğrulama token'ını kaydeder (emailVerifications tablosu).
   */
  async createEmailVerification(userId: string, token: string, expiresAt: Date) {
    const [inserted] = await db.insert(schema.emailVerifications).values({
      userId,
      token,
      expiresAt,
    }).returning();
    return inserted;
  },

  async findEmailVerificationByToken(token: string) {
    return await db.query.emailVerifications.findFirst({
      where: { token },
    });
  },

  async markEmailVerificationUsed(id: string): Promise<void> {
    await db.update(schema.emailVerifications).set({ usedAt: new Date() }).where(eq(schema.emailVerifications.id, id));
  },

  /**
   * Kullanıcının HENÜZ KULLANILMAMIŞ tüm doğrulama token'larını tüketilmiş sayar.
   * Yeniden gönderimden önce çağrılır: aynı anda birden fazla geçerli link
   * dolaşmasın (eski maildeki link anında ölür).
   */
  async invalidateUserEmailVerifications(userId: string): Promise<void> {
    await db
      .update(schema.emailVerifications)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(schema.emailVerifications.userId, userId),
          isNull(schema.emailVerifications.usedAt)
        )
      );
  },

  async activateUser(userId: string): Promise<void> {
    await db.update(schema.users).set({ status: "active" }).where(eq(schema.users.id, userId));
  },

  async findUserById(userId: string) {
    return await db.query.users.findFirst({ where: { id: userId } });
  },

  async findRoleByName(name: string, universityId: string | null) {
    return await db.query.roles.findFirst({
      where: {
        name,
        universityId: universityId === null ? { isNull: true } : universityId,
      },
    });
  },

  async findRoleById(roleId: string) {
    return await db.query.roles.findFirst({ where: { id: roleId } });
  },

  async userHasRole(userId: string, roleId: string) {
    const existing = await db.query.userRoles.findFirst({
      where: { userId, roleId },
    });
    return !!existing;
  },

  async assignRoleToUser(userId: string, roleId: string) {
    await db.insert(schema.userRoles).values({ userId, roleId });
  },

  async removeRoleFromUser(userId: string, roleId: string) {
    await db.delete(schema.userRoles).where(
      and(eq(schema.userRoles.userId, userId), eq(schema.userRoles.roleId, roleId))
    );
  },

  async findPermissionByKey(key: string) {
    return await db.query.permissions.findFirst({ where: { key } });
  },

  async findPermissionById(permissionId: string) {
    return await db.query.permissions.findFirst({ where: { id: permissionId } });
  },

  async createPermission(data: { key: string; description?: string }) {
    const [inserted] = await db.insert(schema.permissions).values(data).returning();
    return inserted;
  },

  async findAllPermissions() {
    return await db.query.permissions.findMany();
  },

  async updatePermission(permissionId: string, data: { description?: string }) {
    const [updated] = await db
      .update(schema.permissions)
      .set(data)
      .where(eq(schema.permissions.id, permissionId))
      .returning();
    return updated;
  },

  async createRole(data: { name: string; description?: string; universityId?: string | null; rank?: number }) {
    const [inserted] = await db.insert(schema.roles).values(data).returning();
    return inserted;
  },

  async updateRole(roleId: string, data: { name?: string; description?: string; rank?: number }) {
    const [updated] = await db
      .update(schema.roles)
      .set(data)
      .where(eq(schema.roles.id, roleId))
      .returning();
    return updated;
  },

  async findAllRolesWithPermissions() {
    return await db.query.roles.findMany({ with: { permissions: true } });
  },

  async findRolePermission(roleId: string, permissionId: string) {
    return await db.query.rolePermissions.findFirst({
      where: { roleId, permissionId },
    });
  },

  async attachPermissionToRole(roleId: string, permissionId: string) {
    await db.insert(schema.rolePermissions).values({ roleId, permissionId });
  },

  async detachPermissionFromRole(roleId: string, permissionId: string) {
    await db.delete(schema.rolePermissions).where(
      and(eq(schema.rolePermissions.roleId, roleId), eq(schema.rolePermissions.permissionId, permissionId))
    );
  },

  async findUserIdsByRole(roleId: string): Promise<string[]> {
    const rows = await db.query.userRoles.findMany({
      where: { roleId },
      columns: { userId: true },
    });
    return rows.map((r) => r.userId);
  },

  // ═══════════════════════════════════════════════
  // KULLANICI ROLLERİ (genel atama — bkz. docs/yonetim/05 #3)
  // ═══════════════════════════════════════════════
  async findRolesByUser(userId: string) {
    const rows = await db.query.userRoles.findMany({
      where: { userId },
      with: { role: true },
    });
    return rows.map((r) => r.role).filter((role): role is NonNullable<typeof role> => !!role);
  },

  /** Bir role sahip kullanıcıları (kullanıcı satırıyla) getirir. */
  async findUsersByRole(roleId: string) {
    const rows = await db.query.userRoles.findMany({
      where: { roleId },
      with: { user: true },
    });
    return rows.map((r) => r.user).filter((user): user is NonNullable<typeof user> => !!user);
  },

  /** Belirli bir global role sahip kullanıcı sayısı (örn. "son super_admin" koruması). */
  async countUsersByRoleName(roleName: string): Promise<number> {
    const role = await db.query.roles.findFirst({
      where: { name: roleName, universityId: { isNull: true } },
      columns: { id: true },
    });
    if (!role) return 0;
    const rows = await db.query.userRoles.findMany({
      where: { roleId: role.id },
      columns: { userId: true },
    });
    return rows.length;
  },

  /**
   * Belirli bir global role sahip VE belirli bir üniversiteye bağlı kullanıcı sayısı
   * ("bir tenant'ın son university_admin'i düşürülemez" koruması). Rolün kendisi
   * global şablondur (universityId: null); kapsam, kullanıcının tenant'ından gelir.
   */
  async countUsersByRoleNameInTenant(roleName: string, universityId: string): Promise<number> {
    const role = await db.query.roles.findFirst({
      where: { name: roleName, universityId: { isNull: true } },
      columns: { id: true },
    });
    if (!role) return 0;
    const rows = await db.query.userRoles.findMany({
      where: { roleId: role.id },
      with: { user: { columns: { universityId: true } } },
    });
    return rows.filter((r) => r.user?.universityId === universityId).length;
  },

  // ═══════════════════════════════════════════════
  // KULLANICI BAZLI YETKİ OVERRIDE (userPermissions — bkz. docs/yonetim/05 #2)
  // ═══════════════════════════════════════════════
  async findUserPermissions(userId: string) {
    return await db.query.userPermissions.findMany({
      where: { userId },
      with: { permission: true },
    });
  },

  async findUserPermission(userId: string, permissionId: string) {
    return await db.query.userPermissions.findFirst({
      where: { userId, permissionId },
    });
  },

  /**
   * Kişiye özel yetki override'ı ekler/günceller. (userId, permissionId) PK
   * olduğu için ikinci yazımda satır çoğaltılmaz, `granted` güncellenir.
   */
  async upsertUserPermission(userId: string, permissionId: string, granted: boolean) {
    const [row] = await db
      .insert(schema.userPermissions)
      .values({ userId, permissionId, granted })
      .onConflictDoUpdate({
        target: [schema.userPermissions.userId, schema.userPermissions.permissionId],
        set: { granted },
      })
      .returning();
    return row;
  },

  async deleteUserPermission(userId: string, permissionId: string) {
    await db.delete(schema.userPermissions).where(
      and(
        eq(schema.userPermissions.userId, userId),
        eq(schema.userPermissions.permissionId, permissionId)
      )
    );
  },

  // ═══════════════════════════════════════════════
  // ROL / YETKİ SİLME (FK bağları tek transaction'da — bkz. docs/yonetim/05 #5)
  // ═══════════════════════════════════════════════
  /**
   * Rolü ve bağlarını siler: önce userRoles + rolePermissions (FK yaprakları),
   * en son rolün kendisi. Etkilenen kullanıcı id'lerini döner (cache invalidation için).
   */
  async deleteRole(roleId: string): Promise<string[]> {
    return await db.transaction(async (tx) => {
      const affected = await tx.query.userRoles.findMany({
        where: { roleId },
        columns: { userId: true },
      });
      const affectedUserIds = affected.map((r) => r.userId);

      await tx.delete(schema.userRoles).where(eq(schema.userRoles.roleId, roleId));
      await tx.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, roleId));
      await tx.delete(schema.roles).where(eq(schema.roles.id, roleId));

      return affectedUserIds;
    });
  },

  /**
   * Yetkiyi ve bağlarını siler: önce rolePermissions + userPermissions, en son
   * permission satırı. Etkilenen kullanıcı id'lerini (hem rolden hem kişisel
   * bağı olanlar) döner.
   */
  async deletePermission(permissionId: string): Promise<string[]> {
    return await db.transaction(async (tx) => {
      // Bu yetkiyi taşıyan roller → o rollere sahip kullanıcılar
      const roleRows = await tx.query.rolePermissions.findMany({
        where: { permissionId },
        columns: { roleId: true },
      });
      const roleUserIds: string[] = [];
      for (const { roleId } of roleRows) {
        const users = await tx.query.userRoles.findMany({
          where: { roleId },
          columns: { userId: true },
        });
        roleUserIds.push(...users.map((u) => u.userId));
      }
      // Kişisel override'ı olan kullanıcılar
      const directRows = await tx.query.userPermissions.findMany({
        where: { permissionId },
        columns: { userId: true },
      });
      const affectedUserIds = Array.from(new Set([...roleUserIds, ...directRows.map((r) => r.userId)]));

      await tx.delete(schema.rolePermissions).where(eq(schema.rolePermissions.permissionId, permissionId));
      await tx.delete(schema.userPermissions).where(eq(schema.userPermissions.permissionId, permissionId));
      await tx.delete(schema.permissions).where(eq(schema.permissions.id, permissionId));

      return affectedUserIds;
    });
  },

  /** Bir yetkiyi (permissionId) taşıyan rolleri getirir (ters listeleme). */
  async findRolesByPermission(permissionId: string) {
    const rows = await db.query.rolePermissions.findMany({
      where: { permissionId },
      with: { role: true },
    });
    return rows.map((r) => r.role).filter((role): role is NonNullable<typeof role> => !!role);
  },
};