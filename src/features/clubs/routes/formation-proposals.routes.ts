import { Hono } from "hono";
import { authMiddleware } from "../../../core/auth/auth.middleware";
import { ClubVariables } from "../../../middlewares/club.middleware";
import { clubsService } from "../clubs.service";
import { requireTenant } from "../../../shared/utils/tenant.util";
import { ok, done } from "../../../shared/utils/respond";

/**
 * Kuruluş önerisi — dijital destek toplama (T1.1).
 * Tenant ayarı `club.formation.support_threshold` > 0 olduğunda aktif.
 */
export const formationProposalsRoutes = new Hono<{ Variables: ClubVariables }>();

formationProposalsRoutes.get("/formation-proposals", authMiddleware, async (c) => {
  const user = c.get("user");
  const proposals = await clubsService.listFormationProposals(requireTenant(user.universityId));
  return ok(c, proposals, "club.formationProposalsListed");
});

formationProposalsRoutes.get("/formation-proposals/:proposalId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { proposalId } = c.req.param();
  const proposal = await clubsService.getFormationProposal(
    requireTenant(user.universityId),
    proposalId,
    user.userId
  );
  return ok(c, proposal, "club.formationProposalFound");
});

formationProposalsRoutes.post("/formation-proposals/:proposalId/support", authMiddleware, async (c) => {
  const user = c.get("user");
  const { proposalId } = c.req.param();
  const result = await clubsService.supportFormationProposal(
    requireTenant(user.universityId),
    proposalId,
    user.userId
  );
  return ok(c, result, "club.formationSupportAdded");
});

formationProposalsRoutes.delete("/formation-proposals/:proposalId/support", authMiddleware, async (c) => {
  const user = c.get("user");
  const { proposalId } = c.req.param();
  const result = await clubsService.withdrawFormationSupport(proposalId, user.userId);
  return ok(c, result, "club.formationSupportWithdrawn");
});

formationProposalsRoutes.delete("/formation-proposals/:proposalId", authMiddleware, async (c) => {
  const user = c.get("user");
  const { proposalId } = c.req.param();
  await clubsService.withdrawFormationProposal(user.userId, proposalId);
  return done(c, "club.formationProposalWithdrawn");
});
