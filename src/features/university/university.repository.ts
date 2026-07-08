import { eq } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "../../db/schema";
import {
  DomainType,
  CreateUniversityPayload,
  UpdateUniversityPayload,
  UpdateDomainPayload,
} from "./university.types";

/**
 * university feature'ının TEK veri erişim katmanı — db/schema'ya doğrudan
 * dokunan yegâne dosya. Aşağıda kaynak bazlı bölümler var:
 * Üniversite → Domain → Fakülte → Bölüm.
 */
export const universityRepository = {
  // ═══════════════════════════════════════════════
  // ÜNİVERSİTELER
  // ═══════════════════════════════════════════════

  /**
   * Herkese açık üniversite listesi — hafif kolon seti (domain/fakülte bilgisi içermez).
   */
  async findAllUniversities(search?: string) {
    return await db.query.universities.findMany({
      where: search ? { name: { ilike: `%${search}%` } } : undefined,
      columns: { id: true, name: true, slug: true, createdAt: true },
    });
  },

  async findUniversityById(universityId: string) {
    return await db.query.universities.findFirst({
      where: { id: universityId },
      with: { domains: true },
    });
  },

  async findUniversityBySlug(slug: string) {
    return await db.query.universities.findFirst({
      where: { slug },
    });
  },

  async createUniversityWithDomains(data: CreateUniversityPayload) {
    return await db.transaction(async (tx) => {
      const [university] = await tx.insert(schema.universities).values({
        name: data.name,
        slug: data.slug,
      }).returning();

      const domains = await tx.insert(schema.universityDomains).values(
        data.domains.map((d) => ({
          universityId: university.id,
          domain: d.domain,
          domainType: d.domainType,
        }))
      ).returning();

      return { university, domains };
    });
  },

  async updateUniversity(universityId: string, data: UpdateUniversityPayload) {
    const [updated] = await db
      .update(schema.universities)
      .set(data)
      .where(eq(schema.universities.id, universityId))
      .returning();
    return updated;
  },

  /**
   * Üniversiteyi ve (yalnızca ona ait, başka bağımlısı olmayan) domainlerini
   * tek transaction'da siler. Fakülte/kullanıcı/kulüp gibi ağır bağımlıların
   * yokluğu service katmanında kontrol edilir (bkz. university.service).
   */
  async deleteUniversity(universityId: string) {
    await db.transaction(async (tx) => {
      await tx.delete(schema.universityDomains).where(eq(schema.universityDomains.universityId, universityId));
      await tx.delete(schema.universities).where(eq(schema.universities.id, universityId));
    });
  },

  /** Silme öncesi bağımlılık kontrolleri (varlık yeterli — tek satır bile engeller). */
  async hasFaculties(universityId: string): Promise<boolean> {
    const row = await db.query.faculties.findFirst({ where: { universityId }, columns: { id: true } });
    return !!row;
  },

  async hasUsers(universityId: string): Promise<boolean> {
    const row = await db.query.users.findFirst({ where: { universityId }, columns: { id: true } });
    return !!row;
  },

  async hasClubs(universityId: string): Promise<boolean> {
    const row = await db.query.clubs.findFirst({ where: { universityId }, columns: { id: true } });
    return !!row;
  },

  // ═══════════════════════════════════════════════
  // DOMAINLER
  // ═══════════════════════════════════════════════
  async findDomainByDomain(domain: string) {
    return await db.query.universityDomains.findFirst({
      where: { domain },
    });
  },

  async findDomainById(universityId: string, domainId: string) {
    return await db.query.universityDomains.findFirst({
      where: { id: domainId, universityId },
    });
  },

  async findDomainsByUniversity(universityId: string) {
    return await db.query.universityDomains.findMany({
      where: { universityId },
    });
  },

  async addDomainToUniversity(universityId: string, domain: string, domainType: DomainType) {
    const [inserted] = await db.insert(schema.universityDomains).values({
      universityId,
      domain,
      domainType,
    }).returning();
    return inserted;
  },

  async updateDomain(domainId: string, data: UpdateDomainPayload) {
    const [updated] = await db
      .update(schema.universityDomains)
      .set(data)
      .where(eq(schema.universityDomains.id, domainId))
      .returning();
    return updated;
  },

  async deleteDomain(domainId: string) {
    await db.delete(schema.universityDomains).where(eq(schema.universityDomains.id, domainId));
  },

  // ═══════════════════════════════════════════════
  // FAKÜLTELER
  // ═══════════════════════════════════════════════
  async findFacultiesByUniversity(universityId: string) {
    return await db.query.faculties.findMany({
      where: { universityId },
    });
  },

  async findFacultyInUniversity(universityId: string, facultyId: string) {
    return await db.query.faculties.findFirst({
      where: { id: facultyId, universityId },
    });
  },

  async createFaculty(universityId: string, name: string) {
    const [inserted] = await db.insert(schema.faculties).values({
      universityId,
      name,
    }).returning();
    return inserted;
  },

  async updateFaculty(facultyId: string, name: string) {
    const [updated] = await db
      .update(schema.faculties)
      .set({ name })
      .where(eq(schema.faculties.id, facultyId))
      .returning();
    return updated;
  },

  async deleteFaculty(facultyId: string) {
    await db.delete(schema.faculties).where(eq(schema.faculties.id, facultyId));
  },

  async hasDepartments(facultyId: string): Promise<boolean> {
    const row = await db.query.departments.findFirst({ where: { facultyId }, columns: { id: true } });
    return !!row;
  },

  // ═══════════════════════════════════════════════
  // BÖLÜMLER
  // ═══════════════════════════════════════════════
  async findDepartmentsByFaculty(facultyId: string) {
    return await db.query.departments.findMany({
      where: { facultyId },
    });
  },

  async findDepartmentInFaculty(facultyId: string, departmentId: string) {
    return await db.query.departments.findFirst({
      where: { id: departmentId, facultyId },
    });
  },

  async createDepartment(facultyId: string, name: string) {
    const [inserted] = await db.insert(schema.departments).values({
      facultyId,
      name,
    }).returning();
    return inserted;
  },

  async updateDepartment(departmentId: string, name: string) {
    const [updated] = await db
      .update(schema.departments)
      .set({ name })
      .where(eq(schema.departments.id, departmentId))
      .returning();
    return updated;
  },

  async deleteDepartment(departmentId: string) {
    await db.delete(schema.departments).where(eq(schema.departments.id, departmentId));
  },

  /** Bir bölüme atanmış kullanıcı var mı? (silme öncesi güvenlik kontrolü) */
  async hasUsersInDepartment(departmentId: string): Promise<boolean> {
    const row = await db.query.users.findFirst({ where: { departmentId }, columns: { id: true } });
    return !!row;
  },
};
