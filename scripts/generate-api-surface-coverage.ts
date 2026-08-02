#!/usr/bin/env bun
/**
 * api.md kataloğundaki uçları yüzey eşlemesiyle birleştirip
 * docs/reference/api-surface-coverage.md üretir.
 * Ölçüm kaynağı: uniclub-frontend (2026-08-02).
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const API_MD = join(ROOT, "docs/reference/api.md");
const OUT = join(ROOT, "docs/reference/api-surface-coverage.md");

type Row = { method: string; path: string };

function extractFromApiMd(md: string): Row[] {
  const rows: Row[] = [];
  const re =
    /\| (GET|POST|PATCH|PUT|DELETE)(?:\|(GET|POST|PATCH|PUT|DELETE))? \| `([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const methods = [m[1]];
    if (m[2]) methods.push(m[2]);
    let path = m[3].split("?")[0].trim();
    if (path.startsWith(".../")) continue;
    if (!path.startsWith("/api/") && path !== "/uploads/:key") continue;
    for (const method of methods) rows.push({ method, path });
  }
  if (md.includes("GET /health")) rows.push({ method: "GET", path: "/health" });
  return rows;
}

/** api.md'de `.../` ile kısaltılan etkinlik alt uçları. */
const ACTIVITY_CLUB_PREFIX = "/api/clubs/:clubId/activities/:activityId";
const activityExtras: Row[] = [
  { method: "POST", path: `${ACTIVITY_CLUB_PREFIX}/publish` },
  { method: "POST", path: `${ACTIVITY_CLUB_PREFIX}/cancel` },
  { method: "GET", path: `${ACTIVITY_CLUB_PREFIX}/attendees` },
  { method: "POST", path: `${ACTIVITY_CLUB_PREFIX}/attendees/:userId/check-in` },
  { method: "DELETE", path: `${ACTIVITY_CLUB_PREFIX}/attendees/:userId/check-in` },
  { method: "GET", path: `${ACTIVITY_CLUB_PREFIX}/check-in-qr` },
  { method: "GET", path: `${ACTIVITY_CLUB_PREFIX}/co-hosts` },
  { method: "POST", path: `${ACTIVITY_CLUB_PREFIX}/co-hosts` },
  { method: "DELETE", path: `${ACTIVITY_CLUB_PREFIX}/co-hosts/:coClubId` },
  { method: "POST", path: `${ACTIVITY_CLUB_PREFIX}/co-host/accept` },
  { method: "DELETE", path: `${ACTIVITY_CLUB_PREFIX}/co-host` },
];

const posterExtras: Row[] = [
  { method: "GET", path: "/api/clubs/:clubId/poster-qr" },
  { method: "POST", path: "/api/clubs/:clubId/poster-qr" },
  { method: "GET", path: "/api/universities/:universityId/poster-qr" },
  { method: "POST", path: "/api/universities/:universityId/poster-qr" },
];

function dedupe(rows: Row[]): Row[] {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const r of rows) {
    const k = `${r.method} ${r.path}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

/** Yüzey eşlemesi — frontend apiClient çağrıları + App.tsx rotaları. */
const SURFACES: Record<string, string> = {
  "GET /health": "(dahili) — izleme / docker healthcheck; arayüz çağırmıyor",

  "POST /api/auth/register": "/register",
  "POST /api/auth/login": "/login",
  "GET /api/auth/verify": "/verify",
  "POST /api/auth/accept-tenant-admin-invitation": "—",
  "GET /api/auth/me": "(dahili) — ProtectedRoute / AuthContext oturum doğrulama",
  "PATCH /api/auth/users/:userId/promote-admin": "/admin/users/:userId",
  "PATCH /api/auth/users/:userId/demote-admin": "/admin/users/:userId",
  "PATCH /api/auth/users/:userId/promote-super-admin": "/admin/users/:userId",
  "PATCH /api/auth/users/:userId/demote-super-admin": "/admin/users/:userId",
  "POST /api/auth/permissions": "/admin/permissions",
  "GET /api/auth/permissions": "/admin/permissions",
  "PATCH /api/auth/permissions/:permissionId": "/admin/permissions",
  "POST /api/auth/roles": "/admin/roles",
  "GET /api/auth/roles": "/admin/roles",
  "PATCH /api/auth/roles/:roleId": "/admin/roles",
  "POST /api/auth/roles/:roleId/permissions": "/admin/roles",
  "DELETE /api/auth/roles/:roleId/permissions/:permissionId": "/admin/roles",

  "GET /api/users/me": "(dahili) — AuthContext; ayrıca /profile",
  "GET /api/users/me/permissions": "(dahili) — AuthContext yetki önbelleği",
  "PATCH /api/users/me": "/profile",
  "PATCH /api/users/me/password": "/profile",
  "GET /api/users/me/clubs": "/clubs, /dashboard, /clubs/:clubId",
  "GET /api/users/me/applications": "/dashboard, /clubs/new",
  "GET /api/users/me/advised-clubs": "/dashboard",
  "GET /api/users/me/activities": "—",
  "GET /api/users/me/dashboard": "—",
  "GET /api/users/me/notification-preferences": "—",
  "PUT /api/users/me/notification-preferences": "—",

  "GET /api/universities": "—",
  "GET /api/universities/:universityId": "/admin/universities/:universityId",
  "POST /api/universities": "/admin/universities",
  "PATCH /api/universities/:universityId": "/admin/universities/:universityId",
  "DELETE /api/universities/:universityId": "/admin/universities",
  "GET /api/universities/:universityId/domains": "/admin/universities/:universityId",
  "POST /api/universities/:universityId/domains": "/admin/universities/:universityId",
  "PATCH /api/universities/:universityId/domains/:domainId": "/admin/universities/:universityId",
  "DELETE /api/universities/:universityId/domains/:domainId": "/admin/universities/:universityId",
  "GET /api/universities/:universityId/faculties": "/admin/universities/:universityId",
  "GET /api/universities/:universityId/faculties/:facultyId": "—",
  "POST /api/universities/:universityId/faculties": "/admin/universities/:universityId",
  "PATCH /api/universities/:universityId/faculties/:facultyId": "/admin/universities/:universityId",
  "DELETE /api/universities/:universityId/faculties/:facultyId": "/admin/universities/:universityId",
  "GET /api/universities/:universityId/announcements": "—",
  "POST /api/universities/:universityId/announcements": "—",
  "POST /api/universities/:universityId/announcements/:id/publish": "—",
  "PATCH /api/universities/:universityId/announcements/:id": "—",
  "DELETE /api/universities/:universityId/announcements/:id": "—",
  "GET /api/universities/:universityId/settings": "/admin/settings",
  "PATCH /api/universities/:universityId/settings": "/admin/settings",
  "GET /api/universities/:universityId/academic-terms": "/admin/academic-terms",
  "POST /api/universities/:universityId/academic-terms": "/admin/academic-terms",
  "PATCH /api/universities/:universityId/academic-terms/:termId": "/admin/academic-terms",
  "DELETE /api/universities/:universityId/academic-terms/:termId": "/admin/academic-terms",
  "GET /api/universities/:universityId/faculties/:facultyId/departments": "/admin/universities/:universityId",
  "GET /api/universities/:universityId/faculties/:facultyId/departments/:departmentId": "—",
  "POST /api/universities/:universityId/faculties/:facultyId/departments": "/admin/universities/:universityId",
  "PATCH /api/universities/:universityId/faculties/:facultyId/departments/:departmentId":
    "/admin/universities/:universityId",
  "DELETE /api/universities/:universityId/faculties/:facultyId/departments/:departmentId":
    "/admin/universities/:universityId",
  "GET /api/universities/:universityId/exports": "/admin/exports",
  "POST /api/universities/:universityId/exports/:reportId": "/admin/exports",
  "GET /api/universities/:universityId/poster-qr": "/admin/universities/:universityId",
  "POST /api/universities/:universityId/poster-qr": "/admin/universities/:universityId",
  "PATCH /api/universities/:universityId/poster-qr/:qrId": "/admin/universities/:universityId",
  "POST /api/universities/:universityId/poster-qr/:qrId/cancel": "/admin/universities/:universityId",
  "GET /api/universities/:universityId/poster-qr/analytics": "/admin/universities/:universityId",
  "GET /api/universities/:universityId/poster-qr/:qrId/analytics": "/admin/universities/:universityId",

  "GET /api/clubs": "/clubs",
  "GET /api/clubs/:clubId": "/clubs/:clubId",
  "GET /api/clubs/:clubId/members": "/clubs/:clubId",
  "POST /api/clubs/:clubId/join": "/clubs/:clubId",
  "DELETE /api/clubs/:clubId/leave": "/clubs/:clubId",
  "POST /api/clubs/applications": "/clubs/new",
  "GET /api/clubs/applications/:applicationId": "/applications/:applicationId",
  "GET /api/clubs/applications/:applicationId/history": "/applications/:applicationId",
  "PATCH /api/clubs/applications/:applicationId/resubmit": "/applications/:applicationId",
  "DELETE /api/clubs/applications/:applicationId": "/applications/:applicationId",
  "GET /api/clubs/formation-proposals": "/clubs/proposals, /dashboard",
  "GET /api/clubs/formation-proposals/:id": "/clubs/proposals/:proposalId",
  "POST /api/clubs/formation-proposals/:id/support": "/clubs/proposals, /clubs/proposals/:proposalId",
  "DELETE /api/clubs/formation-proposals/:id/support": "/clubs/proposals, /clubs/proposals/:proposalId",
  "DELETE /api/clubs/formation-proposals/:id": "/clubs/proposals/:proposalId",
  "GET /api/clubs/:clubId/join-requests": "/clubs/:clubId",
  "PATCH /api/clubs/:clubId/join-requests/:userId": "/clubs/:clubId",
  "DELETE /api/clubs/:clubId/members/:userId": "/clubs/:clubId",
  "PATCH /api/clubs/:clubId/members/:userId/role": "/clubs/:clubId",
  "POST /api/clubs/:clubId/transfer-presidency": "/clubs/:clubId",
  "GET /api/clubs/:clubId/membership-history": "/admin/clubs/:clubId",
  "GET /api/clubs/:clubId/current-board": "—",
  "GET /api/clubs/:clubId/general-meetings": "/clubs/:clubId",
  "GET /api/clubs/:clubId/general-meetings/:meetingId": "/clubs/:clubId",
  "POST /api/clubs/:clubId/general-meetings": "/clubs/:clubId",
  "GET /api/clubs/:clubId/handover-records": "—",
  "GET /api/clubs/:clubId/handover-records/:handoverId": "—",
  "POST /api/clubs/:clubId/handover-records": "—",
  "PATCH /api/clubs/:clubId": "/clubs/:clubId",
  "POST /api/clubs/:clubId/contact-links": "/clubs/:clubId",
  "PATCH /api/clubs/:clubId/contact-links/:linkId": "/clubs/:clubId",
  "DELETE /api/clubs/:clubId/contact-links/:linkId": "/clubs/:clubId",
  "GET /api/clubs/:clubId/announcements": "/clubs/:clubId",
  "POST /api/clubs/:clubId/announcements": "/clubs/:clubId",
  "POST /api/clubs/:clubId/announcements/:announcementId/publish": "/clubs/:clubId",
  "PATCH /api/clubs/:clubId/announcements/:announcementId": "/clubs/:clubId",
  "DELETE /api/clubs/:clubId/announcements/:announcementId": "/clubs/:clubId",
  "GET /api/clubs/:clubId/gallery": "/clubs/:clubId",
  "POST /api/clubs/:clubId/gallery": "/clubs/:clubId",
  "DELETE /api/clubs/:clubId/gallery/:imageId": "/clubs/:clubId",
  "GET /api/clubs/:clubId/poster-qr": "/clubs/:clubId",
  "POST /api/clubs/:clubId/poster-qr": "/clubs/:clubId",
  "PATCH /api/clubs/:clubId/poster-qr/:qrId": "/clubs/:clubId",
  "POST /api/clubs/:clubId/poster-qr/:qrId/cancel": "/clubs/:clubId",
  "GET /api/clubs/:clubId/poster-qr/analytics": "/clubs/:clubId",
  "GET /api/clubs/:clubId/poster-qr/:qrId/analytics": "/clubs/:clubId",

  "GET /api/admin/universities/:universityId/users": "/admin/users",
  "GET /api/admin/universities/:universityId/users/:userId": "/admin/users/:userId",
  "GET /api/admin/universities/:universityId/users/:userId/effective-permissions": "/admin/users/:userId",
  "PATCH /api/admin/universities/:universityId/users/:userId/department": "/admin/users/:userId",
  "GET /api/admin/universities/:universityId/audit/summary": "—",
  "GET /api/admin/universities/:universityId/audit/decisions": "—",
  "GET /api/admin/universities/:universityId/club-applications": "/admin/clubs",
  "GET /api/admin/universities/:universityId/club-applications/my-committee-pending": "/admin/committee-tasks",
  "GET /api/admin/universities/:universityId/club-applications/:applicationId": "/admin/applications/:applicationId",
  "PATCH /api/admin/universities/:universityId/club-applications/:applicationId/approve":
    "/admin/applications/:applicationId",
  "PATCH /api/admin/universities/:universityId/club-applications/:applicationId/reject":
    "/admin/applications/:applicationId",
  "PATCH /api/admin/universities/:universityId/club-applications/:applicationId/request-revision":
    "/admin/applications/:applicationId",
  "PATCH /api/admin/universities/:universityId/club-applications/:applicationId/committee-vote":
    "/admin/applications/:applicationId, /admin/committee-tasks",
  "GET /api/admin/universities/:universityId/club-applications/:applicationId/history":
    "/admin/applications/:applicationId",
  "GET /api/admin/universities/:universityId/club-applications/:applicationId/checklist":
    "/admin/applications/:applicationId",
  "PATCH /api/admin/universities/:universityId/club-applications/:applicationId/checklist/:itemKey":
    "/admin/applications/:applicationId",
  "PATCH /api/admin/universities/:universityId/club-applications/:applicationId/appeal/review":
    "/admin/applications/:applicationId",
  "GET /api/admin/universities/:universityId/formation-proposals": "/admin/clubs",
  "GET /api/admin/universities/:universityId/formation-proposals/:id": "/admin/proposals/:proposalId",
  "GET /api/admin/universities/:universityId/approval-committees": "/admin/approval-committees",
  "GET /api/admin/universities/:universityId/approval-committees/:committeeId": "/admin/approval-committees",
  "POST /api/admin/universities/:universityId/approval-committees": "/admin/approval-committees",
  "PATCH /api/admin/universities/:universityId/approval-committees/:committeeId": "/admin/approval-committees",
  "GET /api/admin/universities/:universityId/clubs": "/admin/clubs",
  "GET /api/admin/universities/:universityId/clubs/:clubId": "/admin/clubs/:clubId",
  "PATCH /api/admin/universities/:universityId/clubs/:clubId/status": "/admin/clubs/:clubId",
  "PATCH /api/admin/universities/:universityId/clubs/:clubId": "/admin/clubs/:clubId",
  "DELETE /api/admin/universities/:universityId/clubs/:clubId": "/admin/clubs/:clubId",
  "GET /api/admin/universities/:universityId/clubs/:clubId/advisors": "/admin/clubs/:clubId",
  "POST /api/admin/universities/:universityId/clubs/:clubId/advisors": "/admin/clubs/:clubId",
  "GET /api/admin/universities/:universityId/clubs/:clubId/advisor-invitations": "/admin/clubs/:clubId",
  "DELETE /api/admin/universities/:universityId/clubs/:clubId/advisor-invitations/:invitationId":
    "/admin/clubs/:clubId",
  "DELETE /api/admin/universities/:universityId/clubs/:clubId/advisors/:userId": "/admin/clubs/:clubId",
  "POST /api/admin/universities/:uid/activities/:activityId/cancel": "—",
  "PATCH /api/admin/universities/:uid/clubs/:clubId/activities/:activityId": "—",
  "GET /api/admin/universities/:universityId/dashboard": "—",

  "GET /api/platform/tenants": "—",
  "POST /api/platform/tenants/onboard": "—",
  "GET /api/platform/tenants/:universityId/invitations": "—",
  "POST /api/platform/tenants/:universityId/invite-admin": "—",
  "POST /api/platform/tenants/:universityId/invitations/:invitationId/cancel": "—",
  "PATCH /api/platform/tenants/:universityId/status": "—",
  "GET /api/platform/users": "—",
  "POST /api/platform/users": "—",

  "POST /api/moderation/universities/:universityId/users/:userId/ban": "—",
  "POST /api/moderation/universities/:universityId/users/:userId/unban": "—",
  "POST /api/moderation/universities/:universityId/users/:userId/reset-password": "—",
  "GET /api/moderation/universities/:universityId/users/:userId/activity": "—",
  "GET /api/moderation/universities/:universityId/users/:userId/moderation-history": "—",

  "POST /api/notifications/ws-ticket": "(dahili) — NotificationsProvider WebSocket bileti",
  "GET /api/notifications/ws": "(dahili) — WebSocket upgrade (ticket ile)",
  "GET /api/notifications": "(dahili) — bildirim paneli / zil rozeti",
  "GET /api/notifications/unread-count": "(dahili) — bildirim zil rozeti",
  "PATCH /api/notifications/:notificationId/read": "(dahili) — bildirim paneli",
  "PATCH /api/notifications/read-all": "(dahili) — bildirim paneli",
  "GET /api/notifications/push-key": "—",
  "POST /api/notifications/push-subscribe": "—",
  "DELETE /api/notifications/push-subscribe": "—",

  "GET /api/audit/universities/:universityId": "/admin/audit",

  "GET /api/activities": "/activities",
  "GET /api/activities/:activityId": "/activities/:activityId",
  "POST /api/activities/:activityId/rsvp": "/activities/:activityId",
  "DELETE /api/activities/:activityId/rsvp": "/activities/:activityId",
  "POST /api/activities/:activityId/check-in": "/activities/:activityId/yoklama",
  "GET /api/clubs/:clubId/activities": "/clubs/:clubId, /activities/:activityId",
  "POST /api/clubs/:clubId/activities": "/clubs/:clubId",
  "PATCH /api/clubs/:clubId/activities/:activityId": "/clubs/:clubId",
  "POST /api/clubs/:clubId/activities/:activityId/publish": "/clubs/:clubId",
  "POST /api/clubs/:clubId/activities/:activityId/cancel": "/clubs/:clubId",
  "GET /api/clubs/:clubId/activities/:activityId/attendees": "/clubs/:clubId",
  "POST /api/clubs/:clubId/activities/:activityId/attendees/:userId/check-in": "—",
  "DELETE /api/clubs/:clubId/activities/:activityId/attendees/:userId/check-in": "—",
  "GET /api/clubs/:clubId/activities/:activityId/check-in-qr":
    "/clubs/:clubId/activities/:activityId/yoklama-qr",
  "GET /api/clubs/:clubId/activities/:activityId/co-hosts": "/clubs/:clubId",
  "POST /api/clubs/:clubId/activities/:activityId/co-hosts": "/clubs/:clubId",
  "DELETE /api/clubs/:clubId/activities/:activityId/co-hosts/:coClubId": "/clubs/:clubId",
  "POST /api/clubs/:clubId/activities/:activityId/co-host/accept": "/clubs/:clubId",
  "DELETE /api/clubs/:clubId/activities/:activityId/co-host": "/clubs/:clubId",

  "GET /api/feed": "/dashboard",
  "GET /api/clubs/:clubId/dashboard": "—",

  "POST /api/uploads": "—",
  "DELETE /api/uploads/:mediaId": "—",
  "GET /uploads/:key": "(dahili) — tarayıcı `<img src>` ile yüklenen dosya URL'leri",

  "GET /api/public/universities/:universitySlug/clubs/:clubSlug": "/u/:universitySlug/kulup/:clubSlug",
  "GET /api/public/universities/:universitySlug/activities/:activityId":
    "/u/:universitySlug/etkinlik/:activityId",
  "GET /api/public/qr/:code": "/q/:code",

  "GET /api/discover/activities": "/discover",
};

const md = readFileSync(API_MD, "utf8");
const endpoints = dedupe([
  ...extractFromApiMd(md),
  ...activityExtras,
  ...posterExtras,
]);

const missing: string[] = [];
for (const e of endpoints) {
  const k = `${e.method} ${e.path}`;
  if (!SURFACES[k]) missing.push(k);
}

if (missing.length > 0) {
  console.error("Eksik yüzey eşlemesi:");
  for (const k of missing) console.error(`  ${k}`);
  process.exit(1);
}

let withRoute = 0;
let noSurface = 0;
let internal = 0;

const lines = endpoints.map((e) => {
  const surface = SURFACES[`${e.method} ${e.path}`];
  if (surface === "—") noSurface++;
  else if (surface.startsWith("(dahili)")) internal++;
  else withRoute++;
  return `| ${e.method} | \`${e.path}\` | ${surface} |`;
});

const total = endpoints.length;

const content = `# API yüzey kapsaması

Bu belge, [api.md](./api.md) kataloğundaki her uca **uniclub-frontend**'de hangi ekranın
çağırdığını ölçer. Ölçüm tarihi: 2026-08-02. Frontend deposu yalnızca okundu;
değişiklik yapılmadı.

**Yüzey sütunu değerleri:**

| Değer | Anlam |
| --- | --- |
| Rota (/dashboard, /admin/users …) | En az bir ekran bu ucu apiClient ile çağırıyor |
| \`—\` | Hiçbir ekran çağırmıyor |
| \`(dahili)\` | Arayüzün doğrudan sayfa olarak çağırmadığı uç (oturum, WebSocket, statik dosya servisi) |

Yeni uç eklendiğinde bu tablo ve [api.md](./api.md) birlikte güncellenmeli.
\`docs:check\` boş veya eksik yüzey satırını reddeder.

Kaynak rotalar: \`uniclub-frontend/src/App.tsx\`; API çağrıları:
\`uniclub-frontend/src/features/*/api/*.ts\`.

---

## Kapsama tablosu

| Method | Path | Yüzey |
| --- | --- | --- |
${lines.join("\n")}

---

## Özet

| Metrik | Sayı |
| --- | ---: |
| Toplam uç | ${total} |
| Yüzeyi olan (rota) | ${withRoute} |
| Yüzey yok (\`—\`) | ${noSurface} |
| Dahili (\`(dahili)\`) | ${internal} |

\`—\` olan uçların listesi (öncelik sırası yok):

${endpoints
  .filter((e) => SURFACES[`${e.method} ${e.path}`] === "—")
  .map((e) => `- ${e.method} \`${e.path}\``)
  .join("\n")}
`;

writeFileSync(OUT, content, "utf8");
console.log(`Yazıldı: ${OUT} (${total} uç)`);
