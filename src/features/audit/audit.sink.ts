import { setGuardAuditSink } from "../../core/rbac/audit-hook";
import { clientIp } from "../../middlewares/rate-limit.middleware";
import { auditService } from "./audit.service";

/**
 * guard() denetim kancasının BU PROJEYE ÖZGÜ implementasyonu.
 * core/rbac/audit-hook.ts mekanizmayı tanımlar; alanların nasıl türetileceğini
 * (tenant, hedef kaynak, maskeleme) yalnızca burası bilir.
 * index.ts açılışta `registerAuditSink()` çağırır.
 */

/** Değeri asla loglanmaması gereken body alanları (şifreler, tokenlar). */
const SENSITIVE_KEY = /password|sifre|token|secret/i;

/** Body'nin üst seviye hassas alanlarını maskeler (iç içe yapılar olduğu gibi kalır —
 *  bu projede hassas alanlar hep üst seviyededir, bkz. *.schema.ts dosyaları). */
function redactBody(body: unknown): unknown {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return body;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEY.test(key) ? "[GİZLENDİ]" : value;
  }
  return result;
}

/**
 * Path parametresi adı → hedef kaynak tipi. SIRA ÖNEMLİ: en spesifik önce —
 * /clubs/:clubId/members/:userId rotasında hedef kulüp değil, dokunulan ÜYEDİR.
 * (:universityId hedef sayılmaz: o kapsamdır, universityId kolonuna zaten yazılır.)
 */
const TARGET_PARAMS: readonly [param: string, type: string][] = [
  ["applicationId", "club_application"],
  ["announcementId", "announcement"],
  ["imageId", "gallery_image"],
  ["userId", "user"],
  ["roleId", "role"],
  ["permissionId", "permission"],
  ["domainId", "university_domain"],
  ["departmentId", "department"],
  ["facultyId", "faculty"],
  ["clubId", "club"],
];

export function registerAuditSink() {
  setGuardAuditSink(async (c, permissionKey) => {
    const user = c.get("user");
    const params = c.req.param() as Record<string, string>;

    // Hono, json body'yi ilk okumada cache'ler: handler zaten parse ettiyse
    // cache'ten gelir; hiç body yoksa/JSON değilse parse hatası yutulur.
    let body: unknown = null;
    try {
      body = await c.req.json();
    } catch {
      /* gövdesiz istek (örn. DELETE) ya da JSON olmayan gövde */
    }

    const target = TARGET_PARAMS.find(([param]) => params[param]);

    await auditService.record({
      actorId: user.userId,
      // Tenant rotalarında path'teki üniversite; değilse aktörün kendi tenant'ı;
      // o da yoksa (tenant'sız platform hesabı) platform seviyesi işlem → null.
      universityId: params.universityId ?? user.universityId ?? null,
      action: permissionKey,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      targetType: target?.[1] ?? null,
      targetId: target ? params[target[0]] : null,
      metadata: {
        params,
        ...(body !== null ? { body: redactBody(body) } : {}),
      },
      ip: clientIp(c),
    });
  });
}
