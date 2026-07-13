import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { universities, universityDomains, faculties, users, clubs } from "../../../db/schema";
import { BaseRepository } from "../../../core/db";
import type { CreateUniversityPayload } from "../university.types";

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
      columns: { id: true, name: true, slug: true, createdAt: true },
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

  /** Üniversite + domainlerini tek transaction'da oluşturur. */
  createWithDomains(data: CreateUniversityPayload) {
    return this.transaction(async (_repo, tx) => {
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
    });
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
