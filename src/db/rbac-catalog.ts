import { eq } from "drizzle-orm";
import { db } from "./index";
import * as schema from "./schema";
import { UniversityPermission, UNIVERSITY_PERMISSION_CATALOG } from "../features/university/university.permissions";
import { AuthPermission } from "../features/auth/auth.permissions";
import { AdminPermission, ADMIN_PERMISSION_CATALOG } from "../features/admin/admin.permissions";
import { ClubPermission, CLUB_PERMISSION_CATALOG } from "../features/clubs/clubs.permissions";
import { AnnouncementPermission, ANNOUNCEMENT_PERMISSION_CATALOG } from "../features/announcements/announcements.permissions";
import { GalleryPermission, GALLERY_PERMISSION_CATALOG } from "../features/gallery/gallery.permissions";
import { AuditPermission, AUDIT_PERMISSION_CATALOG } from "../features/audit/audit.permissions";

/**
 * Global RBAC kataloğunun TEK KAYNAĞI (roller, yetkiler, rol→yetki demetleri).
 *
 * Hem seed (dev, temiz DB) hem bootstrap (prod, mevcut DB) bunu kullanır; katalog
 * tek yerde durur ki iki giriş noktası birbirinden kaymasın. `provisionRbacCatalog`
 * IDEMPOTENT'tir: var olanı bırakır, eksiği ekler — yani her deploy'da güvenle
 * yeniden çalıştırılabilir.
 */

/** Çekirdek global roller. `rank` = yetki derecesi (yüksek = daha yetkili). */
export const ROLE_DEFS = [
  { name: "student", description: "Öğrenci", rank: 10 },
  { name: "advisor", description: "Danışman Hoca (kulüp danışmanı atanabilme etiketi)", rank: 20 },
  { name: "auditor", description: "Denetim / İzleme — salt-okunur", rank: 30 },
  { name: "content_moderator", description: "İçerik Moderatörü — duyuru/galeri", rank: 30 },
  { name: "student_affairs", description: "SKS / Öğrenci Kulüpleri Koordinatörlüğü", rank: 45 },
  { name: "academic_affairs", description: "Öğrenci İşleri / BİDB — akademik yapı", rank: 45 },
  { name: "university_admin", description: "Okul Yöneticisi — tenant'ın tamamı", rank: 60 },
  { name: "platform_support", description: "Platform Destek — salt-okunur, çapraz tenant", rank: 90 },
  { name: "super_admin", description: "Sistem Yöneticisi — platform + tüm tenantlar", rank: 100 },
] as const;

/**
 * Tüm yetki kataloğu. `super_admin` bunların HEPSİNİ alır (aşağıda ayrıca ele
 * alınır); diğer roller `ROLE_BUNDLES`'taki alt kümeyi alır.
 */
export const PERMISSION_CATALOG: { key: string; description: string }[] = [
  ...ADMIN_PERMISSION_CATALOG,
  ...CLUB_PERMISSION_CATALOG,
  ...UNIVERSITY_PERMISSION_CATALOG,
  ...ANNOUNCEMENT_PERMISSION_CATALOG,
  ...GALLERY_PERMISSION_CATALOG,
  ...AUDIT_PERMISSION_CATALOG,
  { key: AuthPermission.ROLE_MANAGE, description: "Rol ve yetki kataloğu yönetimi" },
  { key: AuthPermission.PERMISSION_MANAGE, description: "Yetki tanımlama" },
];

/**
 * Global rol → yetki demetleri (kurumsal model, bkz. docs/yonetim/06 §B4).
 * super_admin BURADA yok — tüm yetkileri ayrıca alır.
 */
export const ROLE_BUNDLES: Record<string, string[]> = {
  // Tenant yöneticisi: kendi üniversitesinin tamamı + moderasyon + (tenant-scoped)
  // rol yönetimi. Platform işleri (university.create/delete, permission.manage) HARİÇ.
  university_admin: [
    AdminPermission.USER_VIEW, AdminPermission.USER_MANAGE,
    ClubPermission.VIEW, ClubPermission.APPLICATION_VIEW, ClubPermission.APPROVE,
    ClubPermission.UPDATE, ClubPermission.ADVISOR_MANAGE, ClubPermission.MEMBER_MANAGE, ClubPermission.DELETE,
    AnnouncementPermission.MODERATE, GalleryPermission.MODERATE,
    UniversityPermission.UPDATE,
    UniversityPermission.FACULTY_CREATE, UniversityPermission.FACULTY_UPDATE, UniversityPermission.FACULTY_DELETE,
    UniversityPermission.DEPARTMENT_CREATE, UniversityPermission.DEPARTMENT_UPDATE, UniversityPermission.DEPARTMENT_DELETE,
    UniversityPermission.DOMAIN_CREATE, UniversityPermission.DOMAIN_UPDATE, UniversityPermission.DOMAIN_DELETE,
    AuthPermission.ROLE_MANAGE,
    AuditPermission.VIEW,
  ],
  // SKS / Öğrenci Kulüpleri Koordinatörlüğü: kulüp yaşam döngüsü + moderasyon.
  student_affairs: [
    AdminPermission.USER_VIEW,
    ClubPermission.VIEW, ClubPermission.APPLICATION_VIEW, ClubPermission.APPROVE,
    ClubPermission.UPDATE, ClubPermission.ADVISOR_MANAGE, ClubPermission.MEMBER_MANAGE,
    AnnouncementPermission.MODERATE, GalleryPermission.MODERATE,
  ],
  // Öğrenci İşleri / BİDB: akademik yapı + bölüm atama.
  academic_affairs: [
    AdminPermission.USER_VIEW, AdminPermission.USER_MANAGE,
    UniversityPermission.FACULTY_CREATE, UniversityPermission.FACULTY_UPDATE, UniversityPermission.FACULTY_DELETE,
    UniversityPermission.DEPARTMENT_CREATE, UniversityPermission.DEPARTMENT_UPDATE, UniversityPermission.DEPARTMENT_DELETE,
    UniversityPermission.DOMAIN_CREATE, UniversityPermission.DOMAIN_UPDATE, UniversityPermission.DOMAIN_DELETE,
  ],
  // İçerik moderatörü.
  content_moderator: [
    ClubPermission.VIEW, AnnouncementPermission.MODERATE, GalleryPermission.MODERATE,
  ],
  // Denetim / İzleme (salt-okunur, kendi tenant). Denetim izi bu rolün ana ekranıdır.
  auditor: [
    AdminPermission.USER_VIEW, ClubPermission.VIEW, ClubPermission.APPLICATION_VIEW,
    AuditPermission.VIEW,
  ],
  // Platform Destek (salt-okunur, çapraz tenant — tenant scope bypass'ı roldedir).
  platform_support: [
    AdminPermission.USER_VIEW, ClubPermission.VIEW, ClubPermission.APPLICATION_VIEW,
    AuditPermission.VIEW,
  ],
};

/** seed / bootstrap'in verdiği transaction ya da doğrudan db. */
export type DbExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Rolleri, yetkileri ve rol→yetki bağlarını kurar. IDEMPOTENT — mevcut bir
 * DB'de eksikleri tamamlar, var olanları bozmaz. `roleName → roleId` haritasını
 * döner (kullanıcı-rol ataması için).
 *
 * NOT: Runtime'da `role.manage` ile eklenmiş FAZLA atamalara dokunmaz; yalnızca
 * eksikleri ekler. Eski/kaldırılmış anahtarların temizliği `db:sync-permissions`
 * işidir, burası değil.
 */
export async function provisionRbacCatalog(tx: DbExecutor): Promise<Record<string, string>> {
  // 1. Roller — roles.name UNIQUE değil, o yüzden "varsa seç, yoksa ekle".
  const roleIdByName: Record<string, string> = {};
  for (const def of ROLE_DEFS) {
    const existing = await tx
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.name, def.name))
      .limit(1);
    roleIdByName[def.name] = existing.length
      ? existing[0].id
      : (await tx.insert(schema.roles).values(def).returning())[0].id;
  }

  // 2. Yetkiler — key UNIQUE, çakışanları atla.
  await tx.insert(schema.permissions).values(PERMISSION_CATALOG).onConflictDoNothing();
  const allPermissions = await tx.select({ id: schema.permissions.id, key: schema.permissions.key }).from(schema.permissions);
  const permissionIdByKey: Record<string, string> = {};
  for (const p of allPermissions) permissionIdByKey[p.key] = p.id;

  // 3. Rol → yetki demetleri — (roleId, permissionId) bileşik PK, çakışanları atla.
  for (const [roleName, keys] of Object.entries(ROLE_BUNDLES)) {
    const rows = keys
      .filter((k) => permissionIdByKey[k])
      .map((k) => ({ roleId: roleIdByName[roleName], permissionId: permissionIdByKey[k] }));
    if (rows.length) await tx.insert(schema.rolePermissions).values(rows).onConflictDoNothing();
  }

  // 4. super_admin: TÜM yetkiler (platform dahil).
  const superAdminRows = allPermissions.map((p) => ({
    roleId: roleIdByName["super_admin"],
    permissionId: p.id,
  }));
  if (superAdminRows.length) await tx.insert(schema.rolePermissions).values(superAdminRows).onConflictDoNothing();

  return roleIdByName;
}
