# 02 — Rol Yönetimi

Yönetim panelinin "Roller" sekmesi ve kullanıcıya rol atama işlevleri.
Platform rol/katalog işlemleri `role.manage` (global) ile `super_admin`'dedir;
`university_admin` kendi tenant'ının rollerini yönetir (tenant-scoped `role.manage`,
escalation korumaları `auth.service.ts`'te).

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
- `roles.universityId`: `NULL` → **global rol** (şablon), dolu → **o üniversiteye
  özel rol**. Seed'de 9 kurumsal rol global şablondur (bkz. [README §2](../README.md)).

**Cache ilişkisi:** userRoles veya rolePermissions'a her dokunuşta etkilenen
kullanıcıların effective-permission cache'i temizlenir (bkz. [README §4](../README.md)).

---

## 1. Rolleri listeleme

`GET /api/auth/roles` · yetki: `role.manage`

- `data`: tüm roller, **her rolün `permissions` dizisiyle birlikte**
  (`findAllRolesWithPermissions` → `with: { permissions: true }`). Rol↔yetki
  matrisini tek çağrıda çizmeye yeter.

```jsonc
// data: [ ... ]
{
  "id": "<uuid>", "universityId": null, "name": "university_admin", "description": "Okul Yöneticisi",
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
  için anlamlı bir rol oluşturulur. `POST /api/auth/users/:userId/roles` tenant
  doğrulaması yapar — rol yalnızca aynı tenant'ın kullanıcısına atanabilir.
  Rütbe ve escalation kuralları: [07](07-rutbe-ve-kapsam.md).

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
  değişmesi guard'ları **etkilemez** (guard'lar yetki anahtarına bakar) — tek
  istisna `enforceTenantScope`'un bypass rol listesi ve promote/demote sabitleri.
  **UYARI:** `CORE_ROLE_NAMES` içindeki çekirdek rol adlarını ve rütbelerini
  **değiştirmeyin** — kod bu adlara sabit referans verir.

---

## 4. Kullanıcıya rol atama / kaldırma

### 4a. Mevcut (hardcoded) — university_admin & super_admin

Şu an **iki global rol**, adanmış endpoint'lerle atanır. `promote-admin` içeride
`university_admin` rolünü hedefler (`ADMIN_ROLE_NAME`). Hiçbiri body almaz:

| Endpoint | Yetki | Mesaj |
|---|---|---|
| `PATCH /api/auth/users/:userId/promote-admin` | `role.manage` | `"Kullanıcı yönetici yapıldı."` (`university_admin` eklenir) |
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
  KALDIRMAZ; kullanıcı hem `student` hem `university_admin` olur.
- **Tenant:** promote-admin kullanıcının **kendi** `universityId`'sinde tenant
  yöneticisi yapar. Platform hesapları (`universityId: null`) tenant yöneticisi
  olamaz.
- **Kendini demote / son admin:** `assertNotSelfRoleRemoval` ve
  `assertNotLastAdminOfScope` backend'de korunur (bkz. [07](07-rutbe-ve-kapsam.md)).

**Senaryolar**
- **S4.1 — Yeni okul yöneticisi:** super_admin, Ege'nin bir öğretim üyesini
  `promote-admin` yapar → kullanıcı Ege admini olur, bir sonraki isteğinde
  `/api/admin/universities/<Ege>/...` çağırabilir.
- **S4.2 — Yükseltme:** admin → super_admin. `promote-super-admin` çağrılır;
  `admin` rolü **durur**, `super_admin` eklenir (union). İstenirse ayrıca
  `demote-admin` ile sadeleştirilir.
- **S4.3 — Yanlış promote geri alma:** `demote-admin` → sadece `admin` satırı
  silinir, cache temizlenir.

### 4b. Genel rol atama (advisor, student_affairs, özel roller)

`POST /api/auth/users/:userId/roles` · body: `{ "roleId": "<uuid>" }` · yetki: `role.manage`

`DELETE /api/auth/users/:userId/roles/:roleId` · yetki: `role.manage`

`GET /api/auth/users/:userId/roles` · yetki: `role.manage`

Rütbe, tenant ve escalation kuralları `auth.service.ts`'te uygulanır. Danışmanlık
tuzakları (advisor rolü olmadan danışman atanamaz; rolden çıkarınca `clubAdvisors`
dangling kalabilir) hâlâ geçerlidir — bkz. `admin.service.addAdvisor`.

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
- **S5.1 — university_admin'e üniversite yönetimi vermek:** `university_admin`
  rolüne `university.faculty.create` eklenir → **tüm** university_admin'ler
  kazanır. Yalnızca **tek** bir kullanıcıya vermek için kişi bazlı override
  kullanılır (bkz. [03](03-yetki-ve-claim-yonetimi.md)).
- **S5.2 — Yıkıcı yetkiyi geri çekme:** `university_admin` rolünden `club.delete`
  kaldırılır → hiçbir tenant yöneticisi artık kulüp silemez (yalnızca super_admin).
- **S5.3 — Özel rolü doldurma:** §2'deki `sks_officer` rolüne yalnızca
  `club.approve` eklenir → onay makamı rolü hazır olur.

---

## 6. Rol silme

`DELETE /api/auth/roles/:roleId` · yetki: `role.manage`

Çekirdek roller (`CORE_ROLE_NAMES`) silinemez. Silmeden önce `userRoles` ve
`rolePermissions` bağları temizlenir; etkilenen kullanıcıların cache'i invalidate
edilir. Silme öncesi "kim etkilenecek?" için `GET /api/auth/roles/:roleId/users`.

---

## 7. UI için özet kontrol listesi

- [ ] Rol listesi + her rolün yetkileri (matris) — `GET /api/auth/roles`
- [ ] Rol oluştur / adını-açıklamasını düzenle (çekirdek rol adlarını kilitle)
- [ ] Rol↔yetki matrisinde hücre aç/kapat — attach/detach (§5)
- [ ] Kullanıcıyı university_admin / super_admin yap-geri al (§4a)
- [ ] Genel rol ata/kaldır (§4b) — advisor, student_affairs, özel roller
- [ ] Rol sil (§6) — çekirdek roller kilitli
- [ ] Rütbe/escalation kuralları UI'da yansıtılmalı (bkz. [07](07-rutbe-ve-kapsam.md))
