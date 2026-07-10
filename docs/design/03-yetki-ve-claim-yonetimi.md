# 03 — Yetki (Permission / Claim) Yönetimi

Yönetim panelinin "Yetkiler" sekmesi + kişi bazlı claim override katmanı.
`permission.manage` (katalog CRUD) ve `role.manage` (role bağlama) yetkileriyle
çalışır; seed'de her ikisi de yalnızca `super_admin`'dedir → **sistem paneli**.

> İlgili kaynaklar: `auth.routes.ts` (#7, #8), `auth.service.ts`
> (`createPermission`/`listPermissions`/`updatePermission`),
> `shared/rbac/rbac.repository.ts` (effective hesap), `shared/rbac/rbac.cache.ts`,
> `*.permissions.ts` (feature katalogları).

---

## 0. "Permission" mi "Claim" mi? — Kavram haritası

Bu projede tek bir yetki modeli var; iki farklı isimle konuşulur:

- **Permission (yetki):** `permissions` tablosundaki `key` (örn. `user.manage`).
  Guard'ların aradığı şey budur.
- **Claim:** aynı `key`'in bir kullanıcının **effective setinde** bulunması.
  Bir claim iki yoldan gelir:
  1. **Rol üzerinden** — `userRoles → rolePermissions` (rolün taşıdığı yetki).
  2. **Kişiye özel** — `userPermissions.granted` (rolden bağımsız override).

```
                    ┌──────────── rolePermissions ───────────┐
 users ─ userRoles ─┤ roles                                  │─> permissions (key = "claim")
                    └────────────────────────────────────────┘
 users ─ userPermissions(granted: true → EKLE / false → ÇIKAR) ─> permissions
```

Effective (etkin) hesap = **rollerden gelenlerin birleşimi**, sonra
`userPermissions` uygulanır. Detay: [README §4](README.md).

---

## 1. Yetki (permission) kataloğu

### Kaynak: kod sabitleri + DB satırları

Her feature kendi anahtarlarını bir `*.permissions.ts` dosyasında `as const`
tutar (typo güvenliği); `seed.ts` aynı sabitleri import ederek `permissions`
tablosuna yazar. **DB asıl kaynaktır** — runtime'da yeni satır eklenebilir.

Seed ile gelen katalog (anahtar → açıklama):

| key | Açıklama | Sahibi feature |
|---|---|---|
| `user.manage` | Kullanıcıları yönetme | admin |
| `club.approve` | Kulüp başvurularını onaylama/reddetme | clubs |
| `club.update` | Kulüpleri yönetme (durum + profil) | clubs |
| `club.advisor.manage` | Kulüplere danışman atama/kaldırma | clubs |
| `club.delete` | Kulüp silme | clubs |
| `university.create/update/delete` | Üniversite CRUD | university |
| `university.domain.create/update/delete` | E-posta domaini CRUD | university |
| `university.faculty.create/update/delete` | Fakülte CRUD | university |
| `university.department.create/update/delete` | Bölüm CRUD | university |
| `role.manage` | Rol ve yetki kataloğu yönetimi | auth |
| `permission.manage` | Yetki tanımlama | auth |

**Tasarım notu:** Eski tekil anahtarlar (`club.manage`, `university.manage`)
kaynak+aksiyon bazlı **granüler** anahtarlara bölündü. Böylece bir role "kulüp
düzenleme ver ama silme verme" ya da "yalnızca fakülte ekleme" gibi ince
kontrol yapılabilir.

### Endpoint'ler

`GET /api/auth/permissions` · `permission.manage` → `data`: tüm permission satırları.

`POST /api/auth/permissions` · `permission.manage`
· body: `{ "key": "string (3-100)", "description": "string (max 256, ops.)" }`
→ `201` + oluşturulan satır. Aynı key varsa `400` `"Bu yetki anahtarı zaten mevcut."`

`PATCH /api/auth/permissions/:permissionId` · `permission.manage`
· body: `{ "description": "string (max 256)" }`
→ **Yalnızca `description` güncellenir.** `key` **bilinçli olarak
değiştirilemez** — guard çağrıları key'e sabit referans verir, key değişirse
mevcut yetki kontrolleri sessizce kırılır. Formda key'i **read-only** gösterin.
Yoksa `404` `"Yetki bulunamadı."`

**Senaryolar**
- **S1.1 — Yeni yetki tanımı:** super_admin `announcement.moderate` diye yeni
  bir anahtar oluşturur (ileride duyuru moderasyonu feature'ı için). Tek başına
  hiçbir şey yapmaz; bir role (§ [02](02-rol-yonetimi.md)#5) veya kişiye
  bağlanana kadar "boşta" durur. Backend'de o anahtarı arayan bir guard yoksa
  etkisizdir — yani permission oluşturmak, onu kullanan endpoint'i **yaratmaz**;
  yalnızca ilişki kurmaya hazır bir etiket üretir.
- **S1.2 — Açıklama düzeltme:** Bir yetkinin insan-okur açıklaması güncellenir;
  key'e dokunulmaz.
- **S1.3 — (eksik) yetki silme:** Kullanılmayan bir permission **silinemez**
  (`DELETE` yok). Silme eklenirse `rolePermissions` + `userPermissions` bağları
  ve seed çekirdek anahtarları korunmalı — [05](05-eksikler-ve-onerilen-endpointler.md).

---

## 2. Rol ↔ yetki bağlama

Bu, effective setin **birinci** kaynağıdır ve tamamı [02-rol-yonetimi.md §5](02-rol-yonetimi.md)'te
işlenir (attach/detach + tüm-kullanıcı cache invalidation). Buraya özet:

- `POST /api/auth/roles/:roleId/permissions` → role yetki ekle
- `DELETE /api/auth/roles/:roleId/permissions/:permissionId` → rolden yetki kaldır
- Etki: **o role sahip herkes** anında kazanır/kaybeder.

"Yetkiler" sekmesinden bakış: her permission satırının yanında "bu yetki hangi
rollerde?" bilgisi rol matrisinden türetilir (`GET /api/auth/roles` → her rolün
`permissions`'ı taranır). Ters yön ("bu yetkiye sahip roller/kullanıcılar")
için hazır endpoint yoktur (bkz. [05](05-eksikler-ve-onerilen-endpointler.md)).

---

## 3. Kişi bazlı yetki (claim) override — `userPermissions`

Effective setin **ikinci** kaynağı ve bu panelin **en kritik eksiği.**

### Model (var ve çalışıyor — okuma tarafında)

`userPermissions` tablosu: `(userId, permissionId, granted)`.
- `granted: true` → kullanıcıya, rolünden bağımsız, o yetkiyi **ekler**.
- `granted: false` → rolünden gelen o yetkiyi o kullanıcıda **iptal eder**
  (tombstone / kara liste).

`rbac.repository.getEffectiveRolesAndPermissions` bu satırları okur ve uygular
(önce rollerin birleşimi, sonra `granted` sırasıyla add/delete). Yani motor
**hazır**; eksik olan tek şey bu satırları **yazan bir endpoint.**

### Endpoint durumu: ❌ YOK

Şu an `userPermissions`'a satır ekleyen/silen hiçbir route yoktur. Dolayısıyla:
- Bir kullanıcıya **tek seferlik** bir yetki veremezsiniz.
- Bir kullanıcıdan rolünün getirdiği bir yetkiyi **kişiye özel** geri
  çekemezsiniz.

Önerilen endpoint'ler (`POST/DELETE /api/auth/users/:userId/permissions` +
effective görüntüleme) [05-eksikler-ve-onerilen-endpointler.md](05-eksikler-ve-onerilen-endpointler.md)'te
şema düzeyinde verilmiştir.

### Senaryolar (endpoint eklendiğinde hedeflenen davranış)

- **S3.1 — Tek admin'e ekstra yetki:** Yalnızca Antalya admini `elif.demir`'e
  `university.faculty.create` verilecek (diğer adminlere değil). Rol'e eklemek
  **tüm** adminleri etkilerdi (§2) → doğru yol `userPermissions(elif, faculty.create, granted:true)`.
  Effective sette rollerinden gelenler + bu tek yetki birleşir.
- **S3.2 — Bir admin'den yıkıcı yetkiyi alma:** `admin` rolü `club.delete`
  taşıyor ama `hulya.ozkan` (Karadeniz admini) kulüp silmesin isteniyor →
  `userPermissions(hulya, club.delete, granted:false)`. Diğer adminler silmeye
  devam eder. Effective hesapta rolden gelen `club.delete`, `granted:false` ile
  çıkarılır.
- **S3.3 — Union önceliği:** Kullanıcı hem `granted:false` (bu tablo) hem de
  rolünden `club.delete` alıyorsa **sonuç: yok** — `userPermissions` döngüsü
  rol birleşiminden **sonra** çalışır ve `false` siler. Yani kişisel override
  rolü **ezer** (mevcut motorun davranışı; UI'da "rolden geliyordu, kişisel
  olarak iptal edildi" diye gösterilebilir).
- **S3.4 — Cache:** Bu satırların yazılması da hedef kullanıcının cache'ini
  temizlemeli (öneride `invalidateUserPermissions(userId)` çağrısı zorunlu).

---

## 4. Effective (etkin) yetki listesini görme

Bir kullanıcının **sonuçta hangi yetkilere sahip olduğunu** (roller + override
uygulanmış) dışa veren endpoint **YOK** — motor hesaplıyor ama yalnızca guard
içi kullanıyor. `GET /api/users/me` sadece `roles` (rol satırları) döndürür,
permission listesi vermez.

**Pratik sonuç:**
- Yönetim panelinde bir kullanıcının "gerçek yetkileri" gösterilemiyor; yalnızca
  rolleri + (endpoint gelince) override'ları gösterilebilir, effective birleşim
  frontend'de **elle** hesaplanmak zorunda kalır (rol yetkilerini `GET /roles`'tan
  çekip birleştirerek) — hataya açık.
- Kendi UI guard'larınız için de effective liste olmadığından **rol adı bazlı**
  geçici guard kullanılır (bkz. [README §6](README.md)).

Önerilen: `GET /api/users/me/permissions` (self) ve
`GET /api/admin/.../users/:userId/effective-permissions` (yönetici) —
[05-eksikler-ve-onerilen-endpointler.md](05-eksikler-ve-onerilen-endpointler.md) öneri #1, #4.

---

## 5. UI için özet kontrol listesi

- [ ] Yetki kataloğu listesi — `GET /api/auth/permissions`
- [ ] Yetki oluştur / açıklama düzenle (key read-only) (§1)
- [ ] Rol↔yetki matrisi (§2 → [02](02-rol-yonetimi.md)#5)
- [ ] **Kişi bazlı yetki ver/al (userPermissions)** → **eksik** (§3)
- [ ] **Kullanıcının effective yetkilerini görme** → **eksik** (§4)
- [ ] Yetki silme → **eksik** (§1.3)
- [ ] Override'lı yetkiyi "rolden geldi / kişisel eklendi / kişisel iptal edildi"
  diye ayırt eden görsel dil (§3.3)
