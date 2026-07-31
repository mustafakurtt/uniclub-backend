# Oturum semantiği — `tokenVersion` iptali + self-servis şifre sıfırlama

**Durum:** Onay bekliyor (2026-07-31)  
**İlgili:** [security-core.md §1.3](security-core.md) · [schema-product.md §2.4](schema-product.md) · [planning/README.md](README.md) A2

Bu not **kod ve migration öncesi** karar kaydıdır. Onaylanmadan uygulanmayacak.

---

## Problem

Bugün JWT 7 gün geçerli; logout token'ı öldürmez, şifre değişimi diğer cihazları düşürmez. Yönetici sıfırlaması geçici şifre üretir ama eski oturumlar yaşamaya devam eder. Self-servis şifre sıfırlama yok ([schema-product §2.4](schema-product.md)).

Sistem **hibrit**: JWT kimlik taşır (`userId`, `universityId`, `exp` — rol/yetki yok); Redis yetki durumu taşır (`rbac:permissions:<userId>`, `rbac:tenant-status:<universityId>`). `/api/auth/me` hariç kimlik doğrulanmış istekler `resolveAuthz` üzerinden Redis'e gidiyor (`guard()` → `attachAuthz`, veya `requireActiveUser`).

**Hedef:** Şifre değişimi (self-servis, yönetici sıfırlama, reset linki) diğer oturumları öldürsün — **ek Redis deny-list / blocklist olmadan**, mevcut authz cache yoluna gömülerek.

---

## Önerilen mekanizma — session epoch (`tokenVersion`)

| Katman | Karar |
|---|---|
| **Kalıcılık** | `users.token_version` `integer NOT NULL DEFAULT 0` |
| **JWT claim** | `tokenVersion: number` (login ve tüm yeni token üretiminde) |
| **Karşılaştırma** | `shared/rbac/authz-policy.ts` → `enforceAuthzPolicy` içinde, `status` ve tenant askısından **sonra** üçüncü kontrol |
| **Authz snapshot** | `rbacRepository.getEffectiveRolesAndPermissions` → `AuthzContext.tokenVersion` (declaration merge `shared/rbac/authz.ts`) |
| **Invalidation** | Mevcut `invalidateUserPermissions(userId)` — **yeni anahtar yok** |

### Maliyet (ek Redis çağrısı = 0)

```
İstek → authMiddleware (JWT parse, core)
     → attachAuthz / requireActiveUser
         → resolveAuthz(userId)     ← zaten var: rbac:permissions cache veya DB
         → enforceAuthzPolicy(authz, subject)
              ├─ enforceAccountStatus (cache'teki status)
              ├─ enforceTenantStatus (tenant-status cache — ayrı anahtar, zaten var)
              └─ enforceTokenVersion   ← JWT claim vs authz.tokenVersion (DB snapshot)
```

Karşılaştırma **aynı cache okumasının** içindeki `tokenVersion` ile JWT claim'i; blocklist taraması veya ikinci `resolveAuthz` yok.

### `enforce` imzası (minimal core değişiklik)

`authMiddleware` içine koyma (ADR 0003). `configureRbac.enforce` imzasını `(authz, subject: AuthClaims) => …` genişlet; `attachAuthz` subject'i `c.get("user")` ile iletir.

**Dikkat:** `requireActiveUser` bugün `attachAuthz` yerine doğrudan `enforceAuthzPolicy(authz)` çağırıyor — JWT claim'e erişim yok. Uygulamada `enforceAuthzPolicy(authz, subject)` tek imza olmalı; hem `attachAuthz` hem `requireActiveUser` subject'i geçirir. `index.ts`'teki `configureRbac.enforce` aynı fonksiyona bağlanır.

---

## Geriye dönük uyum

| Durum | Kural |
|---|---|
| Mevcut JWT'lerde claim yok | `jwt.tokenVersion ?? 0` kabul et |
| Mevcut kullanıcılar | migration `DEFAULT 0` → deploy sonrası eski token'lar `0 === 0` geçer |
| Şifre olayı sonrası | sürüm artar → eski token'lar (claim yok veya eski sayı) **bir sonraki korumalı istekte** 401 |

**Deploy anında kitlesel çıkış yok.** İlk `tokenVersion` artışı (şifre değişimi) yalnızca o kullanıcının diğer oturumlarını düşürür.

**Geçiş penceresi:** Kalıcı kural (`?? 0`); süre sınırı gerekmez. İsteğe bağlı: 90 gün sonra claim zorunluluğu (v2) — bu turda **ertelenir**.

---

## `/api/auth/me` boşluğu

Bugün: `GET /api/auth/me` yalnızca `authMiddleware` → JWT claim yansıtır; iptal edilmiş token hâlâ `200` döner.

**Not:** `GET /api/users/me` ve alt uçları zaten `requireActiveUser` kullanıyor — `tokenVersion` kontrolü eklendiğinde bu zincir otomatik kapsanır. Boşluk yalnızca **auth** mount'undaki minimal `/me`.

**Karar:** `/api/auth/me` üzerinde **hafif politika** — `resolveAuthz` + `enforceAuthzPolicy(authz, subject)` (izin kontrolü yok). Askı → `403`; tenant askısı → `403`; `tokenVersion` uyuşmazlığı → `401` (`auth.sessionRevoked` — oturum süresi doldu ile aynı UX).

Gerekçe: Auth mount'undaki `/me` uygulama başlangıcında oturum geçerliliğini doğrulayan uç; yalnızca claim yansıtmak yeterli değil.

---

## WebSocket (açık bağlantılar)

Ticket akışı doğru (60 sn, `GETDEL` tek kullanım). Soket açıldıktan sonra **yeniden doğrulama yok** — askıya alınan kullanıcı bugün bile açık soketten bildirim alıyor; `tokenVersion` bunu büyütür.

| Seçenek | Değerlendirme |
|---|---|
| Periyodik yeniden doğrulama (heartbeat'te cache) | Doğru ama her ping'de Redis/DB; karmaşıklık |
| İptal olayında soket kapatma | **Önerilen** — invalidate sonrası `closeConnectionsForUser(userId)` (gateway `connections` map'i var; kapatma fonksiyonu eklenecek) |
| Bilinçli kabul | HTTP güvenli, WS eski oturum — tutarsız |

**Karar:** Oturum iptali turunda **invalidate → WS disconnect** bağla (askı + `tokenVersion` için ortak). Periyodik tam authz taraması **ertelenir** (Tier 2).

---

## `tokenVersion` artıran olaylar

| Olay | Artır? | Not |
|---|---|---|
| Self-servis şifre değişimi (`PATCH /me/password`) | **Evet** | Diğer cihazlar düşer |
| Self-servis reset (link) | **Evet** | A2'nin çekirdeği |
| Yönetici şifre sıfırlama (`moderation/reset-password`) | **Evet** | Bugün invalidate yok — eklenecek |
| Hesap askıya alma | **Hayır** | `status` + cache invalidate yeterli |
| Anonimleştirme | **Hayır** | `deletedAt` + rbac boşaltımı |
| Rol/izin değişimi | **Hayır** | Cache invalidate; oturum öldürme gerekmez |
| Kullanıcı “tüm oturumları kapat” | **Evet (opsiyonel)** | Şifre değiştirmeden sürüm artışı — **v1'de ertelenebilir** |

---

## Sıralama (DB ↔ cache)

Yanlış sıra eski `tokenVersion`'ı TTL boyunca cache'e yazabilir.

```
1. TRANSACTION: token_version += 1, password_hash = …, must_change_password (gerekiyorsa)
2. COMMIT
3. invalidateUserPermissions(userId)     ← commit SONRASI
4. afterCommit: mail / notifySafe       ← iş akışı düşürülmez
```

**Asla:** invalidate → commit (ters sıra cache'e eski sürümü 300 sn yazabilir).

---

## Self-servis şifre sıfırlama

### Şema — `password_resets`

| Kolon | Not |
|---|---|
| `id` | PK |
| `user_id` | FK → `users`, `onDelete: cascade` |
| `token_hash` | SHA-256 hex (64), unique — düz token yalnızca linkte |
| `expires_at` | timestamptz — öneri 1 saat |
| `used_at` | nullable — tek kullanım |
| `created_at` | append-only |

Mevcut `email_verifications` / `tenant_admin_invitations` ile **aynı hash modeli**; tablo birleştirme **yok** (farklı yaşam döngüsü).

### Endpoint'ler (öneri)

| Method | Yol | Davranış |
|---|---|---|
| `POST` | `/api/auth/forgot-password` | Sabit 200 + aynı mesaj (enumeration yok); mail yalnızca var + aktif hesapta |
| `GET` | `/api/auth/reset-password?token=` | Token geçerliliği (opsiyonel; UI için) |
| `POST` | `/api/auth/reset-password` | Token tüket + yeni şifre + `tokenVersion++` + invalidate |

Rate limit: `resend-verification` / `login` ile aynı ilke. Yeni istek önceki açık reset token'larını iptal eder (`used_at` veya satır silme — e-posta doğrulama deseni).

Mail: **commit sonrası** kuyruk (`afterCommit` / BullMQ) — kayıt başarısız olsa mail gitmez.

### Token akışı soyutlama — değerlendirme

Üç akış: e-posta doğrulama, tenant admin daveti, şifre sıfırlama.

| Ortak | Farklı |
|---|---|
| `generateOneTimeToken` + `hashToken` (`core/auth/token.ts`) | Hedef: yeni kullanıcı vs mevcut kullanıcı |
| SHA-256 hash, tek kullanım, süre | Yan etki: `active` vs provision vs şifre + epoch |
| Mail kuyruğu | Davet: ad eşleşmesi, iptal; reset: enumeration |

**Karar:** Tam akış soyutlaması **çıkarmaya değmez** — üç tablo, üç servis yolu kalır; yalnızca mevcut core token yardımcıları + repository `*ByTokenHash` deseni paylaşılır. Birleşik `tokens` tablosu migration ve sorgu karmaşıklığını artırır, kazanım düşük.

---

## Elenen alternatifler

| Alternatif | Neden elendi |
|---|---|
| Redis JWT blocklist (`revoked:<jti>`) | Ek anahtar, TTL yönetimi, her istekte ek okuma; authz cache ile çift mekanizma |
| `tokenVersion` karşılaştırması `authMiddleware` içinde | ADR 0003 — core Redis/DB bilmez |
| Deploy'da claim yok → reddet | Tüm kullanıcıları anında atar |
| Askıya almada `tokenVersion++` | `status` zaten aynı işi yapıyor; çift mekanizma |
| WS için yalnızca bilinçli kabul | Mevcut askı açığı + şifre iptali ile tutarsız |

---

## ADR etkisi

| ADR | Etki |
|---|---|
| **0003** (core taşınabilirlik) | Korunur — politika `shared/`, karşılaştırma `enforce` hook'unda; `authMiddleware` değişmez |
| **0009** (tenant-status cache) | Bağımsız eksen; `tokenVersion` tenant snapshot'a karışmaz |

---

## Migration güvenliği

- `users.token_version INTEGER NOT NULL DEFAULT 0` — mevcut satırlar 0, geriye uyumlu.
- `password_resets` yeni tablo — veri taşıma yok.
- Deploy sırası: migration → uygulama (yeni login'ler claim taşır; eski token'lar `0` ile çalışır).

---

## Uygulama sırası (onay sonrası)

1. Migration: `token_version` + `password_resets`
2. `AuthzContext.tokenVersion`, `rbacRepository`, JWT claim, `generateToken`
3. `enforceAuthzPolicy(authz, subject)` + core `enforce` imzası; `requireActiveUser` subject iletir; `/api/auth/me` politika
4. `invalidateUserPermissions` → WS disconnect
5. Şifre yollarında sıra: TX bump → commit → invalidate (`changePassword`, moderation reset)
6. Self-servis forgot/reset + testler (enumeration, rate limit, epoch, timing)
7. `security-core.md` / `schema-product.md` borç satırlarını kapat

**Bu tur:** yalnızca bu not — kod yok.
