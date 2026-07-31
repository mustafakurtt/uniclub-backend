import { pgTable as table } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import * as t from "drizzle-orm/pg-core";
import { timestamps } from "../../core/db/base.entity";
import { universities } from "./university";
import { users } from "./users";

// ═══════════════════════════════════════════════
// ROLES & PERMISSIONS (claim-based, iki katmanlı sistemin global katmanı)
// ═══════════════════════════════════════════════
/**
 * İleride (bkz. docs/design/07): bölge (region) kapsamı eklenecekse yol şudur —
 * `regions` tablosu + `universities.regionId`, ve `userRoles`'a nullable
 * `scopeUniversityId` / `scopeRegionId` kolonları. Böylece AYNI rol, kullanıcıya
 * farklı kapsamlarda (tek okul / bölge / global) atanabilir. Bu tur kapsam dışı.
 */
export const roles = table("roles", {
  id: t.uuid().primaryKey().defaultRandom(),
  universityId: t.uuid("university_id").references(() => universities.id, { onDelete: "cascade" }), // NULL = sistem geneli varsayılan rol
  name: t.varchar({ length: 100 }).notNull(), // "student", "teacher", "admin"
  description: t.varchar({ length: 256 }),
  /**
   * Yetki derecesi — yüksek = daha yetkili (super_admin 100 ... student 10).
   * Kural: bir aktör yalnızca KENDİ rütbesinden DÜŞÜK bir rolü atayabilir/kaldırabilir
   * ve yalnızca kendinden düşük rütbeli bir kullanıcıya dokunabilir. Kendine dokunma
   * (self == eşit rütbe) bu kuralın doğal sonucu olarak engellenir.
   * DİKKAT: default 0'dır — yeni rol oluştururken rütbe bilinçli olarak set edilmelidir.
   */
  rank: t.integer().default(0).notNull(),
  ...timestamps,
}, (cols) => [
  // Aynı tenant'ta iki tane "university_admin" olamaz: aksi halde effective
  // permission ve rütbe çözümlemesi hangi satırı kastettiğimize göre değişirdi.
  t.uniqueIndex("role_name_per_university_idx").on(cols.universityId, cols.name),
  // Global şablon roller (university_id IS NULL) için yukarıdaki bileşik index
  // yetmez — Postgres NULL'ları birbirinden farklı sayar (users'taki aynı tuzak).
  t.uniqueIndex("global_role_name_idx")
    .on(cols.name)
    .where(sql`${cols.universityId} is null`),
]);

export const permissions = table("permissions", {
  id: t.uuid().primaryKey().defaultRandom(),
  key: t.varchar({ length: 100 }).notNull().unique(), // "club.approve", "announcement.create"
  description: t.varchar({ length: 256 }),
  ...timestamps,
});

export const rolePermissions = table("role_permissions", {
  roleId: t.uuid("role_id").references(() => roles.id, { onDelete: "cascade" }).notNull(),
  permissionId: t.uuid("permission_id").references(() => permissions.id, { onDelete: "cascade" }).notNull(),
  ...timestamps,
}, (cols) => [
  t.primaryKey({ columns: [cols.roleId, cols.permissionId] }),
]);

export const userRoles = table("user_roles", {
  userId: t.uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  roleId: t.uuid("role_id").references(() => roles.id, { onDelete: "cascade" }).notNull(),
  ...timestamps,
}, (cols) => [
  t.primaryKey({ columns: [cols.userId, cols.roleId] }),
  t.index("user_roles_user_id_idx").on(cols.userId),
  t.index("user_roles_role_id_idx").on(cols.roleId),
]);

export const userPermissions = table("user_permissions", {
  userId: t.uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  permissionId: t.uuid("permission_id").references(() => permissions.id, { onDelete: "cascade" }).notNull(),
  granted: t.boolean().default(true).notNull(), // false = rolden gelen yetkiyi geri al
  ...timestamps,
}, (cols) => [
  t.primaryKey({ columns: [cols.userId, cols.permissionId] }),
]);
