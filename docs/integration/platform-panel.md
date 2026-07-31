# Frontend — Platform Operasyonları (`/api/platform`)

SaaS operatör paneli için tenant listesi ve yaşam döngüsü. Okul (tenant) yönetim
panelinden **ayrı** layout (`/platform/*`) hedeflenir.

> Genel kurallar: [reference/api.md](../reference/api.md). RBAC: [platform-rbac.md](../planning/platform-rbac.md).

## Yetki

| Permission | super_admin | platform_support |
| --- | ---: | ---: |
| `platform.tenant.view` | ✅ | ✅ |
| `platform.tenant.manage` | ✅ | — |
| `platform.tenant.invite` | ✅ | — |
| `platform.user.view` | ✅ | — |

`university.create` onboard için gerekir (`POST /tenants/onboard`). Platform hesabı oluşturma (`POST /users`) yalnızca `super_admin` rolüyle yapılır — ayrı permission yok.

## Tenant yönetici daveti — operatör ne görür, davetli ne görür

**Operatör asla tenant yöneticisinin şifresini bilmez ve belirleyemez.** Davet akışı:

1. Operatör `invite-admin` veya onboard `initialAdmin` ile yalnızca ad, soyad ve e-posta girer.
2. Sistem bekleyen davet kaydı oluşturur; davet maili commit sonrası kuyruğa girer.
3. Operatör panelinde bekleyen davetler listelenir; iptal edilebilir.
4. Davetli, maildeki linkten kendi şifresini belirler (`POST /api/auth/accept-tenant-admin-invitation`, min **12** karakter).
5. Kabul sonrası hesap `active` + `university_admin` rolü atanmış olur.

Token güvenliği: 128 bit entropi (UUID), DB'de SHA-256 özeti; tek kullanımlık, 7 gün TTL.
Public kabul uçunda kimlik yok — IP başına kaba tavan rate limit uygulanır; geçersiz/süresi dolmuş token denemeleri enumeration yapmamak için aynı genel hata sınıfına düşer.

## `GET /api/platform/tenants`

Tenant listesi + özet istatistikler. Yetki: `platform.tenant.view`. Keyset sayfalama.

Query: `limit` (varsayılan 50, max 100), `cursor` (opak keyset — önceki yanıttaki `nextCursor`), opsiyonel `search`.

```jsonc
{
  "success": true,
  "message": "Tenant listesi listelendi.",
  "data": {
    "items": [
      {
        "id": "...",
        "name": "Antalya Bilim Üniversitesi",
        "slug": "antalya-bilim",
        "status": "active",
        "createdAt": "...",
        "updatedAt": "...",
        "domainCount": 2,
        "userCount": 18,
        "clubCount": 6,
        "pendingApplications": 1
      }
    ],
    "nextCursor": "<opak cursor>" // veya null (son sayfa)
  }
}
```

## `PATCH /api/platform/tenants/:universityId/status`

Tenant durumu güncelleme. Yetki: `platform.tenant.manage`.

```jsonc
// Body
{ "status": "suspended", "reason": "Ödeme gecikmesi — en az 3 karakter" }

// 200 data
{ "id": "...", "name": "...", "slug": "...", "status": "suspended", "createdAt": "...", "updatedAt": "..." }
```

- `reason` zorunlu (3–500 karakter); audit trail'de kayda geçer.
- Aynı duruma geçiş → `400 platform.tenantStatusUnchanged`.
- Tenant `suspended` veya soft-delete → o üniversitenin tüm kullanıcıları bir sonraki istekte `403`
  (`rbac.tenantSuspended`); login ve kayıt da reddedilir (`auth.loginTenantSuspended` / `auth.tenantRegistrationDisabled`).

## `POST /api/platform/tenants/onboard`

Yeni tenant'ı tek atomik çağrıda açar: üniversite + domainler + (opsiyonel)
akademik ağaç + (opsiyonel) ilk yönetici **daveti**. Yetki: `university.create`;
`initialAdmin` verilirse ek olarak `platform.tenant.invite`.

```jsonc
// Body
{
  "name": "Örnek Bilim Üniversitesi",
  "slug": "ornek-bilim",
  "status": "trial",
  "domains": [
    { "domain": "std.ornek.edu.tr", "domainType": "student" },
    { "domain": "ornek.edu.tr", "domainType": "staff" }
  ],
  "faculties": [
    { "name": "Mühendislik Fakültesi", "departments": ["Bilgisayar Mühendisliği"] }
  ],
  "initialAdmin": {
    "firstName": "Ayşe",
    "lastName": "Yönetici",
    "email": "ayse.yonetici@ornek.edu.tr"
  }
}

// 201 data
{
  "university": { "id": "...", "name": "...", "slug": "...", "status": "trial", ... },
  "domains": [ ... ],
  "faculties": [{ "id": "...", "name": "...", "departments": [{ "id": "...", "name": "..." }] }],
  "initialAdminInvitation": {
    "id": "...",
    "universityId": "...",
    "email": "...",
    "firstName": "Ayşe",
    "lastName": "Yönetici",
    "roleName": "university_admin",
    "status": "pending",
    "expiresAt": "...",
    "invitedBy": "...",
    "createdAt": "...",
    "updatedAt": "..."
  } // veya null
}
```

- `status` varsayılan `trial`.
- `initialAdmin` e-postası tenant'ın **staff** domainlerinden biriyle eşleşmeli.
- Canlı hesap oluşturulmaz; davet maili commit sonrası gönderilir.

## `GET /api/platform/tenants/:universityId/invitations`

Bekleyen tenant yönetici davetleri. Yetki: `platform.tenant.invite`.

```jsonc
// 200 data — yalnızca pending (süresi dolmamış, iptal/kabul edilmemiş)
[
  {
    "id": "...",
    "universityId": "...",
    "email": "...",
    "firstName": "...",
    "lastName": "...",
    "roleName": "university_admin",
    "status": "pending",
    "expiresAt": "...",
    "invitedBy": "...",
    "createdAt": "...",
    "updatedAt": "..."
  }
]
```

## `POST /api/platform/tenants/:universityId/invite-admin`

Mevcut tenant için `university_admin` daveti. Yetki: `platform.tenant.invite`.

```jsonc
// Body — şifre YOK
{
  "firstName": "Ayşe",
  "lastName": "Yönetici",
  "email": "ayse.yonetici@ornek.edu.tr"
}

// 201 data — bekleyen davet (token yok)
{
  "id": "...",
  "email": "...",
  "status": "pending",
  "roleName": "university_admin",
  "expiresAt": "...",
  ...
}
```

- E-posta tenant'ın kayıtlı **staff** domainlerinden biriyle eşleşmeli.
- E-posta zaten kayıtlıysa → `400 auth.emailAlreadyInUse`.
- Bekleyen davet varsa → `400 auth.invitationPendingExists`.

## `POST /api/platform/tenants/:universityId/invitations/:invitationId/cancel`

Bekleyen daveti iptal. Yetki: `platform.tenant.invite`.

```jsonc
// 200 data — iptal edilmiş davet (status: "cancelled")
```

## `POST /api/auth/accept-tenant-admin-invitation` (public)

Davet kabul — kimlik gerekmez. Tenant ve rol **token'dan** okunur.

```jsonc
// Body
{
  "token": "<maildeki token>",
  "firstName": "Ayşe",   // davet kaydıyla birebir eşleşmeli
  "lastName": "Yönetici",
  "password": "KendiSifrem123!"  // min 12 karakter
}

// 201 data — active kullanıcı (passwordHash yok)
```

## `GET /api/platform/users`

Platform hesap listesi (`users.universityId = null`). Yetki: `platform.user.view`.

```jsonc
// 200 data
[
  {
    "id": "...",
    "email": "destek@platform.local",
    "firstName": "Platform",
    "lastName": "Destek",
    "status": "active",
    "mustChangePassword": false,
    "createdAt": "...",
    "updatedAt": "...",
    "roles": ["platform_support"]
  }
]
```

## `POST /api/platform/users`

Yeni platform hesabı. Yetki: **`super_admin` rolü** (platform rolleri yalnızca super_admin atar).

```jsonc
// Body
{
  "firstName": "Operasyon",
  "lastName": "Görevlisi",
  "email": "ops@platform.local",
  "password": "EnAz12Karakter!",
  "role": "platform_support"
}

// 201 data — kullanıcı özeti + roller (passwordHash yok)
{ "id": "...", "email": "...", "roles": ["platform_support"], ... }
```

- `role`: yalnızca `super_admin` veya `platform_support`.
- Şifre en az **12** karakter (bootstrap ile aynı minimum).
- Hesap `active` + `mustChangePassword: true` doğar.
- Aynı e-posta başka platform hesabında varsa → `400 platform.userEmailAlreadyInUse`.
- Yalnızca `super_admin` platform rolleri atayabilir (`auth.rolePlatformOnly` koruması).

## Tenant durumları

| `status` | Tenant kullanıcı erişimi (Sprint 1) |
| --- | --- |
| `trial` | Normal |
| `active` | Normal |
| `past_due` | Normal (ileride kısıtlama eklenebilir) |
| `suspended` | Engellenir |

## UI guard özeti (frontend — bu repoda yok)

Rol adına yalnızca tenant seçici ve salt-okunur modda bakın; aksiyonlar permission ile:

```ts
// Menü / buton
const showTenants = can("university.create") || can("platform.tenant.manage");
const showGlobalRbac = can("role.manage"); // pratikte super_admin
const showBilling = can("billing.view");
const isReadOnly = hasRole("platform_support") && !hasRole("super_admin");

// Tenant seçici
const showTenantPicker =
  hasRole("super_admin") || hasRole("platform_support") || hasRole("platform_operator");
```

Platform hesabı oluşturma butonu: `hasRole("super_admin")` — `platform.user.manage` permission'ı yoktur.
