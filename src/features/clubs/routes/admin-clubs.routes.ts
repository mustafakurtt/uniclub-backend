import { Hono } from "hono";
import { guard } from "../../../core/rbac/guard";
import { RbacVariables } from "../../../core/rbac/rbac.middleware";
import { validate } from "../../../shared/utils/validate";
import { ok, created, done } from "../../../shared/utils/respond";
import { ClubPermission } from "../clubs.permissions";
import { AnnouncementPermission } from "../../announcements/announcements.permissions";
import { GalleryPermission } from "../../gallery/gallery.permissions";
import {
  updateClubStatusSchema,
  listClubsQuerySchema,
  addAdvisorSchema,
  updateClubSchema,
  adminClubPaginatedListQuerySchema,
} from "../clubs-admin.schema";
import { clubsAdminService } from "../clubs-admin.service";

export const adminClubsRoutes = new Hono<{ Variables: RbacVariables }>();

// 7. ÜNİVERSİTEDEKİ KULÜPLERİ LİSTELEME (salt-okunur → club.view)
adminClubsRoutes.get(
  "/universities/:universityId/clubs",
  ...guard(ClubPermission.VIEW, { tenantScoped: true }),
  validate("query", listClubsQuerySchema),
  async (c) => {
    const { universityId } = c.req.param();
    const { status } = c.req.valid("query");
    const clubs = await clubsAdminService.listClubs(universityId, status);
    return ok(c, clubs, "admin.clubsListed");
  }
);

// 7B. TEK KULÜP DETAYI (özet sayaçlarla)
adminClubsRoutes.get(
  "/universities/:universityId/clubs/:clubId",
  ...guard(ClubPermission.VIEW, { tenantScoped: true }),
  async (c) => {
    const { universityId, clubId } = c.req.param();
    const club = await clubsAdminService.getClub(universityId, clubId);
    return ok(c, club, "admin.clubFound");
  }
);

// 8. KULÜP DURUMUNU GÜNCELLEME
adminClubsRoutes.patch(
  "/universities/:universityId/clubs/:clubId/status",
  ...guard(ClubPermission.UPDATE, { tenantScoped: true }),
  validate("json", updateClubStatusSchema),
  async (c) => {
    const { universityId, clubId } = c.req.param();
    const body = c.req.valid("json");
    const updated = await clubsAdminService.updateClubStatus(universityId, clubId, body);
    return ok(c, updated, "admin.clubStatusUpdated");
  }
);

// 8B. KULÜBÜN BİLGİLERİNİ GÜNCELLEME (ad, açıklama, logo, kapak, joinPolicy)
adminClubsRoutes.patch(
  "/universities/:universityId/clubs/:clubId",
  ...guard(ClubPermission.UPDATE, { tenantScoped: true }),
  validate("json", updateClubSchema),
  async (c) => {
    const { universityId, clubId } = c.req.param();
    const body = c.req.valid("json");
    const updated = await clubsAdminService.updateClub(universityId, clubId, body);
    return ok(c, updated, "admin.clubUpdated");
  }
);

// 9. KULÜBÜN DANIŞMANLARINI LİSTELEME (salt-okunur → club.view)
adminClubsRoutes.get(
  "/universities/:universityId/clubs/:clubId/advisors",
  ...guard(ClubPermission.VIEW, { tenantScoped: true }),
  async (c) => {
    const { universityId, clubId } = c.req.param();
    const advisors = await clubsAdminService.listAdvisors(universityId, clubId);
    return ok(c, advisors, "admin.advisorsListed");
  }
);

// 10. KULÜBE DANIŞMAN DAVETİ (kabul edilene kadar danışman sayılmaz)
adminClubsRoutes.post(
  "/universities/:universityId/clubs/:clubId/advisors",
  ...guard(ClubPermission.ADVISOR_MANAGE, { tenantScoped: true }),
  validate("json", addAdvisorSchema),
  async (c) => {
    const user = c.get("user");
    const { universityId, clubId } = c.req.param();
    const body = c.req.valid("json");
    const invitation = await clubsAdminService.inviteAdvisor(universityId, clubId, user.userId, body);
    return created(c, invitation, "admin.advisorInvited");
  }
);

adminClubsRoutes.get(
  "/universities/:universityId/clubs/:clubId/advisor-invitations",
  ...guard(ClubPermission.ADVISOR_MANAGE, { tenantScoped: true }),
  async (c) => {
    const { universityId, clubId } = c.req.param();
    const invitations = await clubsAdminService.listAdvisorInvitations(universityId, clubId);
    return ok(c, invitations, "admin.advisorInvitationsListed");
  }
);

adminClubsRoutes.delete(
  "/universities/:universityId/clubs/:clubId/advisor-invitations/:invitationId",
  ...guard(ClubPermission.ADVISOR_MANAGE, { tenantScoped: true }),
  async (c) => {
    const user = c.get("user");
    const { universityId, clubId, invitationId } = c.req.param();
    await clubsAdminService.cancelAdvisorInvitation(universityId, clubId, invitationId, user.userId);
    return done(c, "admin.advisorInvitationCancelled");
  }
);

// 11. KULÜPTEN DANIŞMAN KALDIRMA (yönetici zorla)
adminClubsRoutes.delete(
  "/universities/:universityId/clubs/:clubId/advisors/:userId",
  ...guard(ClubPermission.ADVISOR_MANAGE, { tenantScoped: true }),
  async (c) => {
    const user = c.get("user");
    const { universityId, clubId, userId } = c.req.param();
    await clubsAdminService.removeAdvisor(universityId, clubId, userId, user.userId);
    return done(c, "admin.advisorRemoved");
  }
);

// 12. KULÜBÜ KALICI OLARAK SİLME
// Yıkıcı işlem: kulüp önce "archived" veya "rejected" durumda olmalı (bilinçli
// arşivleme adımı). Bağlı içerik (üyeler, danışmanlar, iletişim linkleri, duyuru,
// galeri) tek transaction'da temizlenir.
adminClubsRoutes.delete(
  "/universities/:universityId/clubs/:clubId",
  ...guard(ClubPermission.DELETE, { tenantScoped: true }),
  async (c) => {
    const { universityId, clubId } = c.req.param();
    await clubsAdminService.deleteClub(universityId, clubId);
    return done(c, "admin.clubDeleted");
  }
);

// ═══════════════════════════════════════════════
// TENANT MODERASYON — kulüp içeriğine üstten müdahale (bkz. docs/design/06 §A6)
// Kulüp-içi katman (officer/president/advisor) korunur; bunlar tenant yöneticisinin
// HERHANGİ bir kulüpte kullanabildiği override yetkileridir.
// ═══════════════════════════════════════════════

// 13. KULÜP ÜYELERİNİ LİSTELEME (moderasyon görünümü — bekleyenler dahil)
adminClubsRoutes.get(
  "/universities/:universityId/clubs/:clubId/members",
  ...guard(ClubPermission.VIEW, { tenantScoped: true }),
  async (c) => {
    const { universityId, clubId } = c.req.param();
    const members = await clubsAdminService.listClubMembers(universityId, clubId);
    return ok(c, members, "admin.membersListed");
  }
);

// 13B. KULÜP DUYURULARI (admin listesi — taslaklar dahil, keyset sayfalama)
adminClubsRoutes.get(
  "/universities/:universityId/clubs/:clubId/announcements",
  ...guard(ClubPermission.VIEW, { tenantScoped: true }),
  validate("query", adminClubPaginatedListQuerySchema),
  async (c) => {
    const { universityId, clubId } = c.req.param();
    const { limit, cursor } = c.req.valid("query");
    const result = await clubsAdminService.listClubAnnouncements(universityId, clubId, limit, cursor);
    return ok(c, result, "admin.announcementsListed");
  }
);

// 13C. KULÜP GALERİSİ (admin listesi, keyset sayfalama)
adminClubsRoutes.get(
  "/universities/:universityId/clubs/:clubId/gallery",
  ...guard(ClubPermission.VIEW, { tenantScoped: true }),
  validate("query", adminClubPaginatedListQuerySchema),
  async (c) => {
    const { universityId, clubId } = c.req.param();
    const { limit, cursor } = c.req.valid("query");
    const result = await clubsAdminService.listClubGallery(universityId, clubId, limit, cursor);
    return ok(c, result, "admin.galleryListed");
  }
);

// 13D. KULÜP ETKİNLİKLERİ (admin listesi — taslaklar dahil, keyset sayfalama)
adminClubsRoutes.get(
  "/universities/:universityId/clubs/:clubId/activities",
  ...guard(ClubPermission.VIEW, { tenantScoped: true }),
  validate("query", adminClubPaginatedListQuerySchema),
  async (c) => {
    const { universityId, clubId } = c.req.param();
    const { limit, cursor } = c.req.valid("query");
    const result = await clubsAdminService.listClubActivities(universityId, clubId, limit, cursor);
    return ok(c, result, "admin.activitiesListed");
  }
);

// 14. KULÜPTEN ÜYE ÇIKARMA (moderasyon override)
adminClubsRoutes.delete(
  "/universities/:universityId/clubs/:clubId/members/:userId",
  ...guard(ClubPermission.MEMBER_MANAGE, { tenantScoped: true }),
  async (c) => {
    const { universityId, clubId, userId } = c.req.param();
    await clubsAdminService.removeClubMember(universityId, clubId, userId);
    return done(c, "admin.memberRemoved");
  }
);

// 15. DUYURU MODERASYONU — herhangi bir kulübün duyurusunu kaldırma
adminClubsRoutes.delete(
  "/universities/:universityId/clubs/:clubId/announcements/:announcementId",
  ...guard(AnnouncementPermission.MODERATE, { tenantScoped: true }),
  async (c) => {
    const { universityId, clubId, announcementId } = c.req.param();
    await clubsAdminService.moderateRemoveAnnouncement(universityId, clubId, announcementId);
    return done(c, "admin.announcementRemoved");
  }
);

// 16. GALERİ MODERASYONU — herhangi bir kulübün görselini kaldırma
adminClubsRoutes.delete(
  "/universities/:universityId/clubs/:clubId/gallery/:imageId",
  ...guard(GalleryPermission.MODERATE, { tenantScoped: true }),
  async (c) => {
    const { universityId, clubId, imageId } = c.req.param();
    await clubsAdminService.moderateRemoveGalleryImage(universityId, clubId, imageId);
    return done(c, "admin.galleryImageRemoved");
  }
);
