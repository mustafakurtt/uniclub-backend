import { Hono } from "hono";
import { authMiddleware } from "../../core/auth/auth.middleware";
import { guard } from "../../core/rbac/guard";
import { attachAuthz, hasTenantScopeBypass, RbacVariables } from "../../core/rbac/rbac.middleware";
import { validate } from "../../shared/utils/validate";
import { ok, created, done } from "../../shared/utils/respond";
import { AdminPermission } from "./admin.permissions";
import { ClubPermission } from "../clubs/clubs.permissions";
import { AnnouncementPermission } from "../announcements/announcements.permissions";
import { GalleryPermission } from "../gallery/gallery.permissions";
import {
  updateClubStatusSchema,
  listUsersQuerySchema,
  listClubApplicationsQuerySchema,
  listClubsQuerySchema,
  addAdvisorSchema,
  updateClubSchema,
  updateUserDepartmentSchema,
} from "./admin.schema";
import { adminService } from "./admin.service";

export const adminRoutes = new Hono<{ Variables: RbacVariables }>();

// Not: rotalar bilinçli olarak try/catch İÇERMEZ — servis katmanı HttpError
// fırlatır, `app.onError` (core/http/error-handler) tek noktadan çevirir.

// 0. KAPSAMIM: yönetim bağlamında erişebildiğim üniversiteler.
// Bilinçli olarak permission guard'ı YOK — bu bir "kapsamım ne?" sorgusudur ve
// cevabı zaten aktörün kendi kapsamıyla sınırlıdır (öğrenci → kendi okulu).
// Panel, global public `GET /api/universities` yerine bunu kullanmalıdır.
adminRoutes.get("/universities", authMiddleware, attachAuthz, async (c) => {
  const user = c.get("user");
  const authz = c.get("authz");
  const universities = await adminService.listAccessibleUniversities({
    universityId: user.universityId,
    isPlatformScoped: hasTenantScopeBypass(authz),
  });
  return ok(c, universities, "admin.accessibleUniversitiesListed");
});

// 1. ÜNİVERSİTEDEKİ KULLANICILARI LİSTELEME (salt-okunur → user.view)
adminRoutes.get(
  "/universities/:universityId/users",
  ...guard(AdminPermission.USER_VIEW, { tenantScoped: true }),
  validate("query", listUsersQuerySchema),
  async (c) => {
    const { universityId } = c.req.param();
    const { status, role } = c.req.valid("query");
    const users = await adminService.listUsers(universityId, status, role);
    return ok(c, users, "admin.usersListed");
  }
);

// 2. TEK BİR KULLANICIYI GETİRME (roller + kulüp üyelikleri + effective yetkiler)
adminRoutes.get(
  "/universities/:universityId/users/:userId",
  ...guard(AdminPermission.USER_VIEW, { tenantScoped: true }),
  async (c) => {
    const { universityId, userId } = c.req.param();
    const user = await adminService.getUser(universityId, userId);
    return ok(c, user, "admin.userFound");
  }
);

// 2B. KULLANICININ EFFECTIVE (ETKİN) YETKİLERİ
adminRoutes.get(
  "/universities/:universityId/users/:userId/effective-permissions",
  ...guard(AdminPermission.USER_VIEW, { tenantScoped: true }),
  async (c) => {
    const { universityId, userId } = c.req.param();
    const data = await adminService.getUserEffectivePermissions(universityId, userId);
    return ok(c, data, "admin.userEffectivePermissionsListed");
  }
);

// Not: Kullanıcı durumu (ban/unban) yönetimi ARTIK moderation feature'ına aittir
// (POST /api/moderation/.../users/:userId/ban|unban) — sebep + geçmiş + şifre
// sıfırlamayla birlikte. Eski PATCH .../status endpoint'i kaldırıldı.

// 3B. KULLANICININ BÖLÜMÜNÜ GÜNCELLEME
adminRoutes.patch(
  "/universities/:universityId/users/:userId/department",
  ...guard(AdminPermission.USER_MANAGE, { tenantScoped: true }),
  validate("json", updateUserDepartmentSchema),
  async (c) => {
    const { universityId, userId } = c.req.param();
    const body = c.req.valid("json");
    const updated = await adminService.updateUserDepartment(universityId, userId, body);
    return ok(c, updated, "admin.userDepartmentUpdated");
  }
);

// 4. KULÜP BAŞVURULARINI LİSTELEME (salt-okunur → application.view)
adminRoutes.get(
  "/universities/:universityId/club-applications",
  ...guard(ClubPermission.APPLICATION_VIEW, { tenantScoped: true }),
  validate("query", listClubApplicationsQuerySchema),
  async (c) => {
    const { universityId } = c.req.param();
    const { status } = c.req.valid("query");
    const applications = await adminService.listClubApplications(universityId, status);
    return ok(c, applications, "admin.applicationsListed");
  }
);

// 5. KULÜP BAŞVURUSUNU ONAYLAMA (gerçek bir kulüp oluşturur)
adminRoutes.patch(
  "/universities/:universityId/club-applications/:applicationId/approve",
  ...guard(ClubPermission.APPROVE, { tenantScoped: true }),
  async (c) => {
    const { universityId, applicationId } = c.req.param();
    const actor = c.get("user");
    const result = await adminService.approveClubApplication(universityId, applicationId, actor.userId);
    return ok(c, result, "admin.applicationApproved");
  }
);

// 6. KULÜP BAŞVURUSUNU REDDETME
adminRoutes.patch(
  "/universities/:universityId/club-applications/:applicationId/reject",
  ...guard(ClubPermission.APPROVE, { tenantScoped: true }),
  async (c) => {
    const { universityId, applicationId } = c.req.param();
    const actor = c.get("user");
    const result = await adminService.rejectClubApplication(universityId, applicationId, actor.userId);
    return ok(c, result, "admin.applicationRejected");
  }
);

// 7. ÜNİVERSİTEDEKİ KULÜPLERİ LİSTELEME (salt-okunur → club.view)
adminRoutes.get(
  "/universities/:universityId/clubs",
  ...guard(ClubPermission.VIEW, { tenantScoped: true }),
  validate("query", listClubsQuerySchema),
  async (c) => {
    const { universityId } = c.req.param();
    const { status } = c.req.valid("query");
    const clubs = await adminService.listClubs(universityId, status);
    return ok(c, clubs, "admin.clubsListed");
  }
);

// 8. KULÜP DURUMUNU GÜNCELLEME
adminRoutes.patch(
  "/universities/:universityId/clubs/:clubId/status",
  ...guard(ClubPermission.UPDATE, { tenantScoped: true }),
  validate("json", updateClubStatusSchema),
  async (c) => {
    const { universityId, clubId } = c.req.param();
    const body = c.req.valid("json");
    const updated = await adminService.updateClubStatus(universityId, clubId, body);
    return ok(c, updated, "admin.clubStatusUpdated");
  }
);

// 8B. KULÜBÜN BİLGİLERİNİ GÜNCELLEME (ad, açıklama, logo, kapak, joinPolicy)
adminRoutes.patch(
  "/universities/:universityId/clubs/:clubId",
  ...guard(ClubPermission.UPDATE, { tenantScoped: true }),
  validate("json", updateClubSchema),
  async (c) => {
    const { universityId, clubId } = c.req.param();
    const body = c.req.valid("json");
    const updated = await adminService.updateClub(universityId, clubId, body);
    return ok(c, updated, "admin.clubUpdated");
  }
);

// 9. KULÜBÜN DANIŞMANLARINI LİSTELEME (salt-okunur → club.view)
adminRoutes.get(
  "/universities/:universityId/clubs/:clubId/advisors",
  ...guard(ClubPermission.VIEW, { tenantScoped: true }),
  async (c) => {
    const { universityId, clubId } = c.req.param();
    const advisors = await adminService.listAdvisors(universityId, clubId);
    return ok(c, advisors, "admin.advisorsListed");
  }
);

// 10. KULÜBE DANIŞMAN ATAMA
adminRoutes.post(
  "/universities/:universityId/clubs/:clubId/advisors",
  ...guard(ClubPermission.ADVISOR_MANAGE, { tenantScoped: true }),
  validate("json", addAdvisorSchema),
  async (c) => {
    const { universityId, clubId } = c.req.param();
    const { userId } = c.req.valid("json");
    const advisor = await adminService.addAdvisor(universityId, clubId, userId);
    return created(c, advisor, "admin.advisorAssigned");
  }
);

// 11. KULÜPTEN DANIŞMAN KALDIRMA
adminRoutes.delete(
  "/universities/:universityId/clubs/:clubId/advisors/:userId",
  ...guard(ClubPermission.ADVISOR_MANAGE, { tenantScoped: true }),
  async (c) => {
    const { universityId, clubId, userId } = c.req.param();
    await adminService.removeAdvisor(universityId, clubId, userId);
    return done(c, "admin.advisorRemoved");
  }
);

// 12. KULÜBÜ KALICI OLARAK SİLME
// Yıkıcı işlem: kulüp önce "archived" veya "rejected" durumda olmalı (bilinçli
// arşivleme adımı). Bağlı içerik (üyeler, danışmanlar, iletişim linkleri, duyuru,
// galeri) tek transaction'da temizlenir.
adminRoutes.delete(
  "/universities/:universityId/clubs/:clubId",
  ...guard(ClubPermission.DELETE, { tenantScoped: true }),
  async (c) => {
    const { universityId, clubId } = c.req.param();
    await adminService.deleteClub(universityId, clubId);
    return done(c, "admin.clubDeleted");
  }
);

// ═══════════════════════════════════════════════
// TENANT MODERASYON — kulüp içeriğine üstten müdahale (bkz. docs/yonetim/06 §A6)
// Kulüp-içi katman (officer/president/advisor) korunur; bunlar tenant yöneticisinin
// HERHANGİ bir kulüpte kullanabildiği override yetkileridir.
// ═══════════════════════════════════════════════

// 13. KULÜP ÜYELERİNİ LİSTELEME (moderasyon görünümü — bekleyenler dahil)
adminRoutes.get(
  "/universities/:universityId/clubs/:clubId/members",
  ...guard(ClubPermission.VIEW, { tenantScoped: true }),
  async (c) => {
    const { universityId, clubId } = c.req.param();
    const members = await adminService.listClubMembers(universityId, clubId);
    return ok(c, members, "admin.membersListed");
  }
);

// 14. KULÜPTEN ÜYE ÇIKARMA (moderasyon override)
adminRoutes.delete(
  "/universities/:universityId/clubs/:clubId/members/:userId",
  ...guard(ClubPermission.MEMBER_MANAGE, { tenantScoped: true }),
  async (c) => {
    const { universityId, clubId, userId } = c.req.param();
    await adminService.removeClubMember(universityId, clubId, userId);
    return done(c, "admin.memberRemoved");
  }
);

// 15. DUYURU MODERASYONU — herhangi bir kulübün duyurusunu kaldırma
adminRoutes.delete(
  "/universities/:universityId/clubs/:clubId/announcements/:announcementId",
  ...guard(AnnouncementPermission.MODERATE, { tenantScoped: true }),
  async (c) => {
    const { universityId, clubId, announcementId } = c.req.param();
    await adminService.moderateRemoveAnnouncement(universityId, clubId, announcementId);
    return done(c, "admin.announcementRemoved");
  }
);

// 16. GALERİ MODERASYONU — herhangi bir kulübün görselini kaldırma
adminRoutes.delete(
  "/universities/:universityId/clubs/:clubId/gallery/:imageId",
  ...guard(GalleryPermission.MODERATE, { tenantScoped: true }),
  async (c) => {
    const { universityId, clubId, imageId } = c.req.param();
    await adminService.moderateRemoveGalleryImage(universityId, clubId, imageId);
    return done(c, "admin.galleryImageRemoved");
  }
);
