import type { Catalog } from "../../core/i18n/translator";

/**
 * Kullanıcı-cephesi mesaj kataloğu. Anahtar → (dil → şablon). `{param}` yerleri
 * HttpError'un `params`'ıyla doldurulur. core dil bilmez; bu katalog projenin.
 *
 * Kapsam (şimdilik): university feature hataları + ortak (validation/server).
 * Diğer feature'lar hâlâ düz Türkçe metin fırlatıyor; onlar katalogda YOK ve
 * çevirmen metni aynen döndürdüğü için bozulmadan çalışıyorlar (geri uyum).
 * Başarı mesajları (ok/created/done) bir sonraki dilimde eklenecek.
 */
export const messages: Catalog = {
  tr: {
    // ortak
    "validation.failed": "Girdi doğrulaması başarısız.",
    "server.unexpected": "Sunucu tarafında beklenmeyen bir hata oluştu.",
    // university
    "university.notFound": "Üniversite bulunamadı.",
    "university.slugTaken": "Bu slug zaten kullanılıyor.",
    "university.domainDuplicateInRequest": "\"{domain}\" domaini istekte birden fazla kez girilmiş.",
    "university.domainAlreadyRegistered": "\"{domain}\" domaini zaten kayıtlı.",
    "university.hasUsers": "Bu üniversiteye bağlı kullanıcılar var, silinemez.",
    "university.hasClubs": "Bu üniversiteye bağlı kulüpler var, silinemez.",
    "university.hasFaculties": "Bu üniversitenin fakülteleri var, önce fakülteleri silin.",
    // domain
    "domain.notFound": "Domain bulunamadı.",
    "domain.alreadyRegistered": "Bu domain zaten kayıtlı.",
    "domain.lastCannotDelete": "Üniversitenin en az bir domaini olmalıdır, son domain silinemez.",
    // faculty
    "faculty.notFound": "Fakülte bulunamadı.",
    "faculty.hasDepartments": "Bu fakültenin bölümleri var, önce bölümleri silin.",
    // department
    "department.notFound": "Bölüm bulunamadı.",
    "department.hasUsers": "Bu bölüme bağlı kullanıcılar var, silinemez.",
  },
  en: {
    // common
    "validation.failed": "Validation failed.",
    "server.unexpected": "An unexpected error occurred on the server.",
    // university
    "university.notFound": "University not found.",
    "university.slugTaken": "This slug is already in use.",
    "university.domainDuplicateInRequest": "Domain \"{domain}\" was provided more than once in the request.",
    "university.domainAlreadyRegistered": "Domain \"{domain}\" is already registered.",
    "university.hasUsers": "This university has users and cannot be deleted.",
    "university.hasClubs": "This university has clubs and cannot be deleted.",
    "university.hasFaculties": "This university has faculties; delete the faculties first.",
    // domain
    "domain.notFound": "Domain not found.",
    "domain.alreadyRegistered": "This domain is already registered.",
    "domain.lastCannotDelete": "A university must have at least one domain; the last one cannot be deleted.",
    // faculty
    "faculty.notFound": "Faculty not found.",
    "faculty.hasDepartments": "This faculty has departments; delete the departments first.",
    // department
    "department.notFound": "Department not found.",
    "department.hasUsers": "This department has users and cannot be deleted.",
  },
};
