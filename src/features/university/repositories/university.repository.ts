import { eq, isNull, and } from "drizzle-orm";
import { db } from "../../../db";
import { universities, universityDomains, faculties, departments, users, clubs } from "../../../db/schema";
import type { DbExecutor } from "../../../db/executor";
import { BaseRepository } from "../../../core/db";
import type {
  CreateUniversityPayload,
  CreateTenantPackagePayload,
  TenantPackageResult,
  UpdateTenantLifecyclePayload,
} from "../university.types";

// Silme öncesi ağır-bağımlılık kontrolleri, başka tablolara bakar → tablo başına
// hafif BaseRepository örnekleri. facultiesRepo softDelete=true: existsWhere yalnızca
// CANLI fakülteleri sayar (deleted_at IS NULL otomatik uygulanır).
const facultiesRepo = new BaseRepository(db, faculties, { softDelete: true });
const usersRepo = new BaseRepository(db, users);
const clubsRepo = new BaseRepository(db, clubs);

/**
 * Üniversite (tenant) veri erişimi. BaseRepository'den mekanik CRUD'u miras alır
 * (create/updateById); silme YUMUŞAKTIR (deletedAt). İlişkisel/özel sorgular
 * `this.query` (db.query.universities) ile tam tipli yazılır.
 *
 * ÖNEMLİ (soft-delete + unique): `slug` benzersizdir. Benzersizlik guard'ı
 * (findBySlug) silinmiş satırları da GÖRMELİDİR — aksi halde silinmiş bir
 * üniversitenin slug'ı "boş" sanılır ve yeniden ekleme DB unique ihlaline düşer.
 */
class UniversityRepository extends BaseRepository<typeof universities, typeof db.query.universities> {
  constructor() {
    super(db, universities, { softDelete: true, query: db.query.universities });
  }

  /** Hafif public liste (silinmiş hariç), opsiyonel ada göre arama. */
  list(search?: string) {
    return this.query!.findMany({
      where: search
        ? { deletedAt: { isNull: true }, name: { ilike: `%${search}%` } }
        : { deletedAt: { isNull: true } },
      columns: {
        id: true,
        name: true,
        slug: true,
        status: true,
        statusReason: true,
        statusChangedAt: true,
        statusChangedBy: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  findByIdSummary(id: string) {
    return this.query!.findFirst({
      where: { id, deletedAt: { isNull: true } },
      columns: {
        id: true,
        name: true,
        slug: true,
        status: true,
        statusReason: true,
        statusChangedAt: true,
        statusChangedBy: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /** Domainleriyle birlikte tek üniversite (silinmiş hariç). */
  findByIdWithDomains(id: string) {
    return this.query!.findFirst({
      where: { id, deletedAt: { isNull: true } },
      with: { domains: true },
    });
  }

  /** Benzersizlik kontrolü — silinmiş satırlar DAHİL (unique kısıt hepsini kapsar). */
  findBySlugIncludingDeleted(slug: string) {
    return this.query!.findFirst({ where: { slug } });
  }

  /** Tenant yaşam döngüsü / login kontrolü için hafif status okuması. */
  async findStatusById(universityId: string) {
    const row = await this.query!.findFirst({
      where: { id: universityId, deletedAt: { isNull: true } },
      columns: { status: true },
    });
    return row?.status;
  }

  /** Üniversite + domainlerini tek transaction'da oluşturur. */
  createWithDomains(data: CreateUniversityPayload) {
    return this.transaction(async (_repo, tx) => insertWithDomainsInTx(tx as DbExecutor, data));
  }

  /** Onboard paketi — harici tx veya kendi transaction'ı. */
  createTenantPackage(data: CreateTenantPackagePayload, options?: { tx?: DbExecutor }) {
    if (options?.tx) {
      return insertTenantPackageInTx(options.tx, data);
    }
    return this.transaction(async (_repo, tx) => insertTenantPackageInTx(tx as DbExecutor, data));
  }

  updateTenantLifecycle(
    universityId: string,
    data: UpdateTenantLifecyclePayload,
    options?: { tx?: DbExecutor }
  ) {
    if (options?.tx) {
      return updateTenantLifecycleInTx(options.tx, universityId, data);
    }
    return this.transaction(async (_repo, tx) =>
      updateTenantLifecycleInTx(tx as DbExecutor, universityId, data)
    );
  }

  /**
   * Üniversiteyi YUMUŞAK siler; domainlerini FİZİKSEL siler. Domainler fiziksel
   * gitmeli: kayıt (register) akışı tenant'ı domainden çözüyor — ölü bir tenant'a
   * kayıt düşmesin. (Ağır bağımlılar service'te önceden engellenir.)
   */
  softDeleteWithDomains(id: string) {
    return this.transaction(async (repo, tx) => {
      await tx.delete(universityDomains).where(eq(universityDomains.universityId, id));
      await repo.deleteById(id); // soft (deletedAt=now)
    });
  }

  // ── Silme öncesi ağır-bağımlılık kontrolleri (varlık yeterli) ────────────
  /** Bu üniversitenin CANLI fakültesi var mı? (facultiesRepo softDelete → deleted_at IS NULL) */
  hasFaculties(universityId: string): Promise<boolean> {
    return facultiesRepo.existsWhere({ universityId });
  }

  hasUsers(universityId: string): Promise<boolean> {
    return usersRepo.existsWhere({ universityId });
  }

  hasClubs(universityId: string): Promise<boolean> {
    return clubsRepo.existsWhere({ universityId });
  }
}

export const universityRepository = new UniversityRepository();

async function insertWithDomainsInTx(tx: DbExecutor, data: CreateUniversityPayload) {
  const [university] = await tx
    .insert(universities)
    .values({ name: data.name, slug: data.slug })
    .returning();
  const domains = await tx
    .insert(universityDomains)
    .values(
      data.domains.map((d) => ({
        universityId: university.id,
        domain: d.domain,
        domainType: d.domainType,
      }))
    )
    .returning();
  return { university, domains };
}

async function insertTenantPackageInTx(
  tx: DbExecutor,
  data: CreateTenantPackagePayload
): Promise<TenantPackageResult> {
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

  const facultyRows: TenantPackageResult["faculties"] = [];
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

  return { university, domains, faculties: facultyRows };
}

async function updateTenantLifecycleInTx(
  tx: DbExecutor,
  universityId: string,
  data: UpdateTenantLifecyclePayload
) {
  const [updated] = await tx
    .update(universities)
    .set({
      status: data.status,
      statusReason: data.statusReason,
      statusChangedAt: new Date(),
      statusChangedBy: data.statusChangedBy,
      updatedAt: new Date(),
    })
    .where(and(eq(universities.id, universityId), isNull(universities.deletedAt)))
    .returning({
      id: universities.id,
      name: universities.name,
      slug: universities.slug,
      status: universities.status,
      statusReason: universities.statusReason,
      statusChangedAt: universities.statusChangedAt,
      statusChangedBy: universities.statusChangedBy,
      createdAt: universities.createdAt,
      updatedAt: universities.updatedAt,
    });
  return updated;
}
