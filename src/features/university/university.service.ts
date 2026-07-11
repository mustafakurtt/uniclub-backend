import { universityRepository } from "./university.repository";
import { NotFoundError, BadRequestError } from "../../core/http/errors";
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

export const universityService = {
  // ═══════════════════════════════════════════════
  // ÜNİVERSİTELER
  // ═══════════════════════════════════════════════
  async listUniversities(search?: string) {
    return await universityRepository.findAllUniversities(search);
  },

  async getUniversity(universityId: string) {
    const university = await universityRepository.findUniversityById(universityId);
    if (!university) {
      throw new NotFoundError("university.notFound");
    }
    return university;
  },

  /**
   * Yeni üniversite oluşturur.
   * 1. slug sistemde benzersiz olmalı.
   * 2. Verilen domainlerin hiçbiri (kendi içinde ve DB'de) daha önce kayıtlı olmamalı
   *    — domain tablosunda "unique" olduğu için, çakışmayı DB hatasından önce yakalıyoruz.
   */
  async createUniversity(data: CreateUniversityDTO) {
    // 1
    const existingSlug = await universityRepository.findUniversityBySlug(data.slug);
    if (existingSlug) {
      throw new BadRequestError("university.slugTaken");
    }

    // 2
    const seen = new Set<string>();
    for (const d of data.domains) {
      if (seen.has(d.domain)) {
        throw new BadRequestError("university.domainDuplicateInRequest", { params: { domain: d.domain } });
      }
      seen.add(d.domain);

      const existingDomain = await universityRepository.findDomainByDomain(d.domain);
      if (existingDomain) {
        throw new BadRequestError("university.domainAlreadyRegistered", { params: { domain: d.domain } });
      }
    }

    return await universityRepository.createUniversityWithDomains(data);
  },

  async updateUniversity(universityId: string, data: UpdateUniversityDTO) {
    const university = await universityRepository.findUniversityById(universityId);
    if (!university) {
      throw new NotFoundError("university.notFound");
    }

    if (data.slug) {
      const existingSlug = await universityRepository.findUniversityBySlug(data.slug);
      if (existingSlug && existingSlug.id !== universityId) {
        throw new BadRequestError("university.slugTaken");
      }
    }

    return await universityRepository.updateUniversity(universityId, data);
  },

  /**
   * Üniversiteyi siler.
   * 1. Üniversite var olmalı.
   * 2. Bağlı ağır kayıt (fakülte / kullanıcı / kulüp) varsa silme reddedilir —
   *    aksi halde foreign key ihlali oluşur ve veri sessizce yetim kalabilir.
   *    Sadece domainler üniversiteyle birlikte otomatik temizlenir.
   */
  async deleteUniversity(universityId: string) {
    // 1
    const university = await universityRepository.findUniversityById(universityId);
    if (!university) {
      throw new NotFoundError("university.notFound");
    }

    // 2
    if (await universityRepository.hasUsers(universityId)) {
      throw new BadRequestError("university.hasUsers");
    }
    if (await universityRepository.hasClubs(universityId)) {
      throw new BadRequestError("university.hasClubs");
    }
    if (await universityRepository.hasFaculties(universityId)) {
      throw new BadRequestError("university.hasFaculties");
    }

    await universityRepository.deleteUniversity(universityId);
    return { id: universityId };
  },

  // ═══════════════════════════════════════════════
  // DOMAINLER
  // ═══════════════════════════════════════════════
  async listDomains(universityId: string) {
    const university = await universityRepository.findUniversityById(universityId);
    if (!university) {
      throw new NotFoundError("university.notFound");
    }
    return await universityRepository.findDomainsByUniversity(universityId);
  },

  async addDomain(universityId: string, data: AddDomainDTO) {
    const university = await universityRepository.findUniversityById(universityId);
    if (!university) {
      throw new NotFoundError("university.notFound");
    }

    const existingDomain = await universityRepository.findDomainByDomain(data.domain);
    if (existingDomain) {
      throw new BadRequestError("domain.alreadyRegistered");
    }

    return await universityRepository.addDomainToUniversity(universityId, data.domain, data.domainType);
  },

  async updateDomain(universityId: string, domainId: string, data: UpdateDomainDTO) {
    const domain = await universityRepository.findDomainById(universityId, domainId);
    if (!domain) {
      throw new NotFoundError("domain.notFound");
    }

    if (data.domain) {
      const existingDomain = await universityRepository.findDomainByDomain(data.domain);
      if (existingDomain && existingDomain.id !== domainId) {
        throw new BadRequestError("domain.alreadyRegistered");
      }
    }

    return await universityRepository.updateDomain(domainId, data);
  },

  /**
   * Domain siler.
   * 1. Domain bu üniversiteye ait olmalı.
   * 2. Üniversitenin SON domaini silinemez — kayıt (register) akışı tenant'ı
   *    e-posta domaininden çözdüğü için, domainsiz bir üniversiteye kimse
   *    kayıt olamaz hâle gelir.
   */
  async deleteDomain(universityId: string, domainId: string) {
    // 1
    const domain = await universityRepository.findDomainById(universityId, domainId);
    if (!domain) {
      throw new NotFoundError("domain.notFound");
    }

    // 2
    const domains = await universityRepository.findDomainsByUniversity(universityId);
    if (domains.length <= 1) {
      throw new BadRequestError("domain.lastCannotDelete");
    }

    await universityRepository.deleteDomain(domainId);
    return { id: domainId };
  },

  // ═══════════════════════════════════════════════
  // FAKÜLTELER
  // ═══════════════════════════════════════════════
  async listFaculties(universityId: string) {
    const university = await universityRepository.findUniversityById(universityId);
    if (!university) {
      throw new NotFoundError("university.notFound");
    }
    return await universityRepository.findFacultiesByUniversity(universityId);
  },

  async getFaculty(universityId: string, facultyId: string) {
    const faculty = await universityRepository.findFacultyInUniversity(universityId, facultyId);
    if (!faculty) {
      throw new NotFoundError("faculty.notFound");
    }
    return faculty;
  },

  async createFaculty(universityId: string, data: CreateFacultyDTO) {
    const university = await universityRepository.findUniversityById(universityId);
    if (!university) {
      throw new NotFoundError("university.notFound");
    }
    return await universityRepository.createFaculty(universityId, data.name);
  },

  async updateFaculty(universityId: string, facultyId: string, data: UpdateFacultyDTO) {
    const faculty = await universityRepository.findFacultyInUniversity(universityId, facultyId);
    if (!faculty) {
      throw new NotFoundError("faculty.notFound");
    }
    return await universityRepository.updateFaculty(facultyId, data.name);
  },

  /**
   * Fakülteyi siler.
   * 1. Fakülte bu üniversiteye ait olmalı.
   * 2. Bölümü olan fakülte silinemez (önce bölümler silinmeli) — FK ihlalini önler.
   */
  async deleteFaculty(universityId: string, facultyId: string) {
    // 1
    const faculty = await universityRepository.findFacultyInUniversity(universityId, facultyId);
    if (!faculty) {
      throw new NotFoundError("faculty.notFound");
    }

    // 2
    if (await universityRepository.hasDepartments(facultyId)) {
      throw new BadRequestError("faculty.hasDepartments");
    }

    await universityRepository.deleteFaculty(facultyId);
    return { id: facultyId };
  },

  // ═══════════════════════════════════════════════
  // BÖLÜMLER
  // ═══════════════════════════════════════════════
  async listDepartments(universityId: string, facultyId: string) {
    const faculty = await universityRepository.findFacultyInUniversity(universityId, facultyId);
    if (!faculty) {
      throw new NotFoundError("faculty.notFound");
    }
    return await universityRepository.findDepartmentsByFaculty(facultyId);
  },

  async getDepartment(universityId: string, facultyId: string, departmentId: string) {
    const faculty = await universityRepository.findFacultyInUniversity(universityId, facultyId);
    if (!faculty) {
      throw new NotFoundError("faculty.notFound");
    }
    const department = await universityRepository.findDepartmentInFaculty(facultyId, departmentId);
    if (!department) {
      throw new NotFoundError("department.notFound");
    }
    return department;
  },

  async createDepartment(universityId: string, facultyId: string, data: CreateDepartmentDTO) {
    const faculty = await universityRepository.findFacultyInUniversity(universityId, facultyId);
    if (!faculty) {
      throw new NotFoundError("faculty.notFound");
    }
    return await universityRepository.createDepartment(facultyId, data.name);
  },

  async updateDepartment(universityId: string, facultyId: string, departmentId: string, data: UpdateDepartmentDTO) {
    const faculty = await universityRepository.findFacultyInUniversity(universityId, facultyId);
    if (!faculty) {
      throw new NotFoundError("faculty.notFound");
    }
    const department = await universityRepository.findDepartmentInFaculty(facultyId, departmentId);
    if (!department) {
      throw new NotFoundError("department.notFound");
    }
    return await universityRepository.updateDepartment(departmentId, data.name);
  },

  /**
   * Bölümü siler.
   * 1. Bölüm, bu üniversitenin bu fakültesine ait olmalı.
   * 2. Bu bölüme atanmış kullanıcı varsa silme reddedilir (users.departmentId FK).
   */
  async deleteDepartment(universityId: string, facultyId: string, departmentId: string) {
    // 1
    const faculty = await universityRepository.findFacultyInUniversity(universityId, facultyId);
    if (!faculty) {
      throw new NotFoundError("faculty.notFound");
    }
    const department = await universityRepository.findDepartmentInFaculty(facultyId, departmentId);
    if (!department) {
      throw new NotFoundError("department.notFound");
    }

    // 2
    if (await universityRepository.hasUsersInDepartment(departmentId)) {
      throw new BadRequestError("department.hasUsers");
    }

    await universityRepository.deleteDepartment(departmentId);
    return { id: departmentId };
  },
};
