import { cache } from "../cache/cache.client";
import { rbacRepository } from "./rbac.repository";
import { EffectivePermissions } from "../../core/rbac/rbac.types";

/**
 * Kullanıcı-başına EFFECTIVE (etkin) rol/izin cache'i — core/cache facade'ının
 * üstüne kurulur (eskiden elle `redis.get/set/del` idi). Namespace `rbac:permissions`
 * → tam anahtar `rbac:permissions:{userId}` (eski format korundu, geriye uyumlu).
 *
 * Bu cache, feature `*.cache.ts`'lerinden AYRI bir eksendir: per-user invalidate edilir
 * ve suspension/verify gibi durum değişimlerinde ANINDA temizlenmelidir (aksi halde
 * değişiklik TTL boyunca görünmez). Rol/izin KATALOĞU ise auth.cache'te (global).
 */
const c = cache.namespace("rbac:permissions");
const TTL_SECONDS = 300;

/**
 * Read-through: cache'te yoksa DB'den hesaplar ve yazar. Rol/izin/durum
 * değişikliklerinde ilgili kullanıcı(lar) invalidate edilmelidir.
 * (getEffectiveRolesAndPermissions daima non-null obje döner → getOrSet cache'ler.)
 */
export const getEffectivePermissions = (userId: string): Promise<EffectivePermissions> =>
  c.getOrSet(userId, () => rbacRepository.getEffectiveRolesAndPermissions(userId), {
    ttlSeconds: TTL_SECONDS,
  });

export const invalidateUserPermissions = (userId: string): Promise<void> => c.delete(userId);

export const invalidateUsersPermissions = (userIds: string[]): Promise<void> => {
  if (userIds.length === 0) return Promise.resolve();
  return c.delete(userIds);
};
