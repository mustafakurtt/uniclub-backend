import { Hono } from "hono";
import { authMiddleware } from "../../core/auth/auth.middleware";
import { guard } from "../../core/rbac/guard";
import { attachAuthz, RbacVariables } from "../../core/rbac/rbac.middleware";
import { hasTenantScopeBypass } from "../../core/rbac/tenant-scope";
import { validate } from "../../shared/utils/validate";
import { ok } from "../../shared/utils/respond";
import { DashboardPermission } from "../dashboard/dashboard.permissions";
import { dashboardService } from "../dashboard/dashboard.service";
import { AuditPermission } from "../audit/audit.permissions";
import { auditInspectionService } from "../audit/audit-inspection.service";
import {
  auditPeriodQuerySchema,
  auditDecisionListQuerySchema,
} from "../audit/audit-inspection.schema";
import { adminDashboardService } from "./admin-dashboard.service";

export const adminDashboardRoutes = new Hono<{ Variables: RbacVariables }>();

// 0. KAPSAMIM: yönetim bağlamında erişebildiğim üniversiteler.
// Bilinçli olarak permission guard'ı YOK — bu bir "kapsamım ne?" sorgusudur ve
// cevabı zaten aktörün kendi kapsamıyla sınırlıdır (öğrenci → kendi okulu).
// Panel, global public `GET /api/universities` yerine bunu kullanmalıdır.
adminDashboardRoutes.get("/universities", authMiddleware, attachAuthz, async (c) => {
  const user = c.get("user");
  const authz = c.get("authz");
  const universities = await adminDashboardService.listAccessibleUniversities({
    universityId: user.universityId,
    isPlatformScoped: hasTenantScopeBypass(authz),
  });
  return ok(c, universities, "admin.accessibleUniversitiesListed");
});

// 0B. TENANT PANEL ÖZETİ (salt-okunur → user.view, tenantScoped)
// Kulüp/kullanıcı durum dağılımları + bekleyen başvuru + yaklaşan etkinlik sayaçları.
adminDashboardRoutes.get(
  "/universities/:universityId/dashboard",
  ...guard(DashboardPermission.VIEW, { tenantScoped: true }),
  async (c) => {
    const { universityId } = c.req.param();
    const summary = await dashboardService.getAdminDashboard(universityId);
    return ok(c, summary, "dashboard.adminLoaded");
  }
);

// 0C. DENETİM / Teftiş görünümü (T4.4) — kurum faaliyet özeti + karar odaklı akış
adminDashboardRoutes.get(
  "/universities/:universityId/audit/summary",
  ...guard(AuditPermission.VIEW, { tenantScoped: true }),
  validate("query", auditPeriodQuerySchema),
  async (c) => {
    const { universityId } = c.req.param();
    const query = c.req.valid("query");
    const summary = await auditInspectionService.getSummary(universityId, query);
    return ok(c, summary, "audit.summaryLoaded");
  }
);

adminDashboardRoutes.get(
  "/universities/:universityId/audit/decisions",
  ...guard(AuditPermission.VIEW, { tenantScoped: true }),
  validate("query", auditDecisionListQuerySchema),
  async (c) => {
    const { universityId } = c.req.param();
    const query = c.req.valid("query");
    const result = await auditInspectionService.listDecisions(universityId, query);
    return ok(c, result, "audit.decisionsListed");
  }
);
