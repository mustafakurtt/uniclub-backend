# 02 — Rol Yönetimi

Yönetim panelinin "Roller" sekmesi ve kullanıcıya rol atama işlevleri. Rol
işlemleri `role.manage` yetkisiyle çalışır ve **tenant-scoped değildir** →
seed'de bu yetki yalnızca `super_admin`'dedir, dolayısıyla bu sekme pratikte
**sistem yönetim panelinin** parçasıdır.

> İlgili kaynaklar: `auth.routes.ts` (#5, #6, #9, #10, #11, #12), `auth.service.ts`
> (`assignGlobalRole`/`removeGlobalRole`, `createRole`/`updateRole`/`listRoles`,
> `attach/detachPermissionFromRole`), `auth.repository.ts`, `auth.schema.ts`.

---

## 0. İlişki haritası

```
roles (id, universityId[NULL=global], name, description)
  ├── rolePermissions (M:N) ──> permissions      → rolün taşıdığı yetkiler (bkz. 03)
  └── userRoles       (M:N) ──> users            → role sahip kullanıcılar
```

- **`roles` ↔ `users`** ara tablosu `userRoles` (PK: userId+roleId). Bir kullanıcı
  birden fazla role, bir rol birden fazla kullanıcıya sahip olabilir.
- **`roles` ↔ `permissions`** ara tablosu `rolePermissions` (PK: roleId+permissionId).
- `roles.universityId`: `NULL` → **global rol** (her tenant'ta geçerli),
  dolu → **o üniversiteye özel rol**. Seed'deki 4 rolün hepsi global.

**Cache ilişkisi:** userRoles veya rolePermissions'a her dokunuşta etkilenen
kullanıcıların effective-permission cache'i temizlenir (bkz. [README §4](README.md)).

---

## 1. Rolleri listeleme

`GET /api/auth/roles` · yetki: `role.manage`

- `data`: tüm roller, **her rolün `permissions` dizisiyle birlikte**
  (`findAllRolesWithPermissions` → `with: { permissions: true }`). Rol↔yetki
  matrisini tek çağrıda çizmeye yeter.

```jsonc
// data: [ ... ]
{
  "id": "<uuid>", "universityId": null, "name": "admin", "description": "Okul Yöneticisi",
  "createdAt": "...", "updatedAt": "...",
  "permissions": [
    { "id": "<uuid>", "key": "user.manage", "description": "Kullanıcıları yönetme", ... },
    { "id": "<uuid>", "key": "club.approve", ... }
  ]
}
```

**Senaryolar**
- **S1.1 — Rol↔yetki matrisi:** Satırlar roller, sütunlar tüm permission'lar
  (`GET /api/auth/permissions`); kesişim işaretli/boş. Matristeki hücreye
  tıklayınca §5'teki attach/detach çağrılır.
- **S1.2 — Global vs tenant ayrımı:** `universityId === null` olanlar "Sistem
  Rolleri", dolu olanlar "… Üniversitesine Özel Roller" başlığı altında
  gruplanabilir (şu an hepsi global).

---

## 2. Rol oluşturma

`POST /api/auth/roles` · yetki: `role.manage`

```jsonc
{
  "name": "string (2-100)",              // zorunlu
  "description": "string (max 256, ops.)",
  "universityId": "uuid | null (ops.)"   // yoksa/null → global rol
}
```

- Başarı `201` + oluşturulan rol. Yeni rol **hiçbir yetki taşımaz**; yetkiler
  §5 ile eklenir.

**Senaryolar**
- **S2.1 — Yeni özel rol:** super_admin "SKS Görevlisi" (`sks_officer`) rolü
  oluşturur → sonra ona `club.approve` verir (§5) → sonra bir kullanıcıya
  atar (§4). Böylece kulüp başvurularını onaylayan ama kullanıcı yönetemeyen
  bir rol tanımlanmış olur. (Şema notu: `clubApplicationApprovals.step: 2`
  gibi ikinci bir onay makamı da bu şekilde temsil edilebilir.)
- **S2.2 — Tenant'a özel rol:** `universityId: <Ege.id>` verilerek yalnızca Ege
  için anlamlı bir rol oluşturulur. **DİKKAT — mevcut kısıt:** `createRole`
  gövdedeki `universityId`'yi doğrulamadan yazar; ayrıca rol **atama**
  (`assignGlobalRole`) yalnızca **global** rolleri (`findRoleByName(name, null)`)
  bulur → **tenant'a özel roller şu an bir kullanıcıya atanamaz** (atama akışı
  onları görmez). Yani tenant-scoped roller bugün "yarım" bir özelliktir;
  tam çalışması için atama tarafı genelleştirilmeli — bkz.
  [05](05-eksikler-ve-onerilen-endpointler.md).

**Doğrulama boşlukları (bilinç için):** Aynı isimde ikinci bir rol
oluşturulması engellenmez (name unique değil); `universityId`'nin gerçek bir
üniversite olduğu kontrol edilmez. UI'da benzersizlik ve geçerli tenant
seçimini kendiniz zorlayın.

---

## 3. Rol güncelleme

`PATCH /api/auth/roles/:roleId` · yetki: `role.manage`
· body: `{ "name"?, "description"? }` (en az bir alan; yoksa `400`
`"Güncellenecek en az bir alan girilmelidir."`)

- Rol yoksa `404` `"Rol bulunamadı."`
- **`universityId` güncellenemez** (şemada var ama `updateRole` yalnızca
  name/description yazar) — bir rolü sonradan başka tenant'a taşıyamazsınız.

**Senaryolar**
- **S3.1 — Yeniden adlandırma:** Görünen ad/açıklama düzeltilir. `name`
  değişmesi guard'ları **etkilemez** çünkü guard'lar rol adına değil yetki
  anahtarına bakar — tek istisna `enforceTenantScope`'un `"super_admin"` literal
  kontrolü ve `assignGlobalRole`'ün `"admin"`/`"super_admin"` sabitleridir.
  **UYARI:** `student`, `advisor`, `admin`, `super_admin` adlarını
  **değiştirmeyin** — kod bu adlara sabit referans verir (kayıt otomatik rol
  ataması, promote/demote, tenant bypass sessizce kırılır).

---

## 4. Kullanıcıya rol atama / kaldırma

### 4a. Mevcut (hardcoded) — admin & super_admin

Şu an **yalnızca** iki global rol, adanmış endpoint'lerle atanır. Hiçbiri body
almaz, başarıda `200` + sadece `message`:

| Endpoint | Yetki | Mesaj |
|---|---|---|
| `PATCH /api/auth/users/:userId/promote-admin` | `role.manage` | `"Kullanıcı yönetici yapıldı."` |
| `PATCH /api/auth/users/:userId/demote-admin` | `role.manage` | `"Kullanıcının yöneticiliği kaldırıldı."` |
| `PATCH /api/auth/users/:userId/promote-super-admin` | `role.manage` | `"Kullanıcı sistem yöneticisi yapıldı."` |
| `PATCH /api/auth/users/:userId/demote-super-admin` | `role.manage` | `"Kullanıcının sistem yöneticiliği kaldırıldı."` |

Ortak mekanik (`assignGlobalRole`/`removeGlobalRole`):
1. Kullanıcı yoksa `404` `"Kullanıcı bulunamadı."`
2. Global rol (`universityId: null`) yoksa `400` `"Global '<rol>' rolü bulunamadı."`
3. Atamada zaten sahipse `400` `"Bu kullanıcı zaten bu role sahip."`
   (Kaldırmada böyle bir kontrol yok — sahip değilse sessizce geçer.)
4. `userRoles`'a satır eklenir/silinir → **hedef kullanıcının cache'i anında
   temizlenir** → yeni yetki bir sonraki istekte geçerli.

**İlişkisel dikkatler:**
- **Roller birikir (union).** promote-admin, kullanıcının `student` rolünü
  KALDIRMAZ; kullanıcı hem `student` hem `admin` olur, yetkiler birleşir.
  demote-admin de yalnızca `admin` satırını siler, diğer rolleri korur.
- **Tenant:** promote-admin kullanıcının **kendi** `universityId`'sinde admin
  yapar (ayrı bir tenant seçilmez); admin daima kendi tenant'ının yöneticisidir.
  super_admin ise tenant'sızdır.
- **Kendini demote etme:** super_admin `demote-super-admin`'i kendi `userId`'sine
  çağırabilir → kendini yetkisiz bırakabilir (backend engellemez). "Son
  super_admin" koruması yoktur — UI'da uyarın (bkz. [05](05-eksikler-ve-onerilen-endpointler.md)).

**Senaryolar**
- **S4.1 — Yeni okul yöneticisi:** super_admin, Ege'nin bir öğretim üyesini
  `promote-admin` yapar → kullanıcı Ege admini olur, bir sonraki isteğinde
  `/api/admin/universities/<Ege>/...` çağırabilir.
- **S4.2 — Yükseltme:** admin → super_admin. `promote-super-admin` çağrılır;
  `admin` rolü **durur**, `super_admin` eklenir (union). İstenirse ayrıca
  `demote-admin` ile sadeleştirilir.
- **S4.3 — Yanlış promote geri alma:** `demote-admin` → sadece `admin` satırı
  silinir, cache temizlenir.

### 4b. Eksik — genel rol atama (advisor / özel roller)

`advisor`, `student` veya §2'de üretilen özel roller (`sks_officer` gibi) bir
kullanıcıya **atanamaz** — bunun genel bir endpoint'i yoktur. Örn. bir öğrenciyi
sonradan "advisor" yapmak ya da `sks_officer` rolünü birine vermek bugün API'de
mümkün değildir (`advisor` yalnızca kayıt anında `staff` domainiyle otomatik
gelir). Önerilen genel `POST/DELETE /api/auth/users/:userId/roles` için bkz.
[05-eksikler-ve-onerilen-endpointler.md](05-eksikler-ve-onerilen-endpointler.md).

**İlişkisel tuzak (danışmanlık):** `admin.service.addAdvisor`, bir kullanıcıyı
kulübe danışman atarken onun **`advisor` global rolüne sahip olmasını şart
koşar** (`"Danışman olarak yalnızca 'advisor' rolündeki personel atanabilir."`).
Fakat `advisor` rolünü sonradan **verecek** bir endpoint olmadığından, danışman
havuzu pratikte yalnızca `staff` e-postasıyla kaydolmuş kişilerle sınırlıdır.
Ayrıca birinden `advisor` rolü (varsayımsal olarak) alınsa bile `clubAdvisors`
satırları **otomatik silinmez** — dangling danışmanlık kalır. Bu bağ §4b
endpoint'i eklenirken düşünülmelidir.

---

## 5. Role yetki ekleme / kaldırma (rol↔yetki matrisi)

`POST /api/auth/roles/:roleId/permissions` · body: `{ "permissionId": "<uuid>" }`
· yetki: `role.manage` → `201` `"Yetki role eklendi."`

`DELETE /api/auth/roles/:roleId/permissions/:permissionId` · yetki: `role.manage`
→ `200` `"Yetki rolden kaldırıldı."`

- Rol/yetki yoksa `404` (`"Rol bulunamadı."` / `"Yetki bulunamadı."`).
- Eklemede zaten atanmışsa `400` `"Bu yetki zaten bu role atanmış."`
- **Her iki işlem de o role sahip TÜM kullanıcıların cache'ini anında temizler**
  (`findUserIdsByRole` → `invalidateUsersPermissions`) → değişiklik tüm
  kullanıcılarda hemen etkili.

**Senaryolar**
- **S5.1 — admin'e üniversite yönetimi vermek:** `admin` rolüne
  `university.faculty.create` eklenir → **tüm** admin'ler (her tenant) bu yetkiyi
  kazanır. Yalnızca **tek** bir admin'e vermek istiyorsanız rol değil kişi bazlı
  override kullanılmalı (bkz. [03](03-yetki-ve-claim-yonetimi.md)) — ama o
  endpoint henüz yok.
- **S5.2 — Yıkıcı yetkiyi geri çekme:** `admin` rolünden `club.delete` kaldırılır
  → hiçbir admin artık kulüp silemez (yalnızca super_admin). Zaten silme
  butonuna basmış açık oturumlar bir sonraki istekte `403` alır (cache temizlendi).
- **S5.3 — Özel rolü doldurma:** §2'deki `sks_officer` rolüne yalnızca
  `club.approve` eklenir → onay makamı rolü hazır olur.

---

## 6. Eksik — rol silme

`DELETE /api/auth/roles/:roleId` **yoktur.** Bir rol artık kullanılmıyorsa
silinemez; yalnızca yetkileri tek tek kaldırılıp "boş" bırakılabilir. Silme
eklenirse önce `userRoles` ve `rolePermissions` bağları temizlenmeli (FK), ve
`student/advisor/admin/super_admin` çekirdek rollerinin silinmesi engellenmelidir
— bkz. [05](05-eksikler-ve-onerilen-endpointler.md).

---

## 7. UI için özet kontrol listesi

- [ ] Rol listesi + her rolün yetkileri (matris) — `GET /api/auth/roles`
- [ ] Rol oluştur / adını-açıklamasını düzenle (çekirdek rol adlarını kilitle)
- [ ] Rol↔yetki matrisinde hücre aç/kapat — attach/detach (§5)
- [ ] Kullanıcıyı admin / super_admin yap-geri al (§4a)
- [ ] "advisor / özel rol ata" ve "rol sil" → **eksik**, [05](05-eksikler-ve-onerilen-endpointler.md)
- [ ] "Son super_admin'i düşürme" ve "kendini düşürme" için UI uyarısı
