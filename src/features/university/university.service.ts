import {
  universityRepository,
  domainRepository,
  facultyRepository,
  departmentRepository,
} from "./repositories";
import { notFound, badRequest } from "../../shared/utils/errors";
import { universityCache } from "./university.cache";
import {
  CreateUniversityDTO,
  UpdateUniversityDTO,
  AddDomainDTO,
  UpdateDomainDTO,
  CreateFacultyDTO,
  UpdateFacultyDTO,
  CreateDepartmentDTO,
  UpdateDepartmentDTO,
} from "./university.schema";
import type { CreateTenantPackagePayload, UpdateTenantLifecyclePayload } from "./university.types";
import type { DbExecutor } from "../../db/executor";

/**
 * university iş kuralları. Veri erişimi kaynak-başına repository'lere dağıtılmıştır
 * (repositories/), hepsi core BaseRepository'yi extend eder. Silme YUMUŞAKTIR
 * (universities/faculties/departments); domainler UNIQUE + kayıt akışı gereği
 * FİZİKSEL silinir. Benzersizlik guard'ları silinmiş satırları da hesaba katar.
 *
 * CACHE: yalnızca OKUMA yolları cache'i bilir (read-through). İnvalidasyon burada
 * DEĞİL, rota tanımlarında bildirilir (`invalidates(...)` + university.cache.ts
 * efektleri) — yazma metodları saf iş kuralı olarak kalır.
 */
export const universityService = {
  // ═══════════════════════════════════════════════
  // ÜNİVERSİTELER
  // ═══════════════════════════════════════════════
  async listUniversities(search?: string) {
    // Arama sonuçları cache'lenmez (çok anahtar, düşük değer); yalnızca aramasız
    // public liste read-through cache'ten servis edilir.
    if (search) {
      return await universityRepository.list(search);
    }
    return await universityCache.list().read(() => universityRepository.list());
  },

  async getUniversity(universityId: string) {
    // Repo undefined dönerse cache'lenmez (getOrSet null/undefined'ı yazmaz);
    // notFound guard'ı her çağrıda çalışır.
    const university = await universityCache
      .byId(universityId)
      .read(() => universityRepository.findByIdWithDomains(universityId));
    if (!university) {
      throw notFound("university.notFound");
    }
    return university;
  },

  async getUniversitySummary(universityId: string) {
    const university = await universityRepository.findByIdSummary(universityId);
    if (!university) {
      throw notFound("university.notFound");
    }
    return university;
  },

  async createTenantPackage(data: CreateTenantPackagePayload, options?: { tx?: DbExecutor }) {
    return await universityRepository.createTenantPackage(data, options);
  },

  async updateTenantLifecycle(
    universityId: string,
    data: UpdateTenantLifecyclePayload,
    options?: { tx?: DbExecutor }
  ) {
    const university = await universityRepository.findByIdSummary(universityId);
    if (!university) {
      throw notFound("university.notFound");
    }
    return await universityRepository.updateTenantLifecycle(universityId, data, options);
  },

  assertStaffDomainsForAdmin(
    domains: { domain: string; domainType: string }[],
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
  },

  async assertStaffEmailForTenant(universityId: string, email: string) {
    const emailDomain = extractEmailDomain(email);
    const staffDomain = await domainRepository.findStaffDomainInUniversity(universityId, emailDomain);
    if (!staffDomain) {
      throw badRequest("platform.adminEmailDomainMismatch");
    }
  },

  /**
   * Yeni üniversite oluşturur.
   */
  async createUniversity(data: CreateUniversityDTO) {
    await universityService.validateSlugAndDomains(data.slug, data.domains);
    return await universityRepository.createWithDomains(data);
  },

  /**
   * Slug ve domain benzersizlik kontrolleri — `createUniversity` ve platform onboard ortak.
   */
  async validateSlugAndDomains(slug: string, domains: CreateUniversityDTO["domains"]) {
    const existingSlug = await universityRepository.findBySlugIncludingDeleted(slug);
    if (existingSlug) {
      throw badRequest("university.slugTaken");
    }

    const seen = new Set<string>();
    for (const d of domains) {
      if (seen.has(d.domain)) {
        throw badRequest("university.domainDuplicateInRequest", { params: { domain: d.domain } });
      }
      seen.add(d.domain);

      const existingDomain = await domainRepository.findByDomain(d.domain);
      if (existingDomain) {
        throw badRequest("university.domainAlreadyRegistered", { params: { domain: d.domain } });
      }
    }
  },

  async updateUniversity(universityId: string, data: UpdateUniversityDTO) {
    const university = await universityRepository.findById(universityId);
    if (!university) {
      throw notFound("university.notFound");
    }

    if (data.slug) {
      const existingSlug = await universityRepository.findBySlugIncludingDeleted(data.slug);
      if (existingSlug && existingSlug.id !== universityId) {
        throw badRequest("university.slugTaken");
      }
    }

    return await universityRepository.updateById(universityId, data);
  },

  /**
   * Üniversiteyi siler (YUMUŞAK; domainleri fiziksel).
   * 1. Üniversite var (ve silinmemiş) olmalı.
   * 2. Bağlı ağır kayıt (fakülte / kullanıcı / kulüp) varsa silme reddedilir.
   */
  async deleteUniversity(universityId: string) {
    // 1
    const university = await universityRepository.findById(universityId);
    if (!university) {
      throw notFound("university.notFound");
    }

    // 2
    if (await universityRepository.hasUsers(universityId)) {
      throw badRequest("university.hasUsers");
    }
    if (await universityRepository.hasClubs(universityId)) {
      throw badRequest("university.hasClubs");
    }
    if (await universityRepository.hasFaculties(universityId)) {
      throw badRequest("university.hasFaculties");
    }

    await universityRepository.softDeleteWithDomains(universityId);
    return { id: universityId };
  },

  // ═══════════════════════════════════════════════
  // DOMAINLER
  // ═══════════════════════════════════════════════
  async listDomains(universityId: string) {
    const university = await universityRepository.findById(universityId);
    if (!university) {
      throw notFound("university.notFound");
    }
    return await domainRepository.listByUniversity(universityId);
  },

  async addDomain(universityId: string, data: AddDomainDTO) {
    const university = await universityRepository.findById(universityId);
    if (!university) {
      throw notFound("university.notFound");
    }

    const existingDomain = await domainRepository.findByDomain(data.domain);
    if (existingDomain) {
      throw badRequest("domain.alreadyRegistered");
    }

    return await domainRepository.add(universityId, data.domain, data.domainType);
  },

  async updateDomain(universityId: string, domainId: string, data: UpdateDomainDTO) {
    const domain = await domainRepository.findInUniversity(universityId, domainId);
    if (!domain) {
      throw notFound("domain.notFound");
    }

    if (data.domain) {
      const existingDomain = await domainRepository.findByDomain(data.domain);
      if (existingDomain && existingDomain.id !== domainId) {
        throw badRequest("domain.alreadyRegistered");
      }
    }

    return await domainRepository.update(domainId, data);
  },

  /**
   * Domain siler (FİZİKSEL — bkz. DomainRepository).
   * 1. Domain bu üniversiteye ait olmalı.
   * 2. Üniversitenin SON domaini silinemez (kayıt akışı tenant'ı domainden çözer).
   */
  async deleteDomain(universityId: string, domainId: string) {
    // 1
    const domain = await domainRepository.findInUniversity(universityId, domainId);
    if (!domain) {
      throw notFound("domain.notFound");
    }

    // 2
    const domains = await domainRepository.listByUniversity(universityId);
    if (domains.length <= 1) {
      throw badRequest("domain.lastCannotDelete");
    }

    await domainRepository.deleteById(domainId);
    return { id: domainId };
  },

  // ═══════════════════════════════════════════════
  // FAKÜLTELER
  // ═══════════════════════════════════════════════
  async listFaculties(universityId: string) {
    const university = await universityRepository.findById(universityId);
    if (!university) {
      throw notFound("university.notFound");
    }
    // Varlık/tenant guard'ı cache DIŞINDA; yalnızca liste read-through cache'lenir.
    return await universityCache
      .faculties(universityId)
      .read(() => facultyRepository.listByUniversity(universityId));
  },

  async getFaculty(universityId: string, facultyId: string) {
    const faculty = await facultyRepository.findInUniversity(universityId, facultyId);
    if (!faculty) {
      throw notFound("faculty.notFound");
    }
    return faculty;
  },

  async createFaculty(universityId: string, data: CreateFacultyDTO) {
    const university = await universityRepository.findById(universityId);
    if (!university) {
      throw notFound("university.notFound");
    }
    return await facultyRepository.create({ universityId, name: data.name });
  },

  async updateFaculty(universityId: string, facultyId: string, data: UpdateFacultyDTO) {
    const faculty = await facultyRepository.findInUniversity(universityId, facultyId);
    if (!faculty) {
      throw notFound("faculty.notFound");
    }
    return await facultyRepository.updateById(facultyId, { name: data.name });
  },

  /**
   * Fakülteyi siler (YUMUŞAK).
   * 1. Fakülte bu üniversiteye ait olmalı.
   * 2. Canlı bölümü olan fakülte silinemez (önce bölümler silinmeli).
   */
  async deleteFaculty(universityId: string, facultyId: string) {
    // 1
    const faculty = await facultyRepository.findInUniversity(universityId, facultyId);
    if (!faculty) {
      throw notFound("faculty.notFound");
    }

    // 2
    if (await departmentRepository.existsByFaculty(facultyId)) {
      throw badRequest("faculty.hasDepartments");
    }

    await facultyRepository.deleteById(facultyId);
    return { id: facultyId };
  },

  // ═══════════════════════════════════════════════
  // BÖLÜMLER
  // ═══════════════════════════════════════════════
  async listDepartments(universityId: string, facultyId: string) {
    const faculty = await facultyRepository.findInUniversity(universityId, facultyId);
    if (!faculty) {
      throw notFound("faculty.notFound");
    }
    // Faculty guard'ı cache DIŞINDA; yalnızca bölüm listesi read-through cache'lenir.
    return await universityCache
      .departments(facultyId)
      .read(() => departmentRepository.listByFaculty(facultyId));
  },

  async getDepartment(universityId: string, facultyId: string, departmentId: string) {
    const faculty = await facultyRepository.findInUniversity(universityId, facultyId);
    if (!faculty) {
      throw notFound("faculty.notFound");
    }
    const department = await departmentRepository.findInFaculty(facultyId, departmentId);
    if (!department) {
      throw notFound("department.notFound");
    }
    return department;
  },

  async createDepartment(universityId: string, facultyId: string, data: CreateDepartmentDTO) {
    const faculty = await facultyRepository.findInUniversity(universityId, facultyId);
    if (!faculty) {
      throw notFound("faculty.notFound");
    }
    return await departmentRepository.create({ facultyId, name: data.name });
  },

  async updateDepartment(
    universityId: string,
    facultyId: string,
    departmentId: string,
    data: UpdateDepartmentDTO
  ) {
    const faculty = await facultyRepository.findInUniversity(universityId, facultyId);
    if (!faculty) {
      throw notFound("faculty.notFound");
    }
    const department = await departmentRepository.findInFaculty(facultyId, departmentId);
    if (!department) {
      throw notFound("department.notFound");
    }
    return await departmentRepository.updateById(departmentId, { name: data.name });
  },

  /**
   * Bölümü siler (YUMUŞAK).
   * 1. Bölüm, bu üniversitenin bu fakültesine ait olmalı.
   * 2. Bu bölüme atanmış kullanıcı varsa silme reddedilir (users.departmentId FK).
   */
  async deleteDepartment(universityId: string, facultyId: string, departmentId: string) {
    // 1
    const faculty = await facultyRepository.findInUniversity(universityId, facultyId);
    if (!faculty) {
      throw notFound("faculty.notFound");
    }
    const department = await departmentRepository.findInFaculty(facultyId, departmentId);
    if (!department) {
      throw notFound("department.notFound");
    }

    // 2
    if (await departmentRepository.hasUsers(departmentId)) {
      throw badRequest("department.hasUsers");
    }

    await departmentRepository.deleteById(departmentId);
    return { id: departmentId };
  },
};

function extractEmailDomain(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[1]) {
    throw badRequest("auth.invalidEmailFormat");
  }
  return parts[1];
}
