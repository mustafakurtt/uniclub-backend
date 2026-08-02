# API yüzey kapsaması

Bu belge, [api.md](./api.md) kataloğundaki her uca **uniclub-frontend**'de hangi ekranın
çağırdığını ölçer. Ölçüm tarihi: 2026-08-02. Frontend deposu yalnızca okundu;
değişiklik yapılmadı.

**Yüzey sütunu değerleri:**

| Değer | Anlam |
| --- | --- |
| Rota (/dashboard, /admin/users …) | En az bir ekran bu ucu apiClient ile çağırıyor |
| `—` | Hiçbir ekran çağırmıyor |
| `(dahili)` | Arayüzün doğrudan sayfa olarak çağırmadığı uç (oturum, WebSocket, statik dosya servisi) |

Yeni uç eklendiğinde bu tablo ve [api.md](./api.md) birlikte güncellenmeli.
`docs:check` boş veya eksik yüzey satırını reddeder.

Kaynak rotalar: `uniclub-frontend/src/App.tsx`; API çağrıları:
`uniclub-frontend/src/features/*/api/*.ts`.

---

## Kapsama tablosu

| Method | Path | Yüzey |
| --- | --- | --- |
| GET | `/api/activities` | /activities |
| GET | `/api/activities/:activityId` | /activities/:activityId |
| POST | `/api/activities/:activityId/check-in` | /activities/:activityId/yoklama |
| DELETE | `/api/activities/:activityId/rsvp` | /activities/:activityId |
| POST | `/api/activities/:activityId/rsvp` | /activities/:activityId |
| POST | `/api/admin/universities/:uid/activities/:activityId/cancel` | — |
| PATCH | `/api/admin/universities/:uid/clubs/:clubId/activities/:activityId` | — |
| GET | `/api/admin/universities/:universityId/approval-committees` | /admin/approval-committees |
| POST | `/api/admin/universities/:universityId/approval-committees` | /admin/approval-committees |
| GET | `/api/admin/universities/:universityId/approval-committees/:committeeId` | /admin/approval-committees |
| PATCH | `/api/admin/universities/:universityId/approval-committees/:committeeId` | /admin/approval-committees |
| GET | `/api/admin/universities/:universityId/audit/decisions` | — |
| GET | `/api/admin/universities/:universityId/audit/summary` | — |
| GET | `/api/admin/universities/:universityId/club-applications` | /admin/clubs |
| GET | `/api/admin/universities/:universityId/club-applications/:applicationId` | /admin/applications/:applicationId |
| PATCH | `/api/admin/universities/:universityId/club-applications/:applicationId/appeal/review` | /admin/applications/:applicationId |
| PATCH | `/api/admin/universities/:universityId/club-applications/:applicationId/approve` | /admin/applications/:applicationId |
| GET | `/api/admin/universities/:universityId/club-applications/:applicationId/checklist` | /admin/applications/:applicationId |
| PATCH | `/api/admin/universities/:universityId/club-applications/:applicationId/checklist/:itemKey` | /admin/applications/:applicationId |
| PATCH | `/api/admin/universities/:universityId/club-applications/:applicationId/committee-vote` | /admin/applications/:applicationId, /admin/committee-tasks |
| GET | `/api/admin/universities/:universityId/club-applications/:applicationId/history` | /admin/applications/:applicationId |
| PATCH | `/api/admin/universities/:universityId/club-applications/:applicationId/reject` | /admin/applications/:applicationId |
| PATCH | `/api/admin/universities/:universityId/club-applications/:applicationId/request-revision` | /admin/applications/:applicationId |
| GET | `/api/admin/universities/:universityId/club-applications/my-committee-pending` | /admin/committee-tasks |
| GET | `/api/admin/universities/:universityId/clubs` | /admin/clubs |
| DELETE | `/api/admin/universities/:universityId/clubs/:clubId` | /admin/clubs/:clubId |
| GET | `/api/admin/universities/:universityId/clubs/:clubId` | /admin/clubs/:clubId |
| PATCH | `/api/admin/universities/:universityId/clubs/:clubId` | /admin/clubs/:clubId |
| GET | `/api/admin/universities/:universityId/clubs/:clubId/advisor-invitations` | /admin/clubs/:clubId |
| DELETE | `/api/admin/universities/:universityId/clubs/:clubId/advisor-invitations/:invitationId` | /admin/clubs/:clubId |
| GET | `/api/admin/universities/:universityId/clubs/:clubId/advisors` | /admin/clubs/:clubId |
| POST | `/api/admin/universities/:universityId/clubs/:clubId/advisors` | /admin/clubs/:clubId |
| DELETE | `/api/admin/universities/:universityId/clubs/:clubId/advisors/:userId` | /admin/clubs/:clubId |
| PATCH | `/api/admin/universities/:universityId/clubs/:clubId/status` | /admin/clubs/:clubId |
| GET | `/api/admin/universities/:universityId/dashboard` | — |
| GET | `/api/admin/universities/:universityId/formation-proposals` | /admin/clubs |
| GET | `/api/admin/universities/:universityId/formation-proposals/:id` | /admin/proposals/:proposalId |
| GET | `/api/admin/universities/:universityId/users` | /admin/users |
| GET | `/api/admin/universities/:universityId/users/:userId` | /admin/users/:userId |
| PATCH | `/api/admin/universities/:universityId/users/:userId/department` | /admin/users/:userId |
| GET | `/api/admin/universities/:universityId/users/:userId/effective-permissions` | /admin/users/:userId |
| GET | `/api/audit/universities/:universityId` | /admin/audit |
| POST | `/api/auth/accept-tenant-admin-invitation` | — |
| POST | `/api/auth/login` | /login |
| GET | `/api/auth/me` | (dahili) — ProtectedRoute / AuthContext oturum doğrulama |
| GET | `/api/auth/permissions` | /admin/permissions |
| POST | `/api/auth/permissions` | /admin/permissions |
| PATCH | `/api/auth/permissions/:permissionId` | /admin/permissions |
| POST | `/api/auth/register` | /register |
| GET | `/api/auth/roles` | /admin/roles |
| POST | `/api/auth/roles` | /admin/roles |
| PATCH | `/api/auth/roles/:roleId` | /admin/roles |
| POST | `/api/auth/roles/:roleId/permissions` | /admin/roles |
| DELETE | `/api/auth/roles/:roleId/permissions/:permissionId` | /admin/roles |
| PATCH | `/api/auth/users/:userId/demote-admin` | /admin/users/:userId |
| PATCH | `/api/auth/users/:userId/demote-super-admin` | /admin/users/:userId |
| PATCH | `/api/auth/users/:userId/promote-admin` | /admin/users/:userId |
| PATCH | `/api/auth/users/:userId/promote-super-admin` | /admin/users/:userId |
| GET | `/api/auth/verify` | /verify |
| GET | `/api/clubs` | /clubs |
| GET | `/api/clubs/:clubId` | /clubs/:clubId |
| PATCH | `/api/clubs/:clubId` | /clubs/:clubId |
| GET | `/api/clubs/:clubId/activities` | /clubs/:clubId, /activities/:activityId |
| POST | `/api/clubs/:clubId/activities` | /clubs/:clubId |
| PATCH | `/api/clubs/:clubId/activities/:activityId` | /clubs/:clubId |
| GET | `/api/clubs/:clubId/activities/:activityId/attendees` | /clubs/:clubId |
| DELETE | `/api/clubs/:clubId/activities/:activityId/attendees/:userId/check-in` | — |
| POST | `/api/clubs/:clubId/activities/:activityId/attendees/:userId/check-in` | — |
| POST | `/api/clubs/:clubId/activities/:activityId/cancel` | /clubs/:clubId |
| GET | `/api/clubs/:clubId/activities/:activityId/check-in-qr` | /clubs/:clubId/activities/:activityId/yoklama-qr |
| DELETE | `/api/clubs/:clubId/activities/:activityId/co-host` | /clubs/:clubId |
| POST | `/api/clubs/:clubId/activities/:activityId/co-host/accept` | /clubs/:clubId |
| GET | `/api/clubs/:clubId/activities/:activityId/co-hosts` | /clubs/:clubId |
| POST | `/api/clubs/:clubId/activities/:activityId/co-hosts` | /clubs/:clubId |
| DELETE | `/api/clubs/:clubId/activities/:activityId/co-hosts/:coClubId` | /clubs/:clubId |
| POST | `/api/clubs/:clubId/activities/:activityId/publish` | /clubs/:clubId |
| GET | `/api/clubs/:clubId/announcements` | /clubs/:clubId |
| POST | `/api/clubs/:clubId/announcements` | /clubs/:clubId |
| DELETE | `/api/clubs/:clubId/announcements/:announcementId` | /clubs/:clubId |
| PATCH | `/api/clubs/:clubId/announcements/:announcementId` | /clubs/:clubId |
| POST | `/api/clubs/:clubId/announcements/:announcementId/publish` | /clubs/:clubId |
| POST | `/api/clubs/:clubId/contact-links` | /clubs/:clubId |
| DELETE | `/api/clubs/:clubId/contact-links/:linkId` | /clubs/:clubId |
| PATCH | `/api/clubs/:clubId/contact-links/:linkId` | /clubs/:clubId |
| GET | `/api/clubs/:clubId/current-board` | — |
| GET | `/api/clubs/:clubId/dashboard` | — |
| GET | `/api/clubs/:clubId/gallery` | /clubs/:clubId |
| POST | `/api/clubs/:clubId/gallery` | /clubs/:clubId |
| DELETE | `/api/clubs/:clubId/gallery/:imageId` | /clubs/:clubId |
| GET | `/api/clubs/:clubId/general-meetings` | /clubs/:clubId |
| POST | `/api/clubs/:clubId/general-meetings` | /clubs/:clubId |
| GET | `/api/clubs/:clubId/general-meetings/:meetingId` | /clubs/:clubId |
| GET | `/api/clubs/:clubId/handover-records` | — |
| POST | `/api/clubs/:clubId/handover-records` | — |
| GET | `/api/clubs/:clubId/handover-records/:handoverId` | — |
| POST | `/api/clubs/:clubId/join` | /clubs/:clubId |
| GET | `/api/clubs/:clubId/join-requests` | /clubs/:clubId |
| PATCH | `/api/clubs/:clubId/join-requests/:userId` | /clubs/:clubId |
| DELETE | `/api/clubs/:clubId/leave` | /clubs/:clubId |
| GET | `/api/clubs/:clubId/members` | /clubs/:clubId |
| DELETE | `/api/clubs/:clubId/members/:userId` | /clubs/:clubId |
| PATCH | `/api/clubs/:clubId/members/:userId/role` | /clubs/:clubId |
| GET | `/api/clubs/:clubId/membership-history` | /admin/clubs/:clubId |
| GET | `/api/clubs/:clubId/poster-qr` | /clubs/:clubId |
| POST | `/api/clubs/:clubId/poster-qr` | /clubs/:clubId |
| PATCH | `/api/clubs/:clubId/poster-qr/:qrId` | /clubs/:clubId |
| GET | `/api/clubs/:clubId/poster-qr/:qrId/analytics` | /clubs/:clubId |
| POST | `/api/clubs/:clubId/poster-qr/:qrId/cancel` | /clubs/:clubId |
| GET | `/api/clubs/:clubId/poster-qr/analytics` | /clubs/:clubId |
| POST | `/api/clubs/:clubId/transfer-presidency` | /clubs/:clubId |
| POST | `/api/clubs/applications` | /clubs/new |
| DELETE | `/api/clubs/applications/:applicationId` | /applications/:applicationId |
| GET | `/api/clubs/applications/:applicationId` | /applications/:applicationId |
| GET | `/api/clubs/applications/:applicationId/history` | /applications/:applicationId |
| PATCH | `/api/clubs/applications/:applicationId/resubmit` | /applications/:applicationId |
| GET | `/api/clubs/formation-proposals` | /clubs/proposals, /dashboard |
| DELETE | `/api/clubs/formation-proposals/:id` | /clubs/proposals/:proposalId |
| GET | `/api/clubs/formation-proposals/:id` | /clubs/proposals/:proposalId |
| DELETE | `/api/clubs/formation-proposals/:id/support` | /clubs/proposals, /clubs/proposals/:proposalId |
| POST | `/api/clubs/formation-proposals/:id/support` | /clubs/proposals, /clubs/proposals/:proposalId |
| GET | `/api/discover/activities` | /discover |
| GET | `/api/feed` | /dashboard |
| GET | `/api/moderation/universities/:universityId/users/:userId/activity` | — |
| POST | `/api/moderation/universities/:universityId/users/:userId/ban` | — |
| GET | `/api/moderation/universities/:universityId/users/:userId/moderation-history` | — |
| POST | `/api/moderation/universities/:universityId/users/:userId/reset-password` | — |
| POST | `/api/moderation/universities/:universityId/users/:userId/unban` | — |
| GET | `/api/notifications` | (dahili) — bildirim paneli / zil rozeti |
| PATCH | `/api/notifications/:notificationId/read` | (dahili) — bildirim paneli |
| GET | `/api/notifications/push-key` | — |
| DELETE | `/api/notifications/push-subscribe` | — |
| POST | `/api/notifications/push-subscribe` | — |
| PATCH | `/api/notifications/read-all` | (dahili) — bildirim paneli |
| GET | `/api/notifications/unread-count` | (dahili) — bildirim zil rozeti |
| GET | `/api/notifications/ws` | (dahili) — WebSocket upgrade (ticket ile) |
| POST | `/api/notifications/ws-ticket` | (dahili) — NotificationsProvider WebSocket bileti |
| GET | `/api/platform/tenants` | — |
| GET | `/api/platform/tenants/:universityId/invitations` | — |
| POST | `/api/platform/tenants/:universityId/invitations/:invitationId/cancel` | — |
| POST | `/api/platform/tenants/:universityId/invite-admin` | — |
| PATCH | `/api/platform/tenants/:universityId/status` | — |
| POST | `/api/platform/tenants/onboard` | — |
| GET | `/api/platform/users` | — |
| POST | `/api/platform/users` | — |
| GET | `/api/public/qr/:code` | /q/:code |
| GET | `/api/public/universities/:universitySlug/activities/:activityId` | /u/:universitySlug/etkinlik/:activityId |
| GET | `/api/public/universities/:universitySlug/clubs/:clubSlug` | /u/:universitySlug/kulup/:clubSlug |
| GET | `/api/universities` | — |
| POST | `/api/universities` | /admin/universities |
| DELETE | `/api/universities/:universityId` | /admin/universities |
| GET | `/api/universities/:universityId` | /admin/universities/:universityId |
| PATCH | `/api/universities/:universityId` | /admin/universities/:universityId |
| GET | `/api/universities/:universityId/academic-terms` | /admin/academic-terms |
| POST | `/api/universities/:universityId/academic-terms` | /admin/academic-terms |
| DELETE | `/api/universities/:universityId/academic-terms/:termId` | /admin/academic-terms |
| PATCH | `/api/universities/:universityId/academic-terms/:termId` | /admin/academic-terms |
| GET | `/api/universities/:universityId/announcements` | — |
| POST | `/api/universities/:universityId/announcements` | — |
| DELETE | `/api/universities/:universityId/announcements/:id` | — |
| PATCH | `/api/universities/:universityId/announcements/:id` | — |
| POST | `/api/universities/:universityId/announcements/:id/publish` | — |
| GET | `/api/universities/:universityId/domains` | /admin/universities/:universityId |
| POST | `/api/universities/:universityId/domains` | /admin/universities/:universityId |
| DELETE | `/api/universities/:universityId/domains/:domainId` | /admin/universities/:universityId |
| PATCH | `/api/universities/:universityId/domains/:domainId` | /admin/universities/:universityId |
| GET | `/api/universities/:universityId/exports` | /admin/exports |
| POST | `/api/universities/:universityId/exports/:reportId` | /admin/exports |
| GET | `/api/universities/:universityId/faculties` | /admin/universities/:universityId |
| POST | `/api/universities/:universityId/faculties` | /admin/universities/:universityId |
| DELETE | `/api/universities/:universityId/faculties/:facultyId` | /admin/universities/:universityId |
| GET | `/api/universities/:universityId/faculties/:facultyId` | — |
| PATCH | `/api/universities/:universityId/faculties/:facultyId` | /admin/universities/:universityId |
| GET | `/api/universities/:universityId/faculties/:facultyId/departments` | /admin/universities/:universityId |
| POST | `/api/universities/:universityId/faculties/:facultyId/departments` | /admin/universities/:universityId |
| DELETE | `/api/universities/:universityId/faculties/:facultyId/departments/:departmentId` | /admin/universities/:universityId |
| GET | `/api/universities/:universityId/faculties/:facultyId/departments/:departmentId` | — |
| PATCH | `/api/universities/:universityId/faculties/:facultyId/departments/:departmentId` | /admin/universities/:universityId |
| GET | `/api/universities/:universityId/poster-qr` | /admin/universities/:universityId |
| POST | `/api/universities/:universityId/poster-qr` | /admin/universities/:universityId |
| PATCH | `/api/universities/:universityId/poster-qr/:qrId` | /admin/universities/:universityId |
| GET | `/api/universities/:universityId/poster-qr/:qrId/analytics` | /admin/universities/:universityId |
| POST | `/api/universities/:universityId/poster-qr/:qrId/cancel` | /admin/universities/:universityId |
| GET | `/api/universities/:universityId/poster-qr/analytics` | /admin/universities/:universityId |
| GET | `/api/universities/:universityId/settings` | /admin/settings |
| PATCH | `/api/universities/:universityId/settings` | /admin/settings |
| POST | `/api/uploads` | — |
| DELETE | `/api/uploads/:mediaId` | — |
| GET | `/api/users/me` | (dahili) — AuthContext; ayrıca /profile |
| PATCH | `/api/users/me` | /profile |
| GET | `/api/users/me/activities` | — |
| GET | `/api/users/me/advised-clubs` | /dashboard |
| GET | `/api/users/me/applications` | /dashboard, /clubs/new |
| GET | `/api/users/me/clubs` | /clubs, /dashboard, /clubs/:clubId |
| GET | `/api/users/me/dashboard` | — |
| GET | `/api/users/me/notification-preferences` | — |
| PUT | `/api/users/me/notification-preferences` | — |
| PATCH | `/api/users/me/password` | /profile |
| GET | `/api/users/me/permissions` | (dahili) — AuthContext yetki önbelleği |
| GET | `/health` | (dahili) — izleme / docker healthcheck; arayüz çağırmıyor |
| GET | `/uploads/:key` | (dahili) — tarayıcı `<img src>` ile yüklenen dosya URL'leri |

---

## Özet

| Metrik | Sayı |
| --- | ---: |
| Toplam uç | 200 |
| Yüzeyi olan (rota) | 146 |
| Yüzey yok (`—`) | 43 |
| Dahili (`(dahili)`) | 11 |

`—` olan uçların listesi (öncelik sırası yok):

- POST `/api/admin/universities/:uid/activities/:activityId/cancel`
- PATCH `/api/admin/universities/:uid/clubs/:clubId/activities/:activityId`
- GET `/api/admin/universities/:universityId/audit/decisions`
- GET `/api/admin/universities/:universityId/audit/summary`
- GET `/api/admin/universities/:universityId/dashboard`
- POST `/api/auth/accept-tenant-admin-invitation`
- DELETE `/api/clubs/:clubId/activities/:activityId/attendees/:userId/check-in`
- POST `/api/clubs/:clubId/activities/:activityId/attendees/:userId/check-in`
- GET `/api/clubs/:clubId/current-board`
- GET `/api/clubs/:clubId/dashboard`
- GET `/api/clubs/:clubId/handover-records`
- POST `/api/clubs/:clubId/handover-records`
- GET `/api/clubs/:clubId/handover-records/:handoverId`
- GET `/api/moderation/universities/:universityId/users/:userId/activity`
- POST `/api/moderation/universities/:universityId/users/:userId/ban`
- GET `/api/moderation/universities/:universityId/users/:userId/moderation-history`
- POST `/api/moderation/universities/:universityId/users/:userId/reset-password`
- POST `/api/moderation/universities/:universityId/users/:userId/unban`
- GET `/api/notifications/push-key`
- DELETE `/api/notifications/push-subscribe`
- POST `/api/notifications/push-subscribe`
- GET `/api/platform/tenants`
- GET `/api/platform/tenants/:universityId/invitations`
- POST `/api/platform/tenants/:universityId/invitations/:invitationId/cancel`
- POST `/api/platform/tenants/:universityId/invite-admin`
- PATCH `/api/platform/tenants/:universityId/status`
- POST `/api/platform/tenants/onboard`
- GET `/api/platform/users`
- POST `/api/platform/users`
- GET `/api/universities`
- GET `/api/universities/:universityId/announcements`
- POST `/api/universities/:universityId/announcements`
- DELETE `/api/universities/:universityId/announcements/:id`
- PATCH `/api/universities/:universityId/announcements/:id`
- POST `/api/universities/:universityId/announcements/:id/publish`
- GET `/api/universities/:universityId/faculties/:facultyId`
- GET `/api/universities/:universityId/faculties/:facultyId/departments/:departmentId`
- POST `/api/uploads`
- DELETE `/api/uploads/:mediaId`
- GET `/api/users/me/activities`
- GET `/api/users/me/dashboard`
- GET `/api/users/me/notification-preferences`
- PUT `/api/users/me/notification-preferences`
