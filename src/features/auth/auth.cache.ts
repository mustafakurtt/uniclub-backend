import { defineKeyspace, entry, effect } from "../../core/cache";
import { cache } from "../../shared/cache/cache.client";
import type { authRepository } from "./auth.repository";

/**
 * auth RBAC KATALOĞUNUN cache sözleşmesi (`auth:rbac:` keyspace'i). İzin ve rol
 * katalogları görece durağandır ama her yetki panelinde okunur → read-through cache.
 *
 * KAPSAM: yalnızca global KATALOG okumaları (tüm izinler, permission'larıyla tüm
 * roller). Kullanıcı-başına EFFECTIVE yetkiler AYRI bir cache'tir (shared/rbac/
 * rbac.cache.ts) ve buraya karışmaz — o, per-user invalidate edilir.
 *
 * `listRoles(actor)` altta global `findAllRolesWithPermissions()`i çağırıp aktörün
 * tenant kapsamına göre app-içinde filtreler; bu yüzden GLOBAL liste tek anahtarla
 * cache'lenir, filtreleme cache DIŞINDA kalır (aktör-özel anahtar patlaması olmaz).
 *
 * TETİK NEDEN SERVİSTE: bu efektler auth.service'te per-user RBAC cache
 * invalidasyonuyla (`invalidateUsersPermissions`) İÇ İÇE çalışır — ör. bir izin
 * silinince hem katalog hem etkilenen kullanıcıların yetkileri tazelenmeli.
 * Rotaya taşımak birbirine bağlı iki invalidasyonu iki dosyaya bölerdi.
 */
type PermissionCatalog = Awaited<ReturnType<typeof authRepository.findAllPermissions>>;
type RoleCatalog = Awaited<ReturnType<typeof authRepository.findAllRolesWithPermissions>>;

export const authCache = defineKeyspace(cache, "auth:rbac", {
  /** Tüm izin kataloğu (global). */
  permissions: entry<PermissionCatalog>()("permissions"),
  /** Tüm roller + izinleri (global; aktör filtresi çağırıda uygulanır). */
  roles: entry<RoleCatalog>()("roles"),
});

export const authCatalogEffects = {
  /** İzin oluştur/güncelle → izin kataloğu. */
  permissionsChanged: effect("auth.permissionsChanged", () => [authCache.permissions()]),
  /** Rol oluştur/güncelle/sil + role izin ekle/çıkar → rol kataloğu. */
  rolesChanged: effect("auth.rolesChanged", () => [authCache.roles()]),
  /**
   * İzin SİLİNDİ → hem izin kataloğu hem rol kataloğu (silinen izin rollerin
   * gömülü izin listesinde de görünüyordu).
   */
  permissionDeleted: effect("auth.permissionDeleted", () => [
    authCache.permissions(),
    authCache.roles(),
  ]),
};
