import { resolveTenantStatus, tenantBlocksAccess } from "../../shared/rbac/tenant-status.cache";
import { badRequest } from "../../shared/utils/errors";

/** Kayıt ve davet kabulü aynı tenant yaşam döngüsü kuralını paylaşır. */
export async function assertTenantAcceptsNewUsers(universityId: string) {
  const snapshot = await resolveTenantStatus(universityId);
  if (tenantBlocksAccess(snapshot)) {
    throw badRequest("auth.tenantRegistrationDisabled");
  }
}
