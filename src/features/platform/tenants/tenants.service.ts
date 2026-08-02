import {
  OnboardTenantDTO,
  InviteTenantAdminDTO,
  UpdateTenantStatusDTO,
  ListTenantsQuery,
} from "./tenants.schema";
import type { OnboardTenantResult, TenantListItem, UniversityStatus } from "./tenants.types";
import { notFound, badRequest } from "../../../shared/utils/errors";
import { setTenantStatusCache } from "../../../shared/rbac/tenant-status.cache";
import { universityEffects } from "../../university/university.cache";
import { universityService } from "../../university/university.service";
import { authService } from "../../auth/auth.service";
import { tenantsRepository } from "./tenants.repository";
import {
  decodeTenantListCursor,
  encodeTenantListCursor,
} from "./tenant-list-cursor";

const UNIVERSITY_ADMIN_ROLE = "university_admin";

export const tenantsService = {
  async listTenants(query: ListTenantsQuery): Promise<{ items: TenantListItem[]; nextCursor: string | null }> {
    let pageCursor: { createdAt: Date; id: string } | undefined;
    if (query.cursor) {
      const decoded = decodeTenantListCursor(query.cursor);
      if (!decoded) {
        throw badRequest("platform.invalidTenantListCursor");
      }
      pageCursor = decoded;
    }

    const { items: tenants, hasMore } = await universityService.listUniversitiesPaginated(
      query.limit,
      pageCursor,
      query.search
    );
    const ids = tenants.map((t) => t.id);
    const [domainCounts, userCounts, clubCounts, pendingApplications] = await Promise.all([
      tenantsRepository.countDomainsByUniversityIds(ids),
      tenantsRepository.countUsersByUniversityIds(ids),
      tenantsRepository.countClubsByUniversityIds(ids),
      tenantsRepository.countPendingApplicationsByUniversityIds(ids),
    ]);

    const items = tenants.map((tenant) => ({
      ...tenant,
      domainCount: domainCounts.get(tenant.id) ?? 0,
      userCount: userCounts.get(tenant.id) ?? 0,
      clubCount: clubCounts.get(tenant.id) ?? 0,
      pendingApplications: pendingApplications.get(tenant.id) ?? 0,
    }));

    const nextCursor =
      hasMore && items.length > 0
        ? encodeTenantListCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
        : null;

    return { items, nextCursor };
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

    await setTenantStatusCache(universityId, { status: data.status, deleted: false });

    return updated;
  },

  async onboardTenant(data: OnboardTenantDTO, invitedBy: string | null): Promise<OnboardTenantResult> {
    if (data.initialAdmin) {
      universityService.assertStaffDomainsForAdmin(data.domains, data.initialAdmin.email);
    }

    await universityService.validateSlugAndDomains(data.slug, data.domains);

    const afterCommits: Array<() => Promise<void>> = [];

    const result = await tenantsRepository.runTransaction(async (tx) => {
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

      let initialAdminInvitation: OnboardTenantResult["initialAdminInvitation"] = null;
      if (data.initialAdmin) {
        const invited = await authService.createTenantAdminInvitationInTx({
          tx,
          universityId: pkg.university.id,
          email: data.initialAdmin.email,
          firstName: data.initialAdmin.firstName,
          lastName: data.initialAdmin.lastName,
          roleName: UNIVERSITY_ADMIN_ROLE,
          invitedBy,
        });
        initialAdminInvitation = invited.result;
        if (invited.afterCommit) {
          afterCommits.push(invited.afterCommit);
        }
      }

      return {
        university: pkg.university,
        domains: pkg.domains,
        faculties: pkg.faculties,
        initialAdminInvitation,
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

  async inviteTenantAdmin(universityId: string, data: InviteTenantAdminDTO, invitedBy: string) {
    await universityService.getUniversitySummary(universityId);
    await universityService.assertStaffEmailForTenant(universityId, data.email);

    return await authService.createTenantAdminInvitation({
      universityId,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      roleName: UNIVERSITY_ADMIN_ROLE,
      invitedBy,
    });
  },

  async listTenantAdminInvitations(universityId: string) {
    await universityService.getUniversitySummary(universityId);
    return await authService.listPendingTenantAdminInvitations(universityId);
  },

  async cancelTenantAdminInvitation(universityId: string, invitationId: string) {
    await universityService.getUniversitySummary(universityId);
    return await authService.cancelTenantAdminInvitation(universityId, invitationId);
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
