import { cache } from "../../shared/cache/cache.client";

/**
 * university feature'ının izole cache keyspace'i (`university:` öneki) + tipli
 * read-through/invalidasyon yardımcıları. Anahtar üretimi ve invalidasyon
 * ilişkileri TEK yerde toplanır ki service okunur kalsın, anahtarlar dağılmasın.
 *
 * Bu okumalar görece durağandır (tenant/fakülte/bölüm ağacı); yazma yollarında
 * ilgili anahtarlar AÇIKÇA geçersiz kılınır (grup/tag invalidasyonu yok — bkz.
 * core/cache Cache.namespace). Domainler getUniversity yanıtının parçası olduğu
 * için domain yazımları `byId`'i geçersiz kılar.
 */
const c = cache.namespace("university");

const keys = {
  /** Aramasız public üniversite listesi. */
  list: "list",
  /** Domainleriyle tek üniversite. */
  byId: (universityId: string) => `byId:${universityId}`,
  /** Bir üniversitenin fakülte listesi. */
  faculties: (universityId: string) => `faculties:${universityId}`,
  /** Bir fakültenin bölüm listesi. */
  departments: (facultyId: string) => `departments:${facultyId}`,
};

export const universityCache = {
  // ── Okuma (read-through) ────────────────────────────────────────────────
  list: <T>(loader: () => Promise<T>) => c.getOrSet(keys.list, loader),
  byId: <T>(universityId: string, loader: () => Promise<T>) =>
    c.getOrSet(keys.byId(universityId), loader),
  faculties: <T>(universityId: string, loader: () => Promise<T>) =>
    c.getOrSet(keys.faculties(universityId), loader),
  departments: <T>(facultyId: string, loader: () => Promise<T>) =>
    c.getOrSet(keys.departments(facultyId), loader),

  // ── Invalidasyon ────────────────────────────────────────────────────────
  /** Üniversite oluşturuldu → yalnızca liste değişir. */
  invalidateList: () => c.delete(keys.list),
  /** Üniversite güncellendi → liste + o kayıt. */
  invalidateUniversity: (universityId: string) =>
    c.delete([keys.list, keys.byId(universityId)]),
  /** Domain değişti → yalnızca o üniversitenin kaydı (domainler onun parçası). */
  invalidateUniversityDomains: (universityId: string) => c.delete(keys.byId(universityId)),
  /** Üniversite silindi → liste + kayıt + fakülte listesi. */
  invalidateUniversityDeep: (universityId: string) =>
    c.delete([keys.list, keys.byId(universityId), keys.faculties(universityId)]),
  /** Fakülte oluşturuldu/güncellendi → o üniversitenin fakülte listesi. */
  invalidateFaculties: (universityId: string) => c.delete(keys.faculties(universityId)),
  /** Fakülte silindi → fakülte listesi + o fakültenin bölüm listesi. */
  invalidateFacultyDeep: (universityId: string, facultyId: string) =>
    c.delete([keys.faculties(universityId), keys.departments(facultyId)]),
  /** Bölüm oluşturuldu/güncellendi/silindi → o fakültenin bölüm listesi. */
  invalidateDepartments: (facultyId: string) => c.delete(keys.departments(facultyId)),
};
