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

/**
 * university iş kuralları. Veri erişimi kaynak-başına repository'lere dağıtılmıştır
 * (repositories/), hepsi core BaseRepository'yi extend eder. Silme YUMUŞAKTIR
 * (universities/faculties/departments); domainler UNIQUE + kayıt akışı gereği
 * FİZİKSEL silinir. Benzersizlik guard'ları silinmiş satırları da hesaba katar.
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
    return await universityCache.list(() => universityRepository.list());
  },

  async getUniversity(universityId: string) {
    // Repo undefined dönerse cache'lenmez (getOrSet null/undefined'ı yazmaz);
    // notFound guard'ı her çağrıda çalışır.
    const university = await universityCache.byId(universityId, () =>
      universityRepository.findByIdWithDomains(universityId)
    );
    if (!university) {
      throw notFound("university.notFound");
    }
    return university;
  },

  /**
   * Yeni üniversite oluşturur.
   * 1. slug sistemde benzersiz olmalı (silinmiş kayıtlar DAHİL — unique kısıt hepsini kapsar).
   * 2. Verilen domainlerin hiçbiri (istekte ve DB'de) daha önce kayıtlı olmamalı.
   */
  async createUniversity(data: CreateUniversityDTO) {
    // 1
    const existingSlug = await universityRepository.findBySlugIncludingDeleted(data.slug);
    if (existingSlug) {
      throw badRequest("university.slugTaken");
    }

    // 2
    const seen = new Set<string>();
    for (const d of data.domains) {
      if (seen.has(d.domain)) {
        throw badRequest("university.domainDuplicateInRequest", { params: { domain: d.domain } });
      }
      seen.add(d.domain);

      const existingDomain = await domainRepository.findByDomain(d.domain);
      if (existingDomain) {
        throw badRequest("university.domainAlreadyRegistered", { params: { domain: d.domain } });
      }
    }

    const result = await universityRepository.createWithDomains(data);
    await universityCache.invalidateList();
    return result;
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

    const result = await universityRepository.updateById(universityId, data);
    await universityCache.invalidateUniversity(universityId);
    return result;
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
    await universityCache.invalidateUniversityDeep(universityId);
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

    const result = await domainRepository.add(universityId, data.domain, data.domainType);
    await universityCache.invalidateUniversityDomains(universityId);
    return result;
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

    const result = await domainRepository.update(domainId, data);
    await universityCache.invalidateUniversityDomains(universityId);
    return result;
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
    await universityCache.invalidateUniversityDomains(universityId);
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
    return await universityCache.faculties(universityId, () =>
      facultyRepository.listByUniversity(universityId)
    );
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
    const result = await facultyRepository.create({ universityId, name: data.name });
    await universityCache.invalidateFaculties(universityId);
    return result;
  },

  async updateFaculty(universityId: string, facultyId: string, data: UpdateFacultyDTO) {
    const faculty = await facultyRepository.findInUniversity(universityId, facultyId);
    if (!faculty) {
      throw notFound("faculty.notFound");
    }
    const result = await facultyRepository.updateById(facultyId, { name: data.name });
    await universityCache.invalidateFaculties(universityId);
    return result;
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
    await universityCache.invalidateFacultyDeep(universityId, facultyId);
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
    return await universityCache.departments(facultyId, () =>
      departmentRepository.listByFaculty(facultyId)
    );
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
    const result = await departmentRepository.create({ facultyId, name: data.name });
    await universityCache.invalidateDepartments(facultyId);
    return result;
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
    const result = await departmentRepository.updateById(departmentId, { name: data.name });
    await universityCache.invalidateDepartments(facultyId);
    return result;
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
    await universityCache.invalidateDepartments(facultyId);
    return { id: departmentId };
  },
};
