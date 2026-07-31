import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../../db";
import {
  clubs,
  clubApplications,
  departments,
  faculties,
  universities,
  universityDomains,
  userRoles,
  users,
} from "../../../db/schema";
import type { OnboardTenantDTO, ProvisionTenantAdminDTO } from "./tenants.schema";
import type { OnboardTenantResult, ProvisionedTenantAdmin, UniversityStatus } from "./tenants.types";

const UNIVERSITY_ADMIN_ROLE = "university_admin";

/**
 * Operatör tenant yaşam döngüsü — çapraz-tenant özetler, onboard transaction, admin provision.
 * Üniversite CRUD'unun kendisi `university` feature repository'sinde kalır.
 */
export const tenantsRepository = {
  async listActiveTenants() {
    return await db.query.universities.findMany({
      where: { deletedAt: { isNull: true } },
      columns: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async findTenantById(universityId: string) {
    return await db.query.universities.findFirst({
      where: { id: universityId, deletedAt: { isNull: true } },
      columns: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  async countDomainsByUniversityIds(universityIds: string[]): Promise<Map<string, number>> {
    if (universityIds.length === 0) return new Map();
    const rows = await db
      .select({
        universityId: universityDomains.universityId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(universityDomains)
      .where(and(inArray(universityDomains.universityId, universityIds), isNull(universityDomains.deletedAt)))
      .groupBy(universityDomains.universityId);
    return new Map(rows.map((r) => [r.universityId, r.count]));
  },

  async countUsersByUniversityIds(universityIds: string[]): Promise<Map<string, number>> {
    if (universityIds.length === 0) return new Map();
    const rows = await db
      .select({
        universityId: users.universityId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(users)
      .where(and(inArray(users.universityId, universityIds), isNull(users.deletedAt)))
      .groupBy(users.universityId);
    return new Map(rows.filter((r) => r.universityId).map((r) => [r.universityId!, r.count]));
  },

  async countClubsByUniversityIds(universityIds: string[]): Promise<Map<string, number>> {
    if (universityIds.length === 0) return new Map();
    const rows = await db
      .select({
        universityId: clubs.universityId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(clubs)
      .where(inArray(clubs.universityId, universityIds))
      .groupBy(clubs.universityId);
    return new Map(rows.map((r) => [r.universityId, r.count]));
  },

  async countPendingApplicationsByUniversityIds(universityIds: string[]): Promise<Map<string, number>> {
    if (universityIds.length === 0) return new Map();
    const rows = await db
      .select({
        universityId: clubApplications.universityId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(clubApplications)
      .where(and(inArray(clubApplications.universityId, universityIds), eq(clubApplications.status, "pending")))
      .groupBy(clubApplications.universityId);
    return new Map(rows.map((r) => [r.universityId, r.count]));
  },

  async updateTenantStatus(universityId: string, status: UniversityStatus) {
    const [updated] = await db
      .update(universities)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(universities.id, universityId), isNull(universities.deletedAt)))
      .returning({
        id: universities.id,
        name: universities.name,
        slug: universities.slug,
        status: universities.status,
        createdAt: universities.createdAt,
        updatedAt: universities.updatedAt,
      });
    return updated;
  },

  async findUserIdsByUniversity(universityId: string): Promise<string[]> {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.universityId, universityId), isNull(users.deletedAt)));
    return rows.map((r) => r.id);
  },

  async findStaffDomain(universityId: string, domain: string) {
    return await db.query.universityDomains.findFirst({
      where: { universityId, domain, domainType: "staff" },
    });
  },

  async findUserByEmailInTenant(email: string, universityId: string) {
    return await db.query.users.findFirst({
      where: { email, universityId, deletedAt: { isNull: true } },
      columns: { id: true },
    });
  },

  /**
   * Tenant + domainler + (opsiyonel) akademik ağaç + (opsiyonel) ilk yönetici — tek transaction.
   */
  async onboardTenant(
    data: OnboardTenantDTO,
    provisionInitialAdmin?: { admin: ProvisionTenantAdminDTO; passwordHash: string }
  ): Promise<OnboardTenantResult> {
    return await db.transaction(async (tx) => {
      const [university] = await tx
        .insert(universities)
        .values({ name: data.name, slug: data.slug, status: data.status })
        .returning({
          id: universities.id,
          name: universities.name,
          slug: universities.slug,
          status: universities.status,
          createdAt: universities.createdAt,
          updatedAt: universities.updatedAt,
        });

      const domains = await tx
        .insert(universityDomains)
        .values(
          data.domains.map((d) => ({
            universityId: university.id,
            domain: d.domain,
            domainType: d.domainType,
          }))
        )
        .returning({
          id: universityDomains.id,
          universityId: universityDomains.universityId,
          domain: universityDomains.domain,
          domainType: universityDomains.domainType,
          createdAt: universityDomains.createdAt,
          updatedAt: universityDomains.updatedAt,
        });

      const facultyRows: OnboardTenantResult["faculties"] = [];
      for (const facultyInput of data.faculties ?? []) {
        const [faculty] = await tx
          .insert(faculties)
          .values({ universityId: university.id, name: facultyInput.name })
          .returning({
            id: faculties.id,
            name: faculties.name,
            universityId: faculties.universityId,
            createdAt: faculties.createdAt,
            updatedAt: faculties.updatedAt,
          });

        const departmentNames = facultyInput.departments ?? [];
        const insertedDepartments =
          departmentNames.length > 0
            ? await tx
                .insert(departments)
                .values(departmentNames.map((name) => ({ facultyId: faculty.id, name })))
                .returning({
                  id: departments.id,
                  facultyId: departments.facultyId,
                  name: departments.name,
                  createdAt: departments.createdAt,
                  updatedAt: departments.updatedAt,
                })
            : [];

        facultyRows.push({ ...faculty, departments: insertedDepartments });
      }

      let initialAdmin: ProvisionedTenantAdmin | null = null;
      if (provisionInitialAdmin) {
        initialAdmin = await insertProvisionedAdmin(tx, {
          universityId: university.id,
          ...provisionInitialAdmin.admin,
          passwordHash: provisionInitialAdmin.passwordHash,
        });
      }

      return { university, domains, faculties: facultyRows, initialAdmin };
    });
  },

  async provisionTenantAdmin(
    universityId: string,
    admin: ProvisionTenantAdminDTO,
    passwordHash: string
  ): Promise<ProvisionedTenantAdmin> {
    return await db.transaction(async (tx) => {
      return await insertProvisionedAdmin(tx, {
        universityId,
        ...admin,
        passwordHash,
      });
    });
  },
};

async function insertProvisionedAdmin(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: ProvisionTenantAdminDTO & { universityId: string; passwordHash: string }
): Promise<ProvisionedTenantAdmin> {
  const role = await tx.query.roles.findFirst({
    where: { name: UNIVERSITY_ADMIN_ROLE },
    columns: { id: true },
  });
  if (!role) {
    throw new Error(`RBAC rolü bulunamadı: ${UNIVERSITY_ADMIN_ROLE}`);
  }

  const [user] = await tx
    .insert(users)
    .values({
      universityId: params.universityId,
      departmentId: null,
      studentNumber: null,
      email: params.email,
      passwordHash: params.passwordHash,
      firstName: params.firstName,
      lastName: params.lastName,
      status: "active",
      mustChangePassword: true,
    })
    .returning({
      id: users.id,
      universityId: users.universityId,
      departmentId: users.departmentId,
      studentNumber: users.studentNumber,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      photoUrl: users.photoUrl,
      preferredLanguage: users.preferredLanguage,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      deletedAt: users.deletedAt,
    });

  await tx.insert(userRoles).values({ userId: user.id, roleId: role.id });
  return user;
}
