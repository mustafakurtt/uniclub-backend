import { tenantsRepository } from "./tenants.repository";
import { OnboardTenantDTO, ProvisionTenantAdminDTO, UpdateTenantStatusDTO } from "./tenants.schema";
import type { OnboardTenantResult, TenantListItem, UniversityStatus } from "./tenants.types";
import { notFound, badRequest } from "../../../shared/utils/errors";
import { invalidateUserPermissions, invalidateUsersPermissions } from "../../../shared/rbac/rbac.cache";
import { universityEffects } from "../../university/university.cache";
import { universityService } from "../../university/university.service";
import { hashPassword } from "../../../shared/utils/password.util";

export const tenantsService = {
  async listTenants(): Promise<TenantListItem[]> {
    const tenants = await tenantsRepository.listActiveTenants();
    const ids = tenants.map((t) => t.id);
    const [domainCounts, userCounts, clubCounts, pendingApplications] = await Promise.all([
      tenantsRepository.countDomainsByUniversityIds(ids),
      tenantsRepository.countUsersByUniversityIds(ids),
      tenantsRepository.countClubsByUniversityIds(ids),
      tenantsRepository.countPendingApplicationsByUniversityIds(ids),
    ]);

    return tenants.map((tenant) => ({
      ...tenant,
      domainCount: domainCounts.get(tenant.id) ?? 0,
      userCount: userCounts.get(tenant.id) ?? 0,
      clubCount: clubCounts.get(tenant.id) ?? 0,
      pendingApplications: pendingApplications.get(tenant.id) ?? 0,
    }));
  },

  async updateTenantStatus(universityId: string, data: UpdateTenantStatusDTO) {
    const tenant = await tenantsRepository.findTenantById(universityId);
    if (!tenant) {
      throw notFound("platform.tenantNotFound");
    }

    if (tenant.status === data.status) {
      throw badRequest("platform.tenantStatusUnchanged");
    }

    if (!isAllowedStatusTransition(tenant.status, data.status)) {
      throw badRequest("platform.invalidTenantStatusTransition");
    }

    const updated = await tenantsRepository.updateTenantStatus(universityId, data.status);
    if (!updated) {
      throw notFound("platform.tenantNotFound");
    }

    await universityEffects.universityUpdated.emit(universityId);

    const userIds = await tenantsRepository.findUserIdsByUniversity(universityId);
    await invalidateUsersPermissions(userIds);

    return updated;
  },

  async onboardTenant(data: OnboardTenantDTO): Promise<OnboardTenantResult> {
    if (data.initialAdmin) {
      assertStaffDomainsForAdmin(data.domains, data.initialAdmin.email);
    }

    await universityService.validateSlugAndDomains(data.slug, data.domains);

    let provisionInitialAdmin: { admin: ProvisionTenantAdminDTO; passwordHash: string } | undefined;
    if (data.initialAdmin) {
      const passwordHash = await hashPassword(data.initialAdmin.password);
      provisionInitialAdmin = { admin: data.initialAdmin, passwordHash };
    }

    const result = await tenantsRepository.onboardTenant(data, provisionInitialAdmin);

    for (const faculty of result.faculties) {
      await universityEffects.facultyChanged.emit(result.university.id);
      if (faculty.departments.length > 0) {
        await universityEffects.departmentChanged.emit(faculty.id);
      }
    }

    if (result.initialAdmin) {
      await invalidateUserPermissions(result.initialAdmin.id);
    }

    return result;
  },

  async inviteTenantAdmin(universityId: string, data: ProvisionTenantAdminDTO) {
    const tenant = await tenantsRepository.findTenantById(universityId);
    if (!tenant) {
      throw notFound("platform.tenantNotFound");
    }

    await assertStaffEmailForTenant(universityId, data.email);
    await assertAdminEmailAvailableInTenant(data.email, universityId);

    const passwordHash = await hashPassword(data.password);
    const admin = await tenantsRepository.provisionTenantAdmin(universityId, data, passwordHash);
    await invalidateUserPermissions(admin.id);
    return admin;
  },
};

function assertStaffDomainsForAdmin(
  domains: OnboardTenantDTO["domains"],
  email: string
) {
  const hasStaffDomain = domains.some((d) => d.domainType === "staff");
  if (!hasStaffDomain) {
    throw badRequest("platform.tenantStaffDomainRequired");
  }

  const emailDomain = extractEmailDomain(email);
  const matchesStaff = domains.some((d) => d.domain === emailDomain && d.domainType === "staff");
  if (!matchesStaff) {
    throw badRequest("platform.adminEmailDomainMismatch");
  }
}

async function assertStaffEmailForTenant(universityId: string, email: string) {
  const emailDomain = extractEmailDomain(email);
  const staffDomain = await tenantsRepository.findStaffDomain(universityId, emailDomain);
  if (!staffDomain) {
    throw badRequest("platform.adminEmailDomainMismatch");
  }
}

async function assertAdminEmailAvailableInTenant(email: string, universityId: string) {
  const existing = await tenantsRepository.findUserByEmailInTenant(email, universityId);
  if (existing) {
    throw badRequest("platform.adminEmailAlreadyInUse");
  }
}

function extractEmailDomain(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[1]) {
    throw badRequest("auth.invalidEmailFormat");
  }
  return parts[1];
}

/**
 * Tenant durum geçişleri — operasyonel kurallar (serbest atlama yok).
 */
function isAllowedStatusTransition(from: UniversityStatus, to: UniversityStatus): boolean {
  if (from === to) return false;
  const allowed: Record<UniversityStatus, UniversityStatus[]> = {
    trial: ["active", "suspended"],
    active: ["past_due", "suspended"],
    past_due: ["active", "suspended"],
    suspended: ["active"],
  };
  return allowed[from].includes(to);
}
