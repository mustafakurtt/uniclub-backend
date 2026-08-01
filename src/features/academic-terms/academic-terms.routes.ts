import { Hono } from "hono";
import { guard } from "../../core/rbac/guard";
import { RbacVariables } from "../../core/rbac/rbac.middleware";
import { validate } from "../../shared/utils/validate";
import { ok, created, done } from "../../shared/utils/respond";
import { AcademicTermPermission } from "./academic-terms.permissions";
import { academicTermsService } from "./academic-terms.service";
import { createAcademicTermSchema, updateAcademicTermSchema } from "./academic-terms.schema";

type RouteVariables = RbacVariables;

export const academicTermsRoutes = new Hono<{ Variables: RouteVariables }>();

academicTermsRoutes.get(
  "/:universityId/academic-terms",
  ...guard(AcademicTermPermission.MANAGE, { tenantScoped: true }),
  async (c) => {
    const { universityId } = c.req.param();
    const terms = await academicTermsService.list(universityId);
    return ok(c, terms, "academicTerm.listed");
  }
);

academicTermsRoutes.post(
  "/:universityId/academic-terms",
  ...guard(AcademicTermPermission.MANAGE, { tenantScoped: true }),
  validate("json", createAcademicTermSchema),
  async (c) => {
    const { universityId } = c.req.param();
    const body = c.req.valid("json");
    const term = await academicTermsService.create(universityId, body);
    return created(c, term, "academicTerm.created");
  }
);

academicTermsRoutes.patch(
  "/:universityId/academic-terms/:termId",
  ...guard(AcademicTermPermission.MANAGE, { tenantScoped: true }),
  validate("json", updateAcademicTermSchema),
  async (c) => {
    const { universityId, termId } = c.req.param();
    const body = c.req.valid("json");
    const term = await academicTermsService.update(universityId, termId, body);
    return ok(c, term, "academicTerm.updated");
  }
);

academicTermsRoutes.delete(
  "/:universityId/academic-terms/:termId",
  ...guard(AcademicTermPermission.MANAGE, { tenantScoped: true }),
  async (c) => {
    const { universityId, termId } = c.req.param();
    await academicTermsService.delete(universityId, termId);
    return done(c, "academicTerm.deleted");
  }
);
