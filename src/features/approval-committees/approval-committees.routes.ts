import { Hono } from "hono";
import { guard } from "../../core/rbac/guard";
import { RbacVariables } from "../../core/rbac/rbac.middleware";
import { validate } from "../../shared/utils/validate";
import { ok, created } from "../../shared/utils/respond";
import { ClubPermission } from "../clubs/clubs.permissions";
import { ApprovalCommitteePermission } from "./approval-committees.permissions";
import { approvalCommitteesService } from "./approval-committees.service";
import {
  createApprovalCommitteeSchema,
  updateApprovalCommitteeSchema,
} from "./approval-committees.schema";

export const approvalCommitteesRoutes = new Hono<{ Variables: RbacVariables }>();

approvalCommitteesRoutes.get(
  "/universities/:universityId/approval-committees",
  ...guard(ApprovalCommitteePermission.MANAGE, { tenantScoped: true }),
  async (c) => {
    const { universityId } = c.req.param();
    const committees = await approvalCommitteesService.list(universityId);
    return ok(c, committees, "approvalCommittee.listed");
  }
);

approvalCommitteesRoutes.get(
  "/universities/:universityId/approval-committees/:committeeId",
  ...guard(ClubPermission.APPLICATION_VIEW, { tenantScoped: true }),
  async (c) => {
    const { universityId, committeeId } = c.req.param();
    const committee = await approvalCommitteesService.getById(universityId, committeeId);
    return ok(c, committee, "approvalCommittee.found");
  }
);

approvalCommitteesRoutes.post(
  "/universities/:universityId/approval-committees",
  ...guard(ApprovalCommitteePermission.MANAGE, { tenantScoped: true }),
  validate("json", createApprovalCommitteeSchema),
  async (c) => {
    const { universityId } = c.req.param();
    const body = c.req.valid("json");
    const committee = await approvalCommitteesService.create(universityId, body);
    return created(c, committee, "approvalCommittee.created");
  }
);

approvalCommitteesRoutes.patch(
  "/universities/:universityId/approval-committees/:committeeId",
  ...guard(ApprovalCommitteePermission.MANAGE, { tenantScoped: true }),
  validate("json", updateApprovalCommitteeSchema),
  async (c) => {
    const { universityId, committeeId } = c.req.param();
    const body = c.req.valid("json");
    const committee = await approvalCommitteesService.update(universityId, committeeId, body);
    return ok(c, committee, "approvalCommittee.updated");
  }
);
