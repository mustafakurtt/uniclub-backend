/**
 * university feature'ının sahip olduğu RBAC izin anahtarları.
 *
 * Not: Bu obje KAPALI bir enum değildir — permissions tablosu runtime'da
 * role.manage/permission.manage endpoint'leri üzerinden genişletilebilir.
 * Bu sabitin tek amacı, bu feature'ın bugün bildiği anahtarları TEK bir yerde
 * tutup route/seed gibi çağrı noktalarında yazım hatasını (typo) önlemektir.
 *
 * TASARIM: Eski tek "university.manage" anahtarı, yönetimi daha ince
 * granülerlikte kontrol edebilmek için kaynak+aksiyon (resource.action) bazlı
 * anahtarlara bölündü. Böylece bir kullanıcıya (örn. bir okul yöneticisine)
 * sadece "fakülte ekleme" yetkisi verilebilir, üniversite silme yetkisi
 * verilmeden. Okuma (GET) rotaları izin gerektirmez (public'tir), o yüzden
 * burada bir "view" anahtarı yoktur.
 */
export const UniversityPermission = {
  // ── Üniversite (tenant) ──────────────────────────
  CREATE: "university.create",
  UPDATE: "university.update",
  DELETE: "university.delete",

  // ── E-posta domainleri ───────────────────────────
  DOMAIN_CREATE: "university.domain.create",
  DOMAIN_UPDATE: "university.domain.update",
  DOMAIN_DELETE: "university.domain.delete",

  // ── Fakülteler ───────────────────────────────────
  FACULTY_CREATE: "university.faculty.create",
  FACULTY_UPDATE: "university.faculty.update",
  FACULTY_DELETE: "university.faculty.delete",

  // ── Bölümler ─────────────────────────────────────
  DEPARTMENT_CREATE: "university.department.create",
  DEPARTMENT_UPDATE: "university.department.update",
  DEPARTMENT_DELETE: "university.department.delete",
} as const;

export type UniversityPermission = (typeof UniversityPermission)[keyof typeof UniversityPermission];

/**
 * Seed ve "tüm university yetkileri" gerektiren yerler (örn. super_admin rol
 * ataması) için anahtarların düz listesi + insan-okur açıklamaları. permissions
 * tablosuna satır eklerken bu katalog kullanılır ki seed ile route guard'ları
 * asla birbirinden kaymasın.
 */
export const UNIVERSITY_PERMISSION_CATALOG: { key: UniversityPermission; description: string }[] = [
  { key: UniversityPermission.CREATE, description: "Üniversite oluşturma" },
  { key: UniversityPermission.UPDATE, description: "Üniversite bilgilerini güncelleme" },
  { key: UniversityPermission.DELETE, description: "Üniversite silme" },
  { key: UniversityPermission.DOMAIN_CREATE, description: "Üniversiteye e-posta domaini ekleme" },
  { key: UniversityPermission.DOMAIN_UPDATE, description: "E-posta domaini güncelleme" },
  { key: UniversityPermission.DOMAIN_DELETE, description: "E-posta domaini silme" },
  { key: UniversityPermission.FACULTY_CREATE, description: "Fakülte oluşturma" },
  { key: UniversityPermission.FACULTY_UPDATE, description: "Fakülte güncelleme" },
  { key: UniversityPermission.FACULTY_DELETE, description: "Fakülte silme" },
  { key: UniversityPermission.DEPARTMENT_CREATE, description: "Bölüm oluşturma" },
  { key: UniversityPermission.DEPARTMENT_UPDATE, description: "Bölüm güncelleme" },
  { key: UniversityPermission.DEPARTMENT_DELETE, description: "Bölüm silme" },
];
