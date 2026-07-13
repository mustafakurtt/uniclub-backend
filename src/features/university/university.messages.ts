import { defineCatalog } from "../../core/i18n/translator";

/**
 * University feature'ının kullanıcı-cephesi mesajları (hata + başarı), feature'ın
 * KENDİ içinde — aynı `university.permissions.ts` gibi her feature kendi
 * kataloğunu taşır. Kompozisyon kökü `shared/i18n/messages.ts` bunları
 * `mergeCatalogs` ile birleştirir; merkezî dev bir mesaj dosyası dolmaz.
 *
 * Anahtarlar `resource.durum` biçiminde. `{param}` yerleri HttpError.params /
 * respond params ile doldurulur. Yeni dil = her dile bir kolon eklemek.
 */
export const universityMessages = defineCatalog({
  tr: {
    // university — hata
    "university.notFound": "Üniversite bulunamadı.",
    "university.slugTaken": "Bu slug zaten kullanılıyor.",
    "university.domainDuplicateInRequest": "\"{domain}\" domaini istekte birden fazla kez girilmiş.",
    "university.domainAlreadyRegistered": "\"{domain}\" domaini zaten kayıtlı.",
    "university.hasUsers": "Bu üniversiteye bağlı kullanıcılar var, silinemez.",
    "university.hasClubs": "Bu üniversiteye bağlı kulüpler var, silinemez.",
    "university.hasFaculties": "Bu üniversitenin fakülteleri var, önce fakülteleri silin.",
    // university — başarı
    "university.listed": "Üniversiteler listelendi.",
    "university.found": "Üniversite bulundu.",
    "university.created": "Üniversite oluşturuldu.",
    "university.updated": "Üniversite güncellendi.",
    "university.deleted": "Üniversite silindi.",
    // domain — hata
    "domain.notFound": "Domain bulunamadı.",
    "domain.alreadyRegistered": "Bu domain zaten kayıtlı.",
    "domain.lastCannotDelete": "Üniversitenin en az bir domaini olmalıdır, son domain silinemez.",
    // domain — başarı
    "domain.listed": "Domainler listelendi.",
    "domain.created": "Domain eklendi.",
    "domain.updated": "Domain güncellendi.",
    "domain.deleted": "Domain silindi.",
    // faculty — hata
    "faculty.notFound": "Fakülte bulunamadı.",
    "faculty.hasDepartments": "Bu fakültenin bölümleri var, önce bölümleri silin.",
    // faculty — başarı
    "faculty.listed": "Fakülteler listelendi.",
    "faculty.found": "Fakülte bulundu.",
    "faculty.created": "Fakülte oluşturuldu.",
    "faculty.updated": "Fakülte güncellendi.",
    "faculty.deleted": "Fakülte silindi.",
    // department — hata
    "department.notFound": "Bölüm bulunamadı.",
    "department.hasUsers": "Bu bölüme bağlı kullanıcılar var, silinemez.",
    // department — başarı
    "department.listed": "Bölümler listelendi.",
    "department.found": "Bölüm bulundu.",
    "department.created": "Bölüm oluşturuldu.",
    "department.updated": "Bölüm güncellendi.",
    "department.deleted": "Bölüm silindi.",
  },
  en: {
    // university — error
    "university.notFound": "University not found.",
    "university.slugTaken": "This slug is already in use.",
    "university.domainDuplicateInRequest": "Domain \"{domain}\" was provided more than once in the request.",
    "university.domainAlreadyRegistered": "Domain \"{domain}\" is already registered.",
    "university.hasUsers": "This university has users and cannot be deleted.",
    "university.hasClubs": "This university has clubs and cannot be deleted.",
    "university.hasFaculties": "This university has faculties; delete the faculties first.",
    // university — success
    "university.listed": "Universities listed.",
    "university.found": "University found.",
    "university.created": "University created.",
    "university.updated": "University updated.",
    "university.deleted": "University deleted.",
    // domain — error
    "domain.notFound": "Domain not found.",
    "domain.alreadyRegistered": "This domain is already registered.",
    "domain.lastCannotDelete": "A university must have at least one domain; the last one cannot be deleted.",
    // domain — success
    "domain.listed": "Domains listed.",
    "domain.created": "Domain added.",
    "domain.updated": "Domain updated.",
    "domain.deleted": "Domain deleted.",
    // faculty — error
    "faculty.notFound": "Faculty not found.",
    "faculty.hasDepartments": "This faculty has departments; delete the departments first.",
    // faculty — success
    "faculty.listed": "Faculties listed.",
    "faculty.found": "Faculty found.",
    "faculty.created": "Faculty created.",
    "faculty.updated": "Faculty updated.",
    "faculty.deleted": "Faculty deleted.",
    // department — error
    "department.notFound": "Department not found.",
    "department.hasUsers": "This department has users and cannot be deleted.",
    // department — success
    "department.listed": "Departments listed.",
    "department.found": "Department found.",
    "department.created": "Department created.",
    "department.updated": "Department updated.",
    "department.deleted": "Department deleted.",
  },
});

/** Bu feature'ın geçerli mesaj anahtarları — typo'ları derleme anında yakalar. */
export type UniversityMessageKey = keyof (typeof universityMessages)["tr"];
