import { Hono } from "hono";
import { guard } from "../../../core/rbac/guard";
import { RbacVariables } from "../../../core/rbac/rbac.middleware";
import { validate } from "../../../shared/utils/validate";
import { ok } from "../../../shared/utils/respond";
import { ClubPermission } from "../clubs.permissions";
import { listFormationProposalsQuerySchema } from "../clubs-admin.schema";
import { clubsService } from "../clubs.service";

export const adminFormationProposalsRoutes = new Hono<{ Variables: RbacVariables }>();

// 6f. KURULUŞ ÖNERİLERİ (destek toplama aşaması)
adminFormationProposalsRoutes.get(
  "/universities/:universityId/formation-proposals",
  ...guard(ClubPermission.APPLICATION_VIEW, { tenantScoped: true }),
  validate("query", listFormationProposalsQuerySchema),
  async (c) => {
    const { universityId } = c.req.param();
    const { status } = c.req.valid("query");
    const proposals = await clubsService.listFormationProposalsForAdmin(universityId, status);
    return ok(c, proposals, "admin.formationProposalsListed");
  }
);

adminFormationProposalsRoutes.get(
  "/universities/:universityId/formation-proposals/:proposalId",
  ...guard(ClubPermission.APPLICATION_VIEW, { tenantScoped: true }),
  async (c) => {
    const { universityId, proposalId } = c.req.param();
    const proposal = await clubsService.getFormationProposalForAdmin(universityId, proposalId);
    return ok(c, proposal, "admin.formationProposalFound");
  }
);
