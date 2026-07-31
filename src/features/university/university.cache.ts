import { defineKeyspace, entry, effect } from "../../core/cache";
import { cache } from "../../shared/cache/cache.client";
import type { Department, Faculty } from "./university.types";
import type { universityRepository } from "./repositories";

/**
 * university feature'ının cache SÖZLEŞMESİ: hangi anahtar hangi TİPİ taşır ve
 * hangi iş olayı hangi anahtarları bayatlatır — ikisi de tek dosyada, tek beyanda
 * (bkz. core/cache/keyspace.ts).
 *
 * Bu okumalar görece durağandır (tenant/fakülte/bölüm ağacı). Arama sonuçları ve
 * varlık/tenant guard'ları BİLİNÇLİ olarak cache DIŞINDA kalır (çok anahtar, düşük
 * değer) — gerekçeler servis katmanındaki notlarda.
 *
 * İnvalidasyon TETİĞİ rotalardadır (`invalidates(...)` middleware'i, bkz.
 * routes/*.routes.ts); servis katmanı cache'i hiç bilmez. HTTP dışı bir yazar
 * çıkarsa aynı efekti `universityEffects.x.emit(...)` ile doğrudan tetikler.
 */

// Cache'lenen liste/detay şekilleri repository sorgularının TAM çıktısıdır (kolon
// seçimi + `with` ilişkileri dahil). Elle DTO yazmak yerine oradan türetiyoruz ki
// sorgu değiştiğinde cache'in taşıdığı tip sessizce ayrışmasın.
type UniversityList = Awaited<ReturnType<typeof universityRepository.list>>;
type UniversityDetail = Awaited<ReturnType<typeof universityRepository.findByIdWithDomains>>;

/**
 * `university:` keyspace'i. Okuma: `universityCache.faculties(id).read(loader)`.
 * Tek bir girdiyi elle düşürmek gerekirse `.drop()` — ama normal yol efektlerdir.
 */
export const universityCache = defineKeyspace(cache, "university", {
  /** Aramasız public üniversite listesi. */
  list: entry<UniversityList>()("list"),
  /** Domainleriyle tek üniversite (bulunamazsa `undefined` — getOrSet onu yazmaz). */
  byId: entry<UniversityDetail>()((universityId: string) => `byId:${universityId}`),
  /** Bir üniversitenin fakülte listesi. */
  faculties: entry<Faculty[]>()((universityId: string) => `faculties:${universityId}`),
  /** Bir fakültenin bölüm listesi. */
  departments: entry<Department[]>()((facultyId: string) => `departments:${facultyId}`),
});

/**
 * İş olayı → bayatlayan girdiler. Anahtar listeleri BURADA, tek yerde durur;
 * rotalar yalnızca hangi olayın gerçekleştiğini bildirir.
 */
export const universityEffects = {
  /** Üniversite oluşturuldu → yalnızca liste değişir. */
  universityCreated: effect("university.created", () => [universityCache.list()]),

  /** Üniversite güncellendi → liste + o kayıt. */
  universityUpdated: effect("university.updated", (universityId: string) => [
    universityCache.list(),
    universityCache.byId(universityId),
  ]),

  /** Üniversite silindi → liste + kayıt + fakülte listesi. */
  universityDeleted: effect("university.deleted", (universityId: string) => [
    universityCache.list(),
    universityCache.byId(universityId),
    universityCache.faculties(universityId),
  ]),

  /**
   * Domain eklendi/güncellendi/silindi → yalnızca o üniversitenin kaydı; domainler
   * `getUniversity` yanıtının parçasıdır, ayrı bir anahtarları yoktur.
   */
  domainsChanged: effect("university.domainsChanged", (universityId: string) => [
    universityCache.byId(universityId),
  ]),

  /** Fakülte oluşturuldu/güncellendi → o üniversitenin fakülte listesi. */
  facultyChanged: effect("university.facultyChanged", (universityId: string) => [
    universityCache.faculties(universityId),
  ]),

  /** Fakülte silindi → fakülte listesi + o fakültenin bölüm listesi. */
  facultyDeleted: effect("university.facultyDeleted", (universityId: string, facultyId: string) => [
    universityCache.faculties(universityId),
    universityCache.departments(facultyId),
  ]),

  /** Bölüm oluşturuldu/güncellendi/silindi → o fakültenin bölüm listesi. */
  departmentChanged: effect("university.departmentChanged", (facultyId: string) => [
    universityCache.departments(facultyId),
  ]),
};
