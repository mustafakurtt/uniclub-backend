# Frontend Entegrasyon Rehberleri

Backend API sözleşmesi ve istemci davranışı. Endpoint kataloğu:
[reference/api.md](../reference/api.md).

Hata zarfı ve i18n: [reference/error-and-audit.md](../reference/error-and-audit.md).

| Rehber | Ne zaman okunur |
|---|---|
| [auth.md](auth.md) | Kayıt, giriş, doğrulama, profil, public üniversite listeleri |
| [auth-guards.md](auth-guards.md) | React route/UI guard mimarisi |
| [admin-panel.md](admin-panel.md) | Yönetim paneli — kullanıcı, kulüp, başvuru, RBAC |
| [rank-and-platform.md](rank-and-platform.md) | 9 rol, rütbe, `universityId: null` platform hesapları |
| [university.md](university.md) | Üniversite/fakülte/bölüm/domain CRUD |
| [tenant-settings.md](tenant-settings.md) | Tenant yapılandırma ayarları (sabitleme kotası, yayın hızı) |
| [clubs.md](clubs.md) | Kulüpler, üyelik, başvurular |
| [activities.md](activities.md) | Etkinlikler, RSVP, co-host |
| [dashboard.md](dashboard.md) | Öğrenci feed ve özet paneller |
| [media.md](media.md) | Dosya yükleme |
| [moderation.md](moderation.md) | Ban, şifre sıfırlama, anonimleştirme |
| [notifications-and-limits.md](notifications-and-limits.md) | WebSocket bildirimleri, rate limit |

RBAC tasarım kararları: [design/README.md](../design/README.md).
