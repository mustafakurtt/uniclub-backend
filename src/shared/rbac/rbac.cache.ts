import { redis } from "../redis/redis.client";
import { rbacRepository } from "./rbac.repository";
import { EffectivePermissions } from "../../core/rbac/rbac.types";

const TTL_SECONDS = 300;

const cacheKey = (userId: string) => `rbac:permissions:${userId}`;

/**
 * Read-through cache: Redis'te yoksa DB'den hesaplar ve Redis'e yazar.
 * Rol/izin değişikliklerinde ilgili kullanıcı(lar)ın cache'i invalidate edilmelidir,
 * aksi halde değişiklik TTL süresi dolana kadar etkisiz kalır.
 */
export const getEffectivePermissions = async (userId: string): Promise<EffectivePermissions> => {
  const cached = await redis.get(cacheKey(userId));
  if (cached) {
    return JSON.parse(cached) as EffectivePermissions;
  }

  const computed = await rbacRepository.getEffectiveRolesAndPermissions(userId);
  await redis.set(cacheKey(userId), JSON.stringify(computed), "EX", TTL_SECONDS);
  return computed;
};

export const invalidateUserPermissions = async (userId: string): Promise<void> => {
  await redis.del(cacheKey(userId));
};

export const invalidateUsersPermissions = async (userIds: string[]): Promise<void> => {
  if (userIds.length === 0) return;
  await redis.del(userIds.map(cacheKey));
};
