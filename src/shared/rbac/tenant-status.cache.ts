import { cache } from "../cache/cache.client";
import { universityRepository } from "../../features/university/repositories/university.repository";

export type TenantStatusSnapshot = {
  status: "trial" | "active" | "past_due" | "suspended" | null;
  deleted: boolean;
};

const tenantStatusCache = cache.namespace("rbac:tenant-status");
const TTL_SECONDS = 60;

/** Tenant erişim/kayıt reddi — soft-delete ve `suspended` bloklar; `trial`/`past_due` serbest. */
export function tenantBlocksAccess(snapshot: TenantStatusSnapshot | null): boolean {
  if (!snapshot) return true;
  if (snapshot.deleted) return true;
  if (snapshot.status === "suspended") return true;
  return false;
}

export async function resolveTenantStatus(universityId: string): Promise<TenantStatusSnapshot | null> {
  return tenantStatusCache.getOrSet(
    universityId,
    async () => {
      const snapshot = await universityRepository.findTenantStatusSnapshot(universityId);
      if (!snapshot) return null;
      return snapshot;
    },
    { ttlSeconds: TTL_SECONDS }
  );
}

/** Tenant durumu değişiminde anında kesim — TTL beklemeden günceller. */
export async function setTenantStatusCache(
  universityId: string,
  snapshot: TenantStatusSnapshot
): Promise<void> {
  await tenantStatusCache.set(universityId, snapshot, { ttlSeconds: TTL_SECONDS });
}
