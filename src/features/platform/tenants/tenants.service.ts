import { db } from "../../../db";
import { OnboardTenantDTO, ProvisionTenantAdminDTO, UpdateTenantStatusDTO } from "./tenants.schema";
import type { OnboardTenantResult, TenantListItem, UniversityStatus } from "./tenants.types";
import { notFound, badRequest } from "../../../shared/utils/errors";
import { invalidateUsersPermissions } from "../../../shared/rbac/rbac.cache";
import { universityEffects } from "../../university/university.cache";
import { universityService } from "../../university/university.service";
import { authService } from "../../auth/auth.service";
import { tenantsRepository } from "./tenants.repository";
import { hashPassword } from "../../../shared/utils/password.util";

const UNIVERSITY_ADMIN_ROLE = "university_admin";

export const tenantsService = {
  async listTenants(): Promise<TenantListItem[]> {
    const tenants = await universityService.listUniversities();
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

  async updateTenantStatus(universityId: string, data: UpdateTenantStatusDTO, actorUserId: string) {
    const tenant = await universityService.getUniversitySummary(universityId);

    if (tenant.status === data.status) {
      throw badRequest("platform.tenantStatusUnchanged");
    }

    if (!isAllowedStatusTransition(tenant.status, data.status)) {
      throw badRequest("platform.invalidTenantStatusTransition");
    }

    const updated = await universityService.updateTenantLifecycle(universityId, {
      status: data.status,
      statusReason: data.reason,
      statusChangedBy: actorUserId,
    });

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
      universityService.assertStaffDomainsForAdmin(data.domains, data.initialAdmin.email);
    }

    await universityService.validateSlugAndDomains(data.slug, data.domains);

    const passwordHash = data.initialAdmin ? await hashPassword(data.initialAdmin.password) : undefined;
    const afterCommits: Array<() => Promise<void>> = [];

    const result = await db.transaction(async (tx) => {
      const pkg = await universityService.createTenantPackage(
        {
          name: data.name,
          slug: data.slug,
          status: data.status,
          domains: data.domains,
          faculties: data.faculties,
        },
        { tx }
      );

      let initialAdmin: OnboardTenantResult["initialAdmin"] = null;
      if (data.initialAdmin && passwordHash) {
        const provisioned = await authService.provisionStaffAccountInTx({
          tx,
          universityId: pkg.university.id,
          email: data.initialAdmin.email,
          passwordHash,
          firstName: data.initialAdmin.firstName,
          lastName: data.initialAdmin.lastName,
          roleName: UNIVERSITY_ADMIN_ROLE,
        });
        initialAdmin = provisioned.result;
        if (provisioned.afterCommit) {
          afterCommits.push(provisioned.afterCommit);
        }
      }

      return {
        university: pkg.university,
        domains: pkg.domains,
        faculties: pkg.faculties,
        initialAdmin,
      };
    });

    for (const runAfterCommit of afterCommits) {
      await runAfterCommit();
    }

    for (const faculty of result.faculties) {
      await universityEffects.facultyChanged.emit(result.university.id);
      if (faculty.departments.length > 0) {
        await universityEffects.departmentChanged.emit(faculty.id);
      }
    }

    return result;
  },

  async inviteTenantAdmin(universityId: string, data: ProvisionTenantAdminDTO) {
    await universityService.getUniversitySummary(universityId);
    await universityService.assertStaffEmailForTenant(universityId, data.email);

    const passwordHash = await hashPassword(data.password);
    const admin = await authService.provisionStaffAccount({
      universityId,
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      roleName: UNIVERSITY_ADMIN_ROLE,
    });

    return admin;
  },
};

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
