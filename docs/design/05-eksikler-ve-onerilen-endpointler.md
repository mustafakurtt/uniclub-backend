# 05 — Eksikler ve Önerilen Endpoint'ler

Yönetim sayfasının kullanıcı/rol/claim işlevlerini **tam** yapabilmek için
backend'de bugün **olmayan** ama gereken parçalar. Her madde: neden gerekli,
önerilen sözleşme (route + şema + davranış), ilişkisel/güvenlik notları.

> Öneriler mevcut mimariye uyar: `guard()` zinciri, `{ success, message, data }`
> zarfı, Türkçe mesajlar, `*.permissions.ts` sabitleri, cache invalidation
> (`invalidateUserPermissions`/`invalidateUsersPermissions`).

Önem sırası (panelin çalışması için kabaca): **#1 → #2 → #4 → #3 → #6 → #5 → #7 → #8**.

---

## ✅ DURUM (Temmuz 2026): #7 hariç hepsi uygulandı

Aşağıdaki maddeler koda geçirildi ve **canlı sunucuda gerçek DB ile uçtan uca
doğrulandı** (rol atama, kişisel override, effective yansıması, silme + FK
temizliği, tüm koruma kuralları). Yeni endpoint referansı:

| # | Endpoint | Metod | Yetki | Not |
|---|---|---|---|---|
| 1 | `/api/users/me/permissions` | GET | Bearer | self effective `{ roles, permissions }` |
| 1 | `/api/admin/universities/:uid/users/:userId/effective-permissions` | GET | `user.manage` (tenant) | yönetici görünümü |
| 2 | `/api/auth/users/:userId/permissions` | GET | `permission.manage` | kişisel override listesi |
| 2 | `/api/auth/users/:userId/permissions` | POST | `permission.manage` | body `{ permissionId? \| key?, granted }` (upsert) |
| 2 | `/api/auth/users/:userId/permissions/:permissionId` | DELETE | `permission.manage` | override'ı kaldır |
| 3 | `/api/auth/users/:userId/roles` | GET | `role.manage` | kullanıcının rolleri |
| 3 | `/api/auth/users/:userId/roles` | POST | `role.manage` | body `{ roleId }` (tenant rol doğrulaması) |
| 3 | `/api/auth/users/:userId/roles/:roleId` | DELETE | `role.manage` | son super_admin korumalı |
| 4 | `/api/admin/universities/:uid/users` | GET | `user.manage` (tenant) | `?role=` filtresi + satırda `roles` |
| 4 | `/api/admin/universities/:uid/users/:userId` | GET | `user.manage` (tenant) | + roller, `clubMemberships`, `permissionOverrides`, `effectivePermissions` |
| 5 | `/api/auth/roles/:roleId` | DELETE | `role.manage` | çekirdek roller silinemez; `userRoles`+`rolePermissions` temizlenir |
| 5 | `/api/auth/permissions/:permissionId` | DELETE | `permission.manage` | seed yetkileri silinemez; `rolePermissions`+`userPermissions` temizlenir |
| 8 | `/api/auth/roles/:roleId/users` | GET | `role.manage` | role sahip kullanıcılar |
| 8 | `/api/auth/permissions/:permissionId/roles` | GET | `permission.manage` | yetkiyi taşıyan roller |

**#6 korumalar** ayrı endpoint değil, mevcut servislere eklendi:
`"Sistemdeki son sistem yöneticisi görevden alınamaz."`,
`"Kendi hesabınızı askıya alamazsınız."`,
`"Sistem rolünün adı değiştirilemez."`,
`"Sistem rolü silinemez."`, `"Sistem yetkisi silinemez."`.

**Kalan tek madde: #7** (askıya alma → anlık JWT geçersizleştirme) — mimari
karar gerektirdiği için bilinçli olarak ertelendi (aşağıda).

---

---

## #1 — Effective (etkin) yetki listesini dışa verme  ⭐ en kritik

**Sorun:** Motor effective permission'ı hesaplıyor ama hiçbir endpoint dışa
vermiyor. UI göster/gizle kararları rol adına mahkûm; yönetici bir kullanıcının
"gerçek yetkileri"ni göremiyor (bkz. [03 §4](03-yetki-ve-claim-yonetimi.md)).

**Öneri A — self:**
```
GET /api/users/me/permissions            (Bearer)
→ data: { roles: string[], permissions: string[] }   // getEffectiveRolesAndPermissions çıktısı
```
(Alternatif: `GET /api/users/me` response'una `permissions: string[]` eklemek.)

**Öneri B — yönetici:**
```
GET /api/admin/universities/:universityId/users/:userId/effective-permissions
    · yetki: user.manage · tenant-scoped
→ data: { roles: string[], permissions: string[] }
```

**Not:** Hesap zaten `rbacRepository.getEffectiveRolesAndPermissions(userId)` ile
var; endpoint sadece onu sarmalar (cache'li `getEffectivePermissions` de
kullanılabilir). Bu tek ekleme, [README §6](README.md)'daki "rol adı bazlı geçici
guard" borcunu kapatır.

---

## #2 — Kişi bazlı yetki (claim) ver/al — `userPermissions` yazma  ⭐

**Sorun:** `userPermissions.granted` motor tarafından okunuyor ama yazan
endpoint yok → "tek kullanıcıya ekstra yetki" / "tek kullanıcıdan yetki geri
çekme" imkânsız (senaryolar S-C, S-D).

**Öneri:**
```
POST   /api/auth/users/:userId/permissions        · yetki: permission.manage
  body: { "permissionId": "<uuid>", "granted": true }   // veya key ile
  → upsert userPermissions(userId, permissionId, granted)

DELETE /api/auth/users/:userId/permissions/:permissionId  · yetki: permission.manage
  → override satırını sil (yetki tekrar role göre belirlenir)

GET    /api/auth/users/:userId/permissions        · yetki: permission.manage
  → data: userPermissions satırları (granted true/false ayrımıyla)
```

**Davranış / ilişki notları:**
- Yazma/silme sonrası **`invalidateUserPermissions(userId)` zorunlu.**
- `granted: false` bir "tombstone"dır: rolden geleni ezer (effective döngüsü
  rol birleşiminden sonra çalışır, bkz. [03 §3.3](03-yetki-ve-claim-yonetimi.md)).
- `(userId, permissionId)` PK → aynı çift ikinci kez yazılırsa update olmalı
  (upsert), yeni satır değil.
- Yetki seçimi `key` ile de kabul edilebilir (UI kolaylığı) — o zaman
  `findPermissionByKey` ile id'ye çevrilir; yoksa `404 "Yetki bulunamadı."`.

---

## #3 — Genel rol atama / kaldırma (advisor ve özel roller)

**Sorun:** Yalnızca `admin`/`super_admin` hardcoded promote var; `advisor` veya
runtime'da üretilen özel roller (`sks_officer`) bir kullanıcıya atanamıyor
(senaryolar S-B, S-F).

**Öneri:**
```
POST   /api/auth/users/:userId/roles          · yetki: role.manage
  body: { "roleId": "<uuid>" }
DELETE /api/auth/users/:userId/roles/:roleId  · yetki: role.manage
GET    /api/auth/users/:userId/roles          · yetki: role.manage
  → data: kullanıcının userRoles → roles satırları
```

**Davranış / ilişki notları:**
- `assignGlobalRole`/`removeGlobalRole` mantığı genelleştirilir (rol adı sabiti
  yerine `roleId`). Mevcut `promote-admin` vb. bunun üstüne ince sarmalayıcı
  olarak kalabilir (geri uyumluluk).
- **Tenant doğrulaması (yeni):** rol tenant'a özelse (`roles.universityId != null`),
  yalnızca aynı tenant'ın kullanıcısına atanabilmeli; aksi halde
  `"Bu rol bu üniversiteye ait değil."`. Böylece [02 §2 S2.2](02-rol-yonetimi.md)'deki
  "yarım tenant rol" özelliği tamamlanır.
- Zaten sahipse `"Bu kullanıcı zaten bu role sahip."`; sonrası cache invalidate.
- **Danışmanlık bağı:** biri `advisor` rolünden çıkarılırken, o kişinin
  `clubAdvisors` satırları **dangling** kalır. Ya kaldırma engellenir ("önce
  danışmanlıklarını kaldırın") ya da uyarı gösterilir.

---

## #4 — Yöneticinin gördüğü kullanıcı detayına rol/üyelik ekleme

**Sorun:** `admin` listUsers/getUser **safe user** döner; roller, kişisel
override'lar, kulüp üyelikleri yok → detay draweri boş kalıyor
([01 §2](01-kullanici-yonetimi.md)).

**Öneri:** `GET /api/admin/universities/:universityId/users/:userId` yanıtını
zenginleştir (veya ayrı `/detail`):
```
data: {
  ...safeUser,
  roles: [{ id, name, description, universityId }],
  clubMemberships: [{ clubId, clubName, role, status }],   // KATMAN B özeti
  effectivePermissions: string[]                            // #1 ile birlikte
}
```
`admin.repository` zaten `db.query.users.findFirst({ with: {...} })` kullanabilir
(relations.ts hazır: `roles`, `clubMemberships`, `userPermissions`).

**Liste tarafı:** `GET .../users` için opsiyonel `?role=advisor` filtresi ve
her satırda `roleNames: string[]` → [01 §S1.4](01-kullanici-yonetimi.md).

---

## #5 — Rol / yetki silme

**Sorun:** `roles` ve `permissions` için yalnızca oluştur/güncelle var; silme yok
([02 §6](02-rol-yonetimi.md), [03 §1.3](03-yetki-ve-claim-yonetimi.md)).

**Öneri:**
```
DELETE /api/auth/roles/:roleId              · yetki: role.manage
DELETE /api/auth/permissions/:permissionId  · yetki: permission.manage
```
**Zorunlu korumalar:**
- **Çekirdek varlıklar korunmalı:** `student/advisor/admin/super_admin` rolleri
  ve seed permission anahtarları silinemez (kod bunlara sabit referans verir).
- **FK temizliği tek transaction'da:** rol silinmeden `userRoles` +
  `rolePermissions`; yetki silinmeden `rolePermissions` + `userPermissions`
  bağları silinir (tıpkı `deleteClub`'ın yaptığı gibi).
- Etkilenen kullanıcıların cache'i invalidate edilir.
- Alternatif (daha güvenli): silme yerine "arşiv/pasif" bayrağı — ama şemada
  şu an böyle bir kolon yok.

---

## #6 — "Kendi ayağına sıkma" korumaları

**Sorun:** Backend; son super_admin'in düşürülmesini, admin'in kendini askıya
almasını, çekirdek rol adının değiştirilmesini engellemiyor (senaryo S-H).

**Öneri (servis seviyesi kurallar):**
- `demote-super-admin` / rol kaldırma: sistemde **başka super_admin yoksa**
  reddet → `"Sistemdeki son sistem yöneticisi görevden alınamaz."`
- Durum değiştirme: `actor.userId === targetUserId && status === "suspended"`
  reddet → `"Kendi hesabınızı askıya alamazsınız."`
- Rol güncelleme: `name`, çekirdek rol adlarından biriyse değişime izin verme →
  `"Sistem rolünün adı değiştirilemez."`
- (UI ayrıca bu işlemlerde ekstra onay göstermeli — ama güvenlik backend'de.)

---

## #7 — Askıya alma → anlık erişim kesme (JWT invalidation)

**Sorun:** `suspended` yapılan kullanıcının mevcut JWT'si süresi dolana dek
çalışır (stateless), anlık kesilmez ([01 §S3.2](01-kullanici-yonetimi.md), S-E).

**Öneri (biri):**
- `authMiddleware`'e hafif bir `users.status` kontrolü eklemek (her istekte
  `suspended` ise `401`) — ekstra DB/cache okuması getirir ama kesindir; ya da
- Redis'te bir "token denylist / tokenVersion" tutup askıda artırmak.
  Karar performans/kesinlik dengesine göre verilmeli.

---

## #8 — Rol/yetki için ters yön listelemeler (raporlama)

**Sorun:** "Bu role sahip kullanıcılar", "bu yetkiye sahip roller/kullanıcılar"
gibi ters sorgular endpoint olarak yok (yalnızca iç `findUserIdsByRole` var).

**Öneri:**
```
GET /api/auth/roles/:roleId/users            · role.manage   → role sahip kullanıcılar
GET /api/auth/permissions/:permissionId/roles · permission.manage → yetkiyi taşıyan roller
```
Yönetim panelinde "bir rolü/yetkiyi kaldırmadan önce kim etkilenecek?" görünürlüğü
için değerli (özellikle #5 silme öncesi).

---

## Özet öncelik tablosu

| # | Eksik | Etki | Zorluk |
|---|---|---|---|
| 1 | Effective yetki dışa verme | UI guard'ı düzelir, tüm panel netleşir | Düşük (motor hazır) |
| 2 | Kişi bazlı claim ver/al | Kişiye özel yetki senaryoları açılır | Orta |
| 3 | Genel rol atama/kaldırma | advisor + özel roller kullanılabilir olur | Orta |
| 4 | Detay/liste zenginleştirme | Kullanıcı detay ekranı gerçekten dolu olur | Düşük (relations hazır) |
| 5 | Rol/yetki silme | Katalog temizliği | Orta (FK + koruma) |
| 6 | Kendine zarar korumaları | Operasyonel güvenlik | Düşük |
| 7 | Anlık erişim kesme | Askı gerçekten anlık olur | Orta (perf dengesi) |
| 8 | Ters yön listelemeler | Silme öncesi görünürlük/raporlama | Düşük |

> Bu 8 madde tamamlandığında yönetim sayfası; kullanıcı yaşam döngüsü + rol
> atama + rol↔yetki matrisi + kişi bazlı claim override + effective görünürlük +
> güvenlik korumalarının hepsini kapsar. Mevcut mimariyi (guard, tenant scope,
> cache, Türkçe mesaj, feature-bazlı permission sabitleri) hiç bozmadan eklenir.
