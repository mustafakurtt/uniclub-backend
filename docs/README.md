# Documentation

Reference documentation for the UniClub backend. The high-level overview
lives in the [root README](../README.md); this folder holds the deep dives.

> Note: API/feature docs and the design notes are written in **Turkish**, matching
> the codebase convention. API `message` alanları **isteğin diline** göre döner
> (`Accept-Language: tr|en`, varsayılan `tr`).

Değişiklik günlüğü: [CHANGELOG.md](../CHANGELOG.md).

## Reference

| Doc | What it covers |
| --- | --- |
| [architecture.md](architecture.md) | System design: layering, multi-tenancy, RBAC engine, realtime, data flow |
| [operations.md](operations.md) | Environments, migrations, backups, deploys, incident response |
| [LOGLAMA.md](LOGLAMA.md) | Observability: structured logs (Vector → Loki) + metrics (Prometheus → Grafana) |
| [MAKINE_KURULUMU.md](MAKINE_KURULUMU.md) | Makine kurulumu (dev/prod), ağ ayarları ve frontend notları |
| [API.md](API.md) | REST endpoint reference |
| [BILDIRIMLER.md](BILDIRIMLER.md) | Notification system + WebSocket delivery |
| [DENETIM_VE_HATA.md](DENETIM_VE_HATA.md) | Audit trail + error-handling contract |
| [MAIL_DOGRULAMA.md](MAIL_DOGRULAMA.md) | Email verification flow (BullMQ + Mailpit) |
| [GUVENLIK_YOL_HARITASI.md](GUVENLIK_YOL_HARITASI.md) | Güvenlik + `core/` çatısının eksikleri, tier'lı |
| [SEMA_VE_URUN_YOL_HARITASI.md](SEMA_VE_URUN_YOL_HARITASI.md) | Veri modeli, SaaS ürünleşme ve doküman borcu, tier'lı |
| [ONBOARDING_TENANT.md](ONBOARDING_TENANT.md) | Yeni üniversite (tenant) açma runbook'u — operasyon |
| [DATA_MODEL.md](DATA_MODEL.md) | Veri modeli: ER diyagramı, tablo sözlüğü, şema kuralları |
| [KVKK.md](KVKK.md) | Kişisel veri envanteri, anonimleştirme akışı, saklama süreleri |
| [adr/](adr/) | Mimari karar kayıtları (ADR) |

## Frontend integration guides — [`frontend/`](frontend/)

Endpoint contracts and expected client behavior for each surface:

| Doc | Kapsam |
| --- | --- |
| [FRONTEND_AUTH_RBAC.md](frontend/FRONTEND_AUTH_RBAC.md) | Auth + RBAC, hata/i18n zarfı, login (`mustChangePassword`) |
| [FRONTEND_AUTH_GUARD_GUIDE.md](frontend/FRONTEND_AUTH_GUARD_GUIDE.md) | React route/UI guard mimarisi |
| [FRONTEND_UNIVERSITY.md](frontend/FRONTEND_UNIVERSITY.md) | Üniversite/fakülte/bölüm/domain (soft delete notu) |
| [FRONTEND_CLUBS.md](frontend/FRONTEND_CLUBS.md) | Kulüpler, üyelik, danışman, başvurular |
| [FRONTEND_ACTIVITIES.md](frontend/FRONTEND_ACTIVITIES.md) | **Yeni** — etkinlikler: keşif/RSVP/takvim + kulüp-içi yönetim (M:N host/co-host, cross-university) |
| [FRONTEND_DASHBOARD.md](frontend/FRONTEND_DASHBOARD.md) | **Yeni** — panel & akış: öğrenci feed/özeti, kulüp paneli, admin paneli |
| [FRONTEND_MEDIA.md](frontend/FRONTEND_MEDIA.md) | **Yeni** — dosya yükleme: multipart upload → URL → `*Url` alanı; public servis |
| [FRONTEND_YONETIM.md](frontend/FRONTEND_YONETIM.md) | Yönetim paneli (kullanıcı/kulüp/başvuru) |
| [FRONTEND_MODERASYON.md](frontend/FRONTEND_MODERASYON.md) | **Yeni** — ban/unban/şifre sıfırla/aktivite/geçmiş |
| [FRONTEND_BILDIRIM_VE_LIMITLER.md](frontend/FRONTEND_BILDIRIM_VE_LIMITLER.md) | Bildirimler (WS) + rate limit |
| [FRONTEND_RUTBE_VE_PLATFORM.md](frontend/FRONTEND_RUTBE_VE_PLATFORM.md) | Rütbe/kapsam + platform rolleri |
| [FRONTEND_OPS.md](frontend/FRONTEND_OPS.md) | Operasyonel frontend notları |

## RBAC design notes — [`design/`](design/)

The enterprise 9-role model: role → permission bundles, tenant-scope rules,
escalation safety, and the scenarios that drove the design.
