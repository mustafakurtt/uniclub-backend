# API yüzey kapsaması

Bu belge, [api.md](./api.md) kataloğundaki her uca **uniclub-frontend**'de hangi ekranın
çağırdığını ölçer. Ölçüm tarihi: 2026-08-02 (güncelleme: 2026-08-02 BE-33 ölçüm turu).
Frontend deposu yeniden tarandı (`uniclub-frontend/src/features/*/api/*.ts`).

**Yüzey sütunu değerleri:**

| Değer | Anlam | `docs:check` |
| --- | --- | --- |
| Rota (`/dashboard`, `/admin/users` …) | En az bir ekran bu ucu `apiClient` ile çağırıyor | geçer |
| `(eksik)` | Ürün yüzeyi gerekli; henüz bağlanmadı — bilinen borç `api-surface-baseline.json` | mandal (yeni borç kırmızı) |
| `(karar bekliyor)` | Ürün kararı bekleniyor; kapı alarm vermez | geçer |
| `(dolaylı) /üst/rota` | Kendi sayfası yok; başka ekranın parçası olarak çağrılıyor | geçer |
| `(iç) açıklama` | Akış içi uç (e-posta linki, kayıt formu hazırlığı vb.) — ayrı menü öğesi değil | geçer |
| `(dahili) açıklama` | Oturum, WebSocket, statik dosya servisi — UI sayfası değil | geçer |

Ham `—` kullanmayın; üç farklı "yok" durumunu yukarıdaki etiketlerle ayırın.

Yeni uç eklendiğinde bu tablo ve [api.md](./api.md) birlikte güncellenmeli.
`docs:check` boş yüzeyi reddeder; `(eksik)` borcu `api-surface-baseline.json` mandalıyla izler (yalnızca yeni borç kırmızı).

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
| POST | `/api/admin/universities/:uid/activities/:activityId/cancel` | (eksik) |
| GET | `/api/admin/universities/:universityId/activities` | /admin/activities |
| PATCH | `/api/admin/universities/:uid/clubs/:clubId/activities/:activityId` | (eksik) |
| GET | `/api/admin/universities/:universityId/approval-committees` | /admin/approval-committees |
| POST | `/api/admin/universities/:universityId/approval-committees` | /admin/approval-committees |
| GET | `/api/admin/universities/:universityId/approval-committees/:committeeId` | /admin/approval-committees |
| PATCH | `/api/admin/universities/:universityId/approval-committees/:committeeId` | /admin/approval-committees |
| GET | `/api/admin/universities/:universityId/audit/decisions` | (eksik) |
| GET | `/api/admin/universities/:universityId/audit/summary` | (eksik) |
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
| GET | `/api/admin/universities/:universityId/dashboard` | (eksik) |
| GET | `/api/admin/universities/:universityId/formation-proposals` | /admin/clubs |
| GET | `/api/admin/universities/:universityId/formation-proposals/:id` | /admin/proposals/:proposalId |
| GET | `/api/admin/universities/:universityId/users` | /admin/users |
| GET | `/api/admin/universities/:universityId/users/:userId` | /admin/users/:userId |
| PATCH | `/api/admin/universities/:universityId/users/:userId/department` | /admin/users/:userId |
| GET | `/api/admin/universities/:universityId/users/:userId/effective-permissions` | /admin/users/:userId |
| GET | `/api/audit/universities/:universityId` | /admin/audit |
| POST | `/api/auth/accept-tenant-admin-invitation` | (iç) tenant yönetici davet e-postası kabul akışı |
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
| DELETE | `/api/clubs/:clubId/activities/:activityId/attendees/:userId/check-in` | (dolaylı) /clubs/:clubId |
| POST | `/api/clubs/:clubId/activities/:activityId/attendees/:userId/check-in` | (dolaylı) /clubs/:clubId |
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
| GET | `/api/clubs/:clubId/current-board` | (dolaylı) /clubs/:clubId |
| GET | `/api/clubs/:clubId/dashboard` | (dolaylı) /clubs/:clubId |
| GET | `/api/clubs/:clubId/gallery` | /clubs/:clubId |
| POST | `/api/clubs/:clubId/gallery` | /clubs/:clubId |
| DELETE | `/api/clubs/:clubId/gallery/:imageId` | /clubs/:clubId |
| GET | `/api/clubs/:clubId/general-meetings` | /clubs/:clubId |
| POST | `/api/clubs/:clubId/general-meetings` | /clubs/:clubId |
| GET | `/api/clubs/:clubId/general-meetings/:meetingId` | /clubs/:clubId |
| GET | `/api/clubs/:clubId/handover-records` | (dolaylı) /clubs/:clubId |
| POST | `/api/clubs/:clubId/handover-records` | (dolaylı) /clubs/:clubId |
| GET | `/api/clubs/:clubId/handover-records/:handoverId` | (dolaylı) /clubs/:clubId |
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
| PUT | `/api/clubs/applications/:applicationId/documents/:documentTypeKey` | (eksik) |
| DELETE | `/api/clubs/applications/:applicationId/documents/:documentTypeKey` | (eksik) |
| PATCH | `/api/clubs/applications/:applicationId/resubmit` | /applications/:applicationId |
| GET | `/api/clubs/formation-proposals` | /clubs/proposals, /dashboard |
| DELETE | `/api/clubs/formation-proposals/:id` | /clubs/proposals/:proposalId |
| GET | `/api/clubs/formation-proposals/:id` | /clubs/proposals/:proposalId |
| DELETE | `/api/clubs/formation-proposals/:id/support` | /clubs/proposals, /clubs/proposals/:proposalId |
| POST | `/api/clubs/formation-proposals/:id/support` | /clubs/proposals, /clubs/proposals/:proposalId |
| GET | `/api/discover/activities` | /discover |
| GET | `/api/feed` | /dashboard |
| GET | `/api/moderation/universities/:universityId/users/:userId/activity` | (eksik) |
| POST | `/api/moderation/universities/:universityId/users/:userId/ban` | (eksik) |
| GET | `/api/moderation/universities/:universityId/users/:userId/moderation-history` | (eksik) |
| POST | `/api/moderation/universities/:universityId/users/:userId/reset-password` | (eksik) |
| POST | `/api/moderation/universities/:universityId/users/:userId/unban` | (eksik) |
| POST | `/api/moderation/universities/:universityId/users/:userId/anonymize` | (eksik) |
| GET | `/api/notifications` | (dahili) — bildirim paneli / zil rozeti |
| PATCH | `/api/notifications/:notificationId/read` | (dahili) — bildirim paneli |
| GET | `/api/notifications/push-key` | (karar bekliyor) web push abonelik önceliği |
| DELETE | `/api/notifications/push-subscribe` | (karar bekliyor) web push abonelik önceliği |
| POST | `/api/notifications/push-subscribe` | (karar bekliyor) web push abonelik önceliği |
| PATCH | `/api/notifications/read-all` | (dahili) — bildirim paneli |
| GET | `/api/notifications/unread-count` | (dahili) — bildirim zil rozeti |
| GET | `/api/notifications/ws` | (dahili) — WebSocket upgrade (ticket ile) |
| POST | `/api/notifications/ws-ticket` | (dahili) — NotificationsProvider WebSocket bileti |
| GET | `/api/platform/tenants` | /admin/platform/tenants |
| GET | `/api/platform/tenants/:universityId` | (eksik) |
| GET | `/api/platform/tenants/:universityId/invitations` | (dolaylı) /admin/platform/tenants/:universityId |
| POST | `/api/platform/tenants/:universityId/invitations/:invitationId/cancel` | (dolaylı) /admin/platform/tenants/:universityId |
| POST | `/api/platform/tenants/:universityId/invite-admin` | (dolaylı) /admin/platform/tenants/:universityId |
| PATCH | `/api/platform/tenants/:universityId/status` | (dolaylı) /admin/platform/tenants/:universityId |
| POST | `/api/platform/tenants/onboard` | (dolaylı) /admin/platform/tenants |
| GET | `/api/platform/users` | /admin/platform/users |
| POST | `/api/platform/users` | /admin/platform/users |
| GET | `/api/public/qr/:code` | /q/:code |
| GET | `/api/public/universities/:universitySlug/activities/:activityId` | /u/:universitySlug/etkinlik/:activityId |
| GET | `/api/public/universities/:universitySlug/clubs/:clubSlug` | /u/:universitySlug/kulup/:clubSlug |
| GET | `/api/universities` | (iç) kayıt formu üniversite listesi (API hazır, ekran henüz çağırmıyor) |
| POST | `/api/universities` | /admin/universities |
| DELETE | `/api/universities/:universityId` | /admin/universities |
| GET | `/api/universities/:universityId` | /admin/universities/:universityId |
| PATCH | `/api/universities/:universityId` | /admin/universities/:universityId |
| GET | `/api/universities/:universityId/academic-terms` | /admin/academic-terms |
| POST | `/api/universities/:universityId/academic-terms` | /admin/academic-terms |
| DELETE | `/api/universities/:universityId/academic-terms/:termId` | /admin/academic-terms |
| PATCH | `/api/universities/:universityId/academic-terms/:termId` | /admin/academic-terms |
| GET | `/api/universities/:universityId/announcements` | /duyurular, /admin/university-announcements |
| GET | `/api/universities/:universityId/announcements/:announcementId` | /duyurular/:announcementId |
| POST | `/api/universities/:universityId/announcements` | /admin/university-announcements |
| DELETE | `/api/universities/:universityId/announcements/:id` | /admin/university-announcements |
| PATCH | `/api/universities/:universityId/announcements/:id` | /admin/university-announcements |
| POST | `/api/universities/:universityId/announcements/:id/publish` | /admin/university-announcements |
| GET | `/api/universities/:universityId/domains` | /admin/universities/:universityId |
| POST | `/api/universities/:universityId/domains` | /admin/universities/:universityId |
| DELETE | `/api/universities/:universityId/domains/:domainId` | /admin/universities/:universityId |
| PATCH | `/api/universities/:universityId/domains/:domainId` | /admin/universities/:universityId |
| GET | `/api/universities/:universityId/exports` | /admin/exports |
| POST | `/api/universities/:universityId/exports/:reportId` | /admin/exports |
| GET | `/api/universities/:universityId/faculties` | /admin/universities/:universityId |
| POST | `/api/universities/:universityId/faculties` | /admin/universities/:universityId |
| DELETE | `/api/universities/:universityId/faculties/:facultyId` | /admin/universities/:universityId |
| GET | `/api/universities/:universityId/faculties/:facultyId` | (karar bekliyor) tekil GET vs liste ağacı |
| PATCH | `/api/universities/:universityId/faculties/:facultyId` | /admin/universities/:universityId |
| GET | `/api/universities/:universityId/faculties/:facultyId/departments` | /admin/universities/:universityId |
| POST | `/api/universities/:universityId/faculties/:facultyId/departments` | /admin/universities/:universityId |
| DELETE | `/api/universities/:universityId/faculties/:facultyId/departments/:departmentId` | /admin/universities/:universityId |
| GET | `/api/universities/:universityId/faculties/:facultyId/departments/:departmentId` | (karar bekliyor) tekil GET vs liste ağacı |
| PATCH | `/api/universities/:universityId/faculties/:facultyId/departments/:departmentId` | /admin/universities/:universityId |
| GET | `/api/universities/:universityId/poster-qr` | /admin/universities/:universityId |
| POST | `/api/universities/:universityId/poster-qr` | /admin/universities/:universityId |
| PATCH | `/api/universities/:universityId/poster-qr/:qrId` | /admin/universities/:universityId |
| GET | `/api/universities/:universityId/poster-qr/:qrId/analytics` | /admin/universities/:universityId |
| POST | `/api/universities/:universityId/poster-qr/:qrId/cancel` | /admin/universities/:universityId |
| GET | `/api/universities/:universityId/poster-qr/analytics` | /admin/universities/:universityId |
| GET | `/api/universities/:universityId/settings` | /admin/settings |
| PATCH | `/api/universities/:universityId/settings` | /admin/settings |
| POST | `/api/uploads` | (eksik) |
| DELETE | `/api/uploads/:mediaId` | (eksik) |
| GET | `/api/users/me` | (dahili) — AuthContext; ayrıca /profile |
| PATCH | `/api/users/me` | /profile |
| GET | `/api/users/me/activities` | (eksik) |
| GET | `/api/users/me/advised-clubs` | /dashboard |
| GET | `/api/users/me/applications` | /dashboard, /clubs/new |
| GET | `/api/users/me/clubs` | /clubs, /dashboard, /clubs/:clubId |
| GET | `/api/users/me/dashboard` | (karar bekliyor) `/api/feed` ile overlap |
| GET | `/api/users/me/notification-preferences` | (eksik) |
| PUT | `/api/users/me/notification-preferences` | (eksik) |
| PATCH | `/api/users/me/password` | /profile |
| GET | `/api/users/me/permissions` | (dahili) — AuthContext yetki önbelleği |
| GET | `/health` | (dahili) — izleme / docker healthcheck; arayüz çağırmıyor |
| GET | `/uploads/:key` | (dahili) — tarayıcı `<img src>` ile yüklenen dosya URL'leri |

---

## Özet

| Metrik | Sayı |
| --- | ---: |
| Toplam uç | 206 |
| Doğrudan rota | 157 |
| `(eksik)` — mandal tabanı | 19 |
| `(karar bekliyor)` | 6 |
| `(dolaylı)` | 11 |
| `(iç)` | 2 |
| `(dahili)` | 11 |

Bilinen `(eksik)` borç `docs/reference/api-surface-baseline.json` dosyasında listelenir. Yeni `(eksik)` satırı tabana eklemeden eklerseniz `docs:check` kırar; borç kapandığında tabandan da çıkarın.

## Karar bekliyor (ürün kararı — kapı alarm vermez)

Ana tabloda `(karar bekliyor)` etiketiyle işaretli uçlar; ürün kararı sonrası `(eksik)`, rota veya kapsam dışı olacak.

- **GET** `/api/notifications/push-key` — web push abonelik önceliği
- **DELETE** `/api/notifications/push-subscribe` — web push abonelik önceliği
- **POST** `/api/notifications/push-subscribe` — web push abonelik önceliği
- **GET** `/api/users/me/dashboard` — `/api/feed` ile overlap; özet kartları ayrı uçta kalacak mı?
- **GET** `/api/universities/:universityId/faculties/:facultyId` — tekil GET gerekli mi, liste ağacı yeterli mi?
- **GET** `/api/universities/:universityId/faculties/:facultyId/departments/:departmentId` — aynı
