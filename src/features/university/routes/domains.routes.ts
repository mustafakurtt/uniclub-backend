import { Hono } from "hono";
import { validate } from "../../../shared/utils/validate";
import { guard } from "../../../core/rbac/guard";
import { RbacVariables } from "../../../core/rbac/rbac.middleware";
import { ok, created, done } from "../../../shared/utils/respond";
import { UniversityPermission } from "../university.permissions";
import { addDomainSchema, updateDomainSchema } from "../university.schema";
import { universityService } from "../university.service";

/**
 * Üniversitenin e-posta domainleri (`:universityId/domains`). Kayıt akışı
 * tenant'ı bu domainlerden çözdüğü için, listeleme PUBLIC; yazma işlemleri
 * granüler university.domain.* izinleriyle ve tenantScoped korunur.
 *
 * try/catch yok — servisin fırlattığı HttpError'ları `app.onError` çevirir
 * (bkz. universities.routes.ts başındaki not).
 */
export const domainsRoutes = new Hono<{ Variables: RbacVariables }>();

// 1. DOMAINLERİ LİSTELEME (public)
domainsRoutes.get("/:universityId/domains", async (c) => {
  const { universityId } = c.req.param();
  const domains = await universityService.listDomains(universityId);
  return ok(c, domains, "domain.listed");
});

// 2. DOMAIN EKLEME
domainsRoutes.post(
  "/:universityId/domains",
  ...guard(UniversityPermission.DOMAIN_CREATE, { tenantScoped: true }),
  validate("json", addDomainSchema),
  async (c) => {
    const { universityId } = c.req.param();
    const body = c.req.valid("json");
    const domain = await universityService.addDomain(universityId, body);
    return created(c, domain, "domain.created");
  }
);

// 3. DOMAIN GÜNCELLEME
domainsRoutes.patch(
  "/:universityId/domains/:domainId",
  ...guard(UniversityPermission.DOMAIN_UPDATE, { tenantScoped: true }),
  validate("json", updateDomainSchema),
  async (c) => {
    const { universityId, domainId } = c.req.param();
    const body = c.req.valid("json");
    const domain = await universityService.updateDomain(universityId, domainId, body);
    return ok(c, domain, "domain.updated");
  }
);

// 4. DOMAIN SİLME (üniversitenin son domaini silinemez)
domainsRoutes.delete(
  "/:universityId/domains/:domainId",
  ...guard(UniversityPermission.DOMAIN_DELETE, { tenantScoped: true }),
  async (c) => {
    const { universityId, domainId } = c.req.param();
    await universityService.deleteDomain(universityId, domainId);
    return done(c, "domain.deleted");
  }
);
