import { Hono } from "hono";
import { guard } from "../../../core/rbac/guard";
import { RbacVariables } from "../../../core/rbac/rbac.middleware";
import { validate } from "../../../shared/utils/validate";
import { ok } from "../../../shared/utils/respond";
import { ClubPermission } from "../clubs.permissions";
import {
  listClubApplicationsQuerySchema,
  approveApplicationSchema,
  rejectApplicationSchema,
  requestRevisionApplicationSchema,
  patchChecklistItemSchema,
  reviewAppealSchema,
  committeeVoteSchema,
} from "../club-application-review.schema";
import { clubApplicationReviewService } from "../club-application-review.service";
import {
  committeeApplicationGuard,
  committeeTenantGuard,
} from "../../../middlewares/committee-application.middleware";

export const adminClubApplicationsRoutes = new Hono<{ Variables: RbacVariables }>();

// 4. KULÜP BAŞVURULARINI LİSTELEME (salt-okunur → application.view)
adminClubApplicationsRoutes.get(
  "/universities/:universityId/club-applications",
  ...guard(ClubPermission.APPLICATION_VIEW, { tenantScoped: true }),
  validate("query", listClubApplicationsQuerySchema),
  async (c) => {
    const { universityId } = c.req.param();
    const { status } = c.req.valid("query");
    const applications = await clubApplicationReviewService.listClubApplications(universityId, status);
    return ok(c, applications, "admin.applicationsListed");
  }
);

// 4A. OYUMU BEKLEYEN KURUL BAŞVURULARI (kurul üyeliği tabanlı — application.view gerekmez)
adminClubApplicationsRoutes.get(
  "/universities/:universityId/club-applications/my-committee-pending",
  ...committeeTenantGuard("club.application.committee_pending_list"),
  async (c) => {
    const { universityId } = c.req.param();
    const actor = c.get("user");
    const applications = await clubApplicationReviewService.listMyCommitteePendingApplications(
      universityId,
      actor.userId
    );
    return ok(c, applications, "admin.myCommitteePendingApplicationsListed");
  }
);

// 4B. TEK BİR KULÜP BAŞVURUSU (detay — applicant + onay zinciri + revizyon sayacı)
adminClubApplicationsRoutes.get(
  "/universities/:universityId/club-applications/:applicationId",
  ...committeeApplicationGuard(ClubPermission.APPLICATION_VIEW),
  async (c) => {
    const { universityId, applicationId } = c.req.param();
    const actor = c.get("user");
    const application = await clubApplicationReviewService.getClubApplication(
      universityId,
      applicationId,
      actor.userId
    );
    return ok(c, application, "admin.applicationFound");
  }
);

// 5. KULÜP BAŞVURUSUNU ONAYLAMA (gerçek bir kulüp oluşturur)
adminClubApplicationsRoutes.patch(
  "/universities/:universityId/club-applications/:applicationId/approve",
  ...guard(ClubPermission.APPLICATION_VIEW, { tenantScoped: true }),
  validate("json", approveApplicationSchema),
  async (c) => {
    const { universityId, applicationId } = c.req.param();
    const actor = c.get("user");
    const { note } = c.req.valid("json");
    const result = await clubApplicationReviewService.approveClubApplication(
      universityId,
      applicationId,
      actor.userId,
      note
    );
    return ok(c, result, "admin.applicationApproved");
  }
);

// 6. KULÜP BAŞVURUSUNU REDDETME (gerekçe zorunlu)
adminClubApplicationsRoutes.patch(
  "/universities/:universityId/club-applications/:applicationId/reject",
  ...guard(ClubPermission.APPLICATION_VIEW, { tenantScoped: true }),
  validate("json", rejectApplicationSchema),
  async (c) => {
    const { universityId, applicationId } = c.req.param();
    const actor = c.get("user");
    const { note } = c.req.valid("json");
    const result = await clubApplicationReviewService.rejectClubApplication(
      universityId,
      applicationId,
      actor.userId,
      note
    );
    return ok(c, result, "admin.applicationRejected");
  }
);

// 6b. REVİZYON TALEBİ (gerekçe zorunlu — öğrenci düzeltip yeniden gönderir)
adminClubApplicationsRoutes.patch(
  "/universities/:universityId/club-applications/:applicationId/request-revision",
  ...guard(ClubPermission.APPLICATION_VIEW, { tenantScoped: true }),
  validate("json", requestRevisionApplicationSchema),
  async (c) => {
    const { universityId, applicationId } = c.req.param();
    const actor = c.get("user");
    const { note } = c.req.valid("json");
    const result = await clubApplicationReviewService.requestClubApplicationRevision(
      universityId,
      applicationId,
      actor.userId,
      note
    );
    return ok(c, result, "admin.applicationRevisionRequested");
  }
);

// 6b2. KURUL OY (committee_majority kademesi)
adminClubApplicationsRoutes.patch(
  "/universities/:universityId/club-applications/:applicationId/committee-vote",
  ...committeeApplicationGuard(ClubPermission.APPLICATION_VIEW),
  validate("json", committeeVoteSchema),
  async (c) => {
    const { universityId, applicationId } = c.req.param();
    const actor = c.get("user");
    const body = c.req.valid("json");
    const result = await clubApplicationReviewService.castCommitteeVote(
      universityId,
      applicationId,
      actor.userId,
      body
    );
    return ok(c, result, "admin.committeeVoteRecorded");
  }
);

// 6c. BAŞVURU GEÇMİŞİ (olay günlüğü)
adminClubApplicationsRoutes.get(
  "/universities/:universityId/club-applications/:applicationId/history",
  ...guard(ClubPermission.APPLICATION_VIEW, { tenantScoped: true }),
  async (c) => {
    const { universityId, applicationId } = c.req.param();
    const history = await clubApplicationReviewService.getClubApplicationHistory(
      universityId,
      applicationId
    );
    return ok(c, history, "admin.applicationHistoryListed");
  }
);

// 6d. İNCELEME KONTROL LİSTESİ
adminClubApplicationsRoutes.get(
  "/universities/:universityId/club-applications/:applicationId/checklist",
  ...guard(ClubPermission.APPLICATION_VIEW, { tenantScoped: true }),
  async (c) => {
    const { universityId, applicationId } = c.req.param();
    const checklist = await clubApplicationReviewService.getChecklist(universityId, applicationId);
    return ok(c, checklist, "admin.checklistFound");
  }
);

adminClubApplicationsRoutes.patch(
  "/universities/:universityId/club-applications/:applicationId/checklist/:itemKey",
  ...guard(ClubPermission.APPLICATION_VIEW, { tenantScoped: true }),
  validate("json", patchChecklistItemSchema),
  async (c) => {
    const { universityId, applicationId, itemKey } = c.req.param();
    const actor = c.get("user");
    const { checked, note } = c.req.valid("json");
    const checklist = await clubApplicationReviewService.updateChecklistItem(
      universityId,
      applicationId,
      itemKey,
      actor.userId,
      checked,
      note
    );
    return ok(c, checklist, "admin.checklistUpdated");
  }
);

// 6e. İTİRAZ İNCELEMESİ
adminClubApplicationsRoutes.patch(
  "/universities/:universityId/club-applications/:applicationId/appeal/review",
  ...guard(ClubPermission.APPLICATION_VIEW, { tenantScoped: true }),
  validate("json", reviewAppealSchema),
  async (c) => {
    const { universityId, applicationId } = c.req.param();
    const actor = c.get("user");
    const { decision, note } = c.req.valid("json");
    const result = await clubApplicationReviewService.reviewAppeal(
      universityId,
      applicationId,
      actor.userId,
      decision,
      note
    );
    return ok(c, result, "admin.appealReviewed");
  }
);
