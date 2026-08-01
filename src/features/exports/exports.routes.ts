import { Hono } from "hono";
import { guard } from "../../core/rbac/guard";
import { RbacVariables } from "../../core/rbac/rbac.middleware";
import { ok } from "../../shared/utils/respond";
import { ExportPermission } from "./exports.permissions";
import { exportsService } from "./exports.service";

export const exportsRoutes = new Hono<{ Variables: RbacVariables }>();

exportsRoutes.get(
  "/:universityId/exports",
  ...guard(ExportPermission.GENERATE, { tenantScoped: true }),
  async (c) => {
    const catalog = exportsService.listCatalog();
    return ok(c, catalog, "exports.catalogListed");
  }
);

exportsRoutes.post(
  "/:universityId/exports/:reportId",
  ...guard(ExportPermission.GENERATE, { tenantScoped: true }),
  async (c) => {
    const { universityId, reportId } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const result = await exportsService.generateReport(universityId, reportId, body);

    c.header("Content-Type", result.contentType);
    c.header("Content-Disposition", `attachment; filename="${result.filename}"`);
    if (result.usedFallback) {
      c.header("X-Export-Fallback", "csv");
      if (result.fallbackReason) {
        c.header("X-Export-Fallback-Reason", result.fallbackReason.slice(0, 200));
      }
    }

    return c.body(result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength) as ArrayBuffer);
  }
);
