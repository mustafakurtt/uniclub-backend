# Auth & Guard Rehberi — Frontend (React) İçin

Bu doküman, frontend ekibinin **route/UI guard altyapısını** nasıl kuracağına dair somut bir mimari önerisi ve backend'in şu an neyi verip neyi vermediğinin net dökümüdür. Endpoint detayları ve request/response şemaları için `docs/FRONTEND_AUTH_RBAC.md` (auth/RBAC + ilk 3 feature, örnekli) ve `docs/API.md` (tüm endpoint kataloğu) dokümanlarına bakın.

## İçindekiler

- [1. Sistemin zihinsel modeli](#1-sistemin-zihinsel-modeli)
- [2. Backend şu an neyi veriyor, neyi vermiyor](#2-backend-şu-an-neyi-veriyor-neyi-vermiyor)
- [3. Backend'de önerilen ek (permission bazlı guard için gerekli)](#3-backendde-önerilen-ek-permission-bazlı-guard-için-gerekli)
- [4. Frontend guard mimarisi önerisi](#4-frontend-guard-mimarisi-önerisi)
- [5. Rol/izin matrisi](#5-rolizin-matrisi)
- [6. Hata durumları ve UX kuralları](#6-hata-durumları-ve-ux-kuralları)
- [7. Altın kural](#7-altın-kural)

---

## 1. Sistemin zihinsel modeli

İki **birbirinden tamamen bağımsız** yetki katmanı var. Frontend'de de bunları karıştırmayan iki ayrı guard mekanizması kurulmalı.

```
┌─────────────────────────────────────────────────────────┐
│  KATMAN A — Global Claim-Based RBAC (üniversite geneli)  │
│  roles: student | advisor | admin | super_admin          │
│  permissions: user.manage, club.approve, club.manage,    │
│               university.manage, role.manage,            │
│               permission.manage                          │
│  Kaynak: userRoles + userPermissions (override) tabloları│
│  Kapsam: /api/admin/*, /api/auth'un yönetim rotaları,    │
│          /api/universities'in yazma rotaları             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  KATMAN B — Kulüp bazlı rol (her kulüpte ayrı)            │
│  role: member | officer | president                      │
│  Kaynak: clubMembers.role (status: approved olmalı)       │
│  Kapsam: /api/clubs/:clubId/* (join-requests, members,    │
│          announcements, gallery, contact-links)           │
└─────────────────────────────────────────────────────────┘
```

Bir kullanıcı aynı anda hem global `student` rolüne hem de bir kulüpte `president` rolüne sahip olabilir — bu iki bilgi birbirinden türetilemez, ayrı ayrı sorgulanmalı/tutulmalı.

Backend tarafında Katman A kontrolleri tek bir `guard(permissionKey, { tenantScoped? })` zinciriyle yapılır (`authMiddleware → attachAuthz → requirePermission → enforceTenantScope?`), Katman B kontrolleri `requireClubOfficer` / `requireClubPresident` middleware'leriyle yapılır. Gerçek yetki kontrolü **her zaman backend'dedir**; frontend'deki guard'lar sadece **UX** içindir: yetkisiz kullanıcıya buton/menü göstermemek, 403'e düşmeden önce yönlendirmek.

## 2. Backend şu an neyi veriyor, neyi vermiyor

| Bilgi | Nereden gelir | Durum |
|---|---|---|
| `userId`, `universityId` | JWT payload (her istekte) + `GET /api/auth/me` | ✅ Var |
| Global roller (`["student"]` gibi) | `GET /api/users/me` → `data.roles[]` (rol objeleri, `name` alanıyla) | ✅ Var |
| Global **effective permissions** (flatten edilmiş, `userPermissions` override'ları uygulanmış hâli — örn. `["club.manage", "user.manage"]`) | — | ❌ **Yok.** Bu hesaplama backend'de zaten var (`rbacRepository.getEffectiveRolesAndPermissions`, Redis'te 5 dk cache — `getEffectivePermissions`) ama **hiçbir HTTP endpoint'i bu veriyi dışarı vermiyor.** Sadece middleware zincirinde (`attachAuthz`) sunucu içi kullanılıyor. |
| Kulüp bazlı rol (belirli bir kulüpte `member/officer/president`) | `GET /api/users/me/clubs` → her satırda `role`, `status` | ✅ Var (üye olunan tüm kulüpler için; pending istekler de gelir) |

**Sonuç:** Frontend, "bu kullanıcı `club.approve` yetkisine sahip mi, admin panelini göstereyim mi?" sorusunun cevabını şu an **hiçbir API çağrısıyla alamıyor**. Elde tek workaround: `data.roles` içindeki rol isimlerine bakıp (`"admin"`, `"super_admin"`) frontend tarafında **hardcoded** bir eşleme yapmak — ki bu, permission tabanlı sistemin amacını (rolleri değiştirmeden yetkileri esnekçe yönetebilmek) baştan geçersiz kılar ve backend'de bir rolün permission'ları değiştiğinde frontend'in bundan haberi olmaz.

## 3. Backend'de önerilen ek (permission bazlı guard için gerekli)

Guard altyapısını doğru kurmak için önerim: `GET /api/users/me` (ya da `GET /api/auth/me`) response'una `authz` alanı eklemek. Gerekli parçalar zaten mevcut, tek eksik olan bunları bir route'a bağlamak:

```jsonc
// GET /api/users/me — önerilen ek alan
{
  "success": true,
  "data": {
    // ...mevcut alanlar (id, email, firstName, roles, ...)
    "authz": {
      "roles": ["admin"],
      "permissions": ["user.manage", "club.approve", "club.manage"]
    }
  }
}
```

Uygulaması: route handler'da `getEffectivePermissions(user.userId)` (`src/shared/rbac/rbac.cache.ts`) çağrılıp sonuç response'a eklenir — mevcut `rbac.middleware.ts` zaten aynı fonksiyonu kullanıyor, tekrar kod yazmaya gerek yok.

**Cache/güncellik notu:** Bu veri Redis'te 5 dk cache'lidir, ancak rol/izin değiştiren tüm mevcut akışlar (promote/demote admin & super-admin, role permission ekleme/çıkarma) etkilenen kullanıcıların cache'ini **anında invalidate ediyor** (`invalidateUserPermissions` / `invalidateUsersPermissions`). Yani bu endpoint eklendiğinde döneceği veri her zaman günceldir; tek gecikme, hedef kullanıcının açık frontend oturumunun bu endpoint'i yeniden çağırmasına kadar geçen süredir (refresh/yeniden login/periyodik yenileme ile çözülür).

Bu ekleme yapılana kadar frontend'de admin/super-admin gibi ekranları göstermek için **geçici olarak** `data.roles` içindeki rol adlarına bakabilirsiniz, ama bunun bir borç (tech debt) olduğunu ve permission bazlı guard'a geçişte değişeceğini kodda not düşün — rol adı kontrolünü tek bir yardımcı fonksiyonda toplayın ki geçiş tek noktadan yapılsın.

## 4. Frontend guard mimarisi önerisi

### 4.1. AuthContext

Login sonrası state'e şunlar yazılmalı: `token`, `user` (profil), `roles: string[]`, `permissions: string[]` (madde 3 uygulandıktan sonra), `clubMemberships: { clubId, role, status }[]` (`/api/users/me/clubs`'tan).

```tsx
type AuthState = {
  token: string | null;
  user: SafeUser | null;
  roles: string[];                 // GET /api/users/me → data.roles.map(r => r.name)
  permissions: string[];           // madde 3'teki ek geldiğinde dolacak
  clubMemberships: { clubId: string; role: "member" | "officer" | "president"; status: string }[];
};
```

- Token'ı `localStorage`'da tutmak XSS riskine açıktır; mümkünse backend'de httpOnly cookie'ye geçiş değerlendirilebilir — ama bu backend değişikliği gerektirir (şu an login sadece JSON body'de token döndürüyor). Kısa vadede `localStorage` kabul edilebilir bir başlangıçtır. Token 7 gün geçerlidir ve refresh mekanizması yoktur — süre dolunca 401 alınır, login'e yönlendirilir.
- Uygulama açılışında token varsa `GET /api/users/me` (+ `GET /api/users/me/clubs`) çağrılıp state doldurulur; 401 dönerse token silinip login'e yönlendirilir.

### 4.2. Global permission/role guard'ları

```tsx
function useAuthz() {
  const { roles, permissions } = useAuth();
  return {
    hasRole: (role: string) => roles.includes(role),
    hasPermission: (key: string) => permissions.includes(key),
  };
}

// Route seviyesi
<RequirePermission permission="club.approve" fallback={<Forbidden />}>
  <ClubApplicationsPage />
</RequirePermission>

// Buton/menü seviyesi (fallback'siz, sadece render etmeme)
{hasPermission("club.manage") && <EditClubButton />}
```

`super_admin` özel durum: backend'de `enforceTenantScope` bu rolü bypass ediyor (herhangi bir üniversiteyi hedefleyebilir). Frontend'de super-admin panelinde üniversite seçici gösterilecekse bu ayrımı unutmayın — normal `admin` sadece kendi üniversitesini yönetebilir (path'teki `:universityId` her zaman kendi `universityId`'si olmalı, aksi halde 403).

### 4.3. Kulüp bazlı guard

Bu, global permission listesinden **bağımsız** çalışmalı — `clubMemberships` state'inden `clubId`'ye göre bakılır:

```tsx
function useClubRole(clubId: string) {
  const { clubMemberships } = useAuth();
  const membership = clubMemberships.find(
    (m) => m.clubId === clubId && m.status === "approved"
  );
  return membership?.role ?? null; // null = üye değil / onaylı değil
}

const role = useClubRole(clubId);
const isOfficerOrPresident = role === "officer" || role === "president";
const isPresident = role === "president";
```

Bir kulübe ait ekrana girildiğinde (örn. kulüp yönetim paneli) `clubMemberships` state'i güncel olmayabilir (kullanıcı sonradan üye/officer olmuş olabilir) — kulüp detay sayfasına girişte `GET /api/clubs/:clubId` çağrısının döndürdüğü `clubMembers` listesinden kendi satırınızı bulup taze veriyle karşılaştırmak daha güvenlidir; sadece login-time snapshot'a güvenmeyin. (Not: kulüp detayındaki `clubMembers` yalnızca `approved` üyeleri içerir — kendi pending isteğinizi orada göremezsiniz, onun için `/api/users/me/clubs` kullanın.)

### 4.4. Route koruma katmanı

Üç seviye:
1. **Authenticated route** — token yoksa `/login`'e yönlendir.
2. **Role/permission route** — `RequirePermission`/`RequireRole` ile sarılır, yetkisizse 403 sayfası veya ana sayfaya yönlendirme.
3. **Club-scoped route** — `useClubRole(clubId)` ile kontrol edilir, `clubId` URL param'ından okunur.

## 5. Rol/izin matrisi

Seed verisine göre (`src/db/seed.ts`) mevcut atamalar:

| Global rol | Sahip olduğu permission'lar | Not |
|---|---|---|
| `student` | (yok) | Kayıt sırasında `student` domain tipiyle otomatik atanır |
| `advisor` | (yok) | Kayıt sırasında `staff` domain tipiyle otomatik atanır; kulüp danışmanlığı (`clubAdvisors`) ayrı bir ilişki, bu rolün permission'ı değil |
| `admin` | `user.manage`, `club.approve`, `club.manage` | Kendi üniversitesiyle sınırlı (`enforceTenantScope`) |
| `super_admin` | Tüm permission'lar (`university.manage`, `role.manage`, `permission.manage` dahil) | Tenant scope bypass |

| Kulüp rolü | Yetkiler |
|---|---|
| `member` | Sadece görüntüleme, kendi üyeliğinden ayrılma |
| `officer` | + üyelik isteklerini onaylama/reddetme, üye çıkarma, duyuru/galeri/iletişim linki ekleme-silme |
| `president` | + üye rolünü değiştirme (member↔officer); president kendisi çıkarılamaz/ayrılamaz |

Bu tablo seed'deki başlangıç durumudur; roller ve permission'lar `role.manage`/`permission.manage` endpoint'leri (`/api/auth/roles`, `/api/auth/permissions`) üzerinden runtime'da değişebilir — bu yüzden frontend'de bu eşlemeyi **hardcode etmeyin**, madde 3'teki `authz` alanı geldiğinde gerçek veriye göre karar verin.

## 6. Hata durumları ve UX kuralları

Backend her hatada aynı zarfı döner: `{ success: false, message, code?, details?, requestId }`. `message` isteğin diline göre çevrilir (`Accept-Language: tr|en`); **mantığı mesaj metnine değil `code`/HTTP status'a bağlayın**.

| HTTP status | Anlamı | Frontend davranışı |
|---|---|---|
| `401` | Token yok / geçersiz / süresi dolmuş | Token'ı temizle, `/login`'e yönlendir, `message`'ı göster ("Oturum süreniz dolmuş...") |
| `403` | Kimlik doğru ama yetki yok (permission/tenant scope/club role) | `message`'ı doğrudan kullanıcıya göster (zaten Türkçe ve anlaşılır) — ayrı bir generic "yetkisiz" metni yazmaya gerek yok |
| `404` | Kaynak bulunamadı (`message` içinde "bulunamadı" geçtiği için backend bunu 404'e çeviriyor) | Standart "bulunamadı" ekranı |
| `400` | Doğrulama (`code: "VALIDATION_ERROR"` + `details[]`) veya iş kuralı ihlali | `details` varsa alan-bazlı (`details[].path`), yoksa `message`'ı inline/toast göster |

`403` aldığınızda bunun global permission mı yoksa kulüp rolü mü kaynaklı olduğunu ayırt etmenize gerek yok — backend mesajı zaten hangisi olduğunu Türkçe açıklıyor: `"Bu işlem için yetkiniz bulunmamaktadır."` (permission), `"Bu üniversiteye ait kaynaklara erişim yetkiniz bulunmamaktadır."` (tenant scope), `"Bu işlem için kulüp yöneticisi (başkan/officer) olmalısınız."` / `"Bu işlem için kulüp başkanı olmalısınız."` (kulüp rolü).

**Rol/izin değişikliklerinin görünürlüğü:** Bir admin, bir kullanıcının rolünü değiştirdiğinde backend cache'i anında temizler — hedef kullanıcının **sonraki API istekleri** yeni yetkilerle değerlendirilir. Ancak hedef kullanıcının açık React oturumundaki `roles`/`permissions` state'i kendiliğinden güncellenmez; sayfa yenileme, yeniden login veya periyodik `GET /api/users/me` yenilemesi gerekir. Kritik bir senaryo değilse "kullanıcı bir sonraki girişinde görür" davranışı yeterlidir.

## 7. Altın kural

> Frontend guard'ları sadece deneyimi iyileştirir; **güvenlik sınırı değildir**. Her yetki kontrolü backend'de tekrar yapılır ve asıl doğrulama oradadır. Frontend'de bir butonu gizlemek, o endpoint'i güvenli hale getirmez — endpoint zaten kendi middleware zincirinde korunmalıdır (ve mevcut kod tabanında öyledir). Bu yüzden tüm API çağrılarında `401/403`'ü merkezi bir interceptor'da ele alın; guard'ların kaçırdığı durumlar orada yakalanır.
