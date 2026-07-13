import { cache } from "../../shared/cache/cache.client";

/**
 * auth RBAC KATALOĞU için izole cache keyspace'i (`auth:rbac:` öneki). İzin ve rol
 * katalogları görece durağandır ama her yetki panelinde okunur → read-through cache.
 *
 * KAPSAM: yalnızca global KATALOG okumaları (tüm izinler, permission'larıyla tüm
 * roller). Kullanıcı-başına EFFECTIVE yetkiler AYRI bir cache'tir (shared/rbac/
 * rbac.cache.ts) ve buraya karışmaz — o, per-user invalidate edilir.
 *
 * `listRoles(actor)` altta global `findAllRolesWithPermissions()`i çağırıp aktörün
 * tenant kapsamına göre app-içinde filtreler; bu yüzden GLOBAL liste tek anahtarla
 * cache'lenir, filtreleme cache DIŞINDA kalır (aktör-özel anahtar patlaması olmaz).
 */
const c = cache.namespace("auth:rbac");

const KEY_PERMISSIONS = "permissions";
const KEY_ROLES = "roles";

export const authCache = {
  /** Tüm izin kataloğu (global). */
  permissions: <T>(loader: () => Promise<T>) => c.getOrSet(KEY_PERMISSIONS, loader),
  /** Tüm roller + izinleri (global; aktör filtresi çağırıda uygulanır). */
  roles: <T>(loader: () => Promise<T>) => c.getOrSet(KEY_ROLES, loader),

  /** İzin oluştur/güncelle/sil → izin kataloğu. */
  invalidatePermissions: () => c.delete(KEY_PERMISSIONS),
  /** Rol oluştur/güncelle/sil + role izin ekle/çıkar → rol kataloğu. */
  invalidateRoles: () => c.delete(KEY_ROLES),
};
