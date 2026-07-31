# Platform Operasyonları — Ürün & Teknik Roadmap

**Durum:** Planlama (Temmuz 2026). Okul (tenant) yönetim panelinden **bilinçli olarak
ayrı** tutulacak SaaS operatör yüzeyi.

**İlgili:** [design/README.md](../design/README.md) · [integration/platform-panel.md](../integration/platform-panel.md) ·
[operations/tenant-onboarding.md](../operations/tenant-onboarding.md) ·
[schema-product.md](schema-product.md) · [platform-rbac.md](platform-rbac.md)

**İlerleme:** Bu dosyada tamamlanma işaretleri tutulmaz — CHANGELOG ve PR açıklamalarında izlenir.

---

## 1. Strateji özeti

- Öncelik: **Platform operasyonları** (tenant lifecycle, global RBAC, destek) → sonra okul paneli.
- **Kapsam (bu repo):** Yalnızca backend — REST API, şema, RBAC, test, `docs/integration/*`. Frontend panel bu repoda **yapılmayacak**.
- Yetki: tüketici frontend **rol adına değil permission'a** bakar (`GET /api/users/me/permissions`).
- Platform hesapları: `users.universityId = null`; tenant bağlamı operatör tarafında seçilir (JWT'den değil).

---

## 2. Neden ayrı API yüzeyi?

| Boyut | Platform (`/api/platform`) | Okul paneli (`/api/admin`) |
| --- | --- | --- |
| Kullanıcı | Platform hesabı (`universityId = null`) | Tenant personeli |
| Tenant bağlamı | Seçilen üniversite (drill-down) | JWT'deki sabit `universityId` |
| Ana iş | Tenant aç/kapat, platform hesapları, destek | SKS / günlük kulüp operasyonu |
| Salt-okunur mod | `platform_support` | `auditor` |

Platform hesabı öğrenci self-service rotalarına giremez (`400` — üniversiteye bağlı hesap gerekir).

---

## 3. Mevcut backend durumu

### Hazır (kodda)

| Alan | Endpoint / mekanizma |
| --- | --- |
| Tenant listesi (operatör) | `GET /api/platform/tenants` |
| Tenant durum / suspend | `PATCH /api/platform/tenants/:id/status` |
| Tenant onboard + invite-admin | `POST /api/platform/tenants/onboard`, `invite-admin` |
| Platform hesap listesi / oluşturma | `GET /api/platform/users`, `POST` (super_admin) |
| Tenant CRUD (profil) | `POST/GET/PATCH/DELETE /api/universities` |
| Global rol/yetki CRUD | `/api/auth/roles`, `/permissions` |
| Çapraz-tenant admin/moderation/audit | `/api/admin`, `/api/moderation`, `/api/audit` |
| Prod ilk kurulum | `bun run db:bootstrap` |

### Eksik (gerçek sistem için)

| Alan | Not |
| --- | --- |
| `tenant_settings` | limit, feature flag (bugün koda gömülü) |
| Plan / abonelik / kota | `plans`, `subscriptions` |
| Platform dashboard (aggregate) | Tenant içi dashboard var, platform özeti yok |
| Self-servis şifre sıfırlama | Sadece yönetici sıfırlaması |
| Token revocation | JWT 7 gün, gerçek logout yok |
| Cross-tenant arama / audit aggregate | Destek senaryoları |
| Impersonation | Tasarım aşaması |

---

## 4. Hedef API yüzeyi (backend sözleşmesi)

Tüketici dokümanı: `docs/integration/platform-panel.md`.

```
/api/platform/*     → SaaS operatörü (tenant lifecycle, platform users)
/api/admin/*        → Tenant drill-down (mevcut)
/api/auth/*         → Global RBAC
/api/universities/* → Tenant CRUD + akademik yapı
```

---

## 5. Faz planı (yalnızca backend)

### Faz 1 — Tenant yaşam döngüsü

**Backend:**

- `universities.status` enum + migration
- `GET /api/platform/tenants` (stats)
- `POST /api/platform/tenants/onboard` (atomik)
- `POST /api/platform/tenants/:id/invite-admin`
- `PATCH /api/platform/tenants/:id/status`
- Tenant askısı + soft-delete: authz cache, `requireActiveUser`, login/register

### Faz 2 — Platform kullanıcıları

**Backend:**

- `GET /api/platform/users`
- `POST /api/platform/users` (`super_admin` — platform rol atama kuralı)

### Faz 3 — Destek konsolu (opsiyonel API)

**Backend (P2):**

- `GET /api/platform/search?q=email`
- Impersonation (güvenlik review sonrası)

### Faz 4 — Dashboard & gözlemlenebilirlik

**Backend:**

- `GET /api/platform/dashboard`
- `GET /api/platform/health` (zengin)
- Cross-tenant audit aggregate (opsiyonel)

### Faz 5 — SaaS ticari katman

**Backend:**

- `plans`, `subscriptions`, `usage_counters`, `tenant_settings`
- Plan/kota API'leri

### Faz 6 — Uyumluluk

**Backend:**

- KVKK talepleri, veri export, audit export, retention API'leri

---

## 6. Backend öncelik sırası

| Öncelik | İş | Faz |
| ---: | --- | --- |
| P0 | Tenant status + erişim zorlaması (tüm yüzeyler) | 1 |
| P0 | `GET /api/platform/tenants` | 1 |
| P0 | Onboard + invite-admin | 1 |
| P1 | Platform users API | 2 |
| P1 | `GET /api/platform/dashboard` | 4 |
| P2 | `tenant_settings` şeması | 5 |
| P2 | `plans` + `subscriptions` | 5 |
| P2 | `GET /api/platform/search` | 3 |
| P3 | Impersonation | 3+ |
| P3 | Token revocation | güvenlik borcu |

---

## 7. Modül haritası

| Modül (API) | Faz |
| --- | --- |
| Tenants (liste, onboard, status, invite) | 1 |
| Platform Users | 2 |
| Support / search | 3 |
| Dashboard + health | 4 |
| Billing & Plans | 5 |
| Compliance export | 6 |

---

## 8. Karar günlüğü

| Tarih | Karar | ADR |
| --- | --- | --- |
| 2026-07-31 | Platform operasyonlarından başlanacak; okul paneli sonra | — |
| 2026-07-31 | `/platform` ayrı layout (frontend ayrı repo) | — |
| 2026-07-31 | Rol sayısı minimal; claim bazlı genişleme | [0004](../adr/0004-nine-role-rbac-with-rank.md) |
| 2026-07-31 | Platform API'leri `/api/platform` — `admin`'den ayrı feature | [0008](../adr/0008-platform-feature-boundary.md) |
| 2026-07-31 | Tenant `status` authz cache + middleware zorlaması | [0009](../adr/0009-tenant-status-in-authz-cache.md) |
| 2026-07-31 | Platform rolü ↔ tenant rolü ayrımı | [0010](../adr/0010-platform-vs-tenant-roles.md) |
| 2026-07-31 | Bu repo: yalnızca backend API + doküman + test | — |

---

## 9. Kod konvansiyonu

```
src/features/platform/
  platform.permissions.ts
  platform.routes.ts          → mount: /api/platform
  tenants/                    → tenant yaşam döngüsü
  operator-users/             → platform hesapları
  dashboard/                  → Faz 4 (planlı)
```

Tenant profil CRUD `university` feature'ında kalır; liste/stats/status/onboard `platform/tenants` altında.
