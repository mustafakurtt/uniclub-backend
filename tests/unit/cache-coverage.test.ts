import { describe, expect, it } from "bun:test";
import { uncoveredEntries } from "../../src/core/cache";
import { universityCache, universityEffects } from "../../src/features/university/university.cache";
import { clubsCache, clubEffects } from "../../src/features/clubs/clubs.cache";
import {
  announcementsCache,
  announcementEffects,
} from "../../src/features/announcements/announcements.cache";
import { galleryCache, galleryEffects } from "../../src/features/gallery/gallery.cache";
import { activitiesCache, activityEffects } from "../../src/features/activities/activities.cache";
import { authCache, authCatalogEffects } from "../../src/features/auth/auth.cache";
import { dashboardCache } from "../../src/features/dashboard/dashboard.cache";

/**
 * KAPSAM DENETİMİ — cache'lenip hiçbir efektin düşürmediği bir girdi kalmasın.
 *
 * Bu, invalidasyonun otomatikleştirilebilen KISMIDIR. "Hangi yazma neyi bayatlatır"
 * iş bilgisidir ve elle bildirilmek zorundadır; ama "bu girdi için hiç karar
 * verilmemiş" durumu makine tarafından yakalanabilir — ve yakalanmazsa o anahtar
 * TTL dolana kadar kalıcı bayat kalır.
 *
 * Yeni bir girdi eklendiğinde bu test onu bir efekte bağlanana kadar KIRMIZI kalır.
 * Efektler örnek argümanlarla çağrılır; argümanların gerçek olması gerekmez, hangi
 * GİRDİLERİN kapsandığı önemlidir.
 *
 * Not: bu testin cache'e ihtiyacı yok — `entries()` saf bir fonksiyondur, hiçbir
 * store'a dokunmaz.
 */
const U = "ornek-universite-id";
const C = "ornek-kulup-id";
const F = "ornek-fakulte-id";
const A = "ornek-etkinlik-id";

describe("cache kapsam denetimi — her girdiyi düşüren bir efekt var mı?", () => {
  it("university", () => {
    expect(
      uncoveredEntries(universityCache, [
        universityEffects.universityCreated.entries(),
        universityEffects.universityUpdated.entries(U),
        universityEffects.universityDeleted.entries(U),
        universityEffects.domainsChanged.entries(U),
        universityEffects.facultyChanged.entries(U),
        universityEffects.facultyDeleted.entries(U, F),
        universityEffects.departmentChanged.entries(F),
      ])
    ).toEqual([]);
  });

  it("clubs", () => {
    expect(
      uncoveredEntries(clubsCache, [
        clubEffects.clubApproved.entries(U),
        clubEffects.detailChanged.entries(C),
        clubEffects.membershipChanged.entries(C),
        clubEffects.profileChanged.entries(U, C),
        clubEffects.clubChangedDeeply.entries(U, C),
      ])
    ).toEqual([]);
  });

  it("announcements", () => {
    expect(uncoveredEntries(announcementsCache, [announcementEffects.changed.entries(C)])).toEqual(
      []
    );
  });

  it("gallery", () => {
    expect(uncoveredEntries(galleryCache, [galleryEffects.changed.entries(C)])).toEqual([]);
  });

  it("activities", () => {
    expect(
      uncoveredEntries(activitiesCache, [activityEffects.activityChanged.entries(A, [U])])
    ).toEqual([]);
  });

  it("auth (RBAC katalogu)", () => {
    expect(
      uncoveredEntries(authCache, [
        authCatalogEffects.permissionsChanged.entries(),
        authCatalogEffects.rolesChanged.entries(),
        authCatalogEffects.permissionDeleted.entries(),
      ])
    ).toEqual([]);
  });

  /**
   * dashboard BİLİNÇLİ olarak efektsizdir: sayaçlar düzinelerce yazımdan etkilenir
   * ve staleness-toleranslıdır → precise invalidasyon yerine kısa TTL (30 sn).
   * Denetimin dışında tutulması bir eksiklik değil, kayda geçmiş bir karardır;
   * bu yüzden burada ADI GEÇİYOR — sessizce atlanmıyor.
   */
  it("dashboard: efekt YOK — TTL stratejisi (bilinçli istisna)", () => {
    expect(uncoveredEntries(dashboardCache, [])).toEqual(["student", "club", "admin"]);
  });
});
