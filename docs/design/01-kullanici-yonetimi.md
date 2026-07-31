# 01 — Kullanıcı Yönetimi

Yönetim panelinin "Kullanıcılar" sekmesi. Listeleme/görüntüleme `user.view`,
mutasyonlar (bölüm, ban/unban) `user.manage` ile **tenant-scoped** çalışır
(`university_admin` kendi üniversitesi, `super_admin`/`platform_support` çapraz-tenant).

> İlgili kaynaklar: `admin.routes.ts`, `admin.service.ts`, `admin.repository.ts`,
> `admin.schema.ts`, `shared/utils/user.util.ts` (`toSafeUser`).

---

## 0. İlişki haritası (kullanıcı kimlere bağlı?)

Bir kullanıcı yönetilirken arka planda dokunulan/dokunulmayan ilişkiler:

```
users (universityId, departmentId, status, ...)
  ├── departmentId ──> departments ──facultyId──> faculties ──universityId──> universities
  ├── userRoles       (M:N roles)        → KATMAN A rolleri     (bkz. 02)
  ├── userPermissions (M:N permissions)  → kişisel claim'ler    (bkz. 03)
  ├── clubMembers     (kulüp üyelikleri, role: member/officer/president)  → KATMAN B
  ├── clubAdvisors    (danışmanlıklar)
  ├── clubs.createdBy (kurduğu kulüpler)
  ├── clubApplications.applicantId (başvuruları)
  ├── clubApplicationApprovals.approverId (onayladıkları)
  ├── announcements.authorId, clubGallery.uploadedBy (ürettiği içerik)
  └── emailVerifications (mail doğrulama kayıtları)
```

**Bu ağ, "kullanıcı silme"nin neden desteklenmediğini açıklar** (§5). Durum
(status) değişikliği ise bu ilişkilerin hiçbirini bozmaz; sadece login/erişim
davranışını etkiler.

---

## 1. Kullanıcıları listeleme

`GET /api/admin/universities/:universityId/users?status=<pending|active|suspended>&role=<rolAdı>`
· yetki: `user.view` · tenant-scoped

- `status` opsiyonel filtre; verilmezse tüm kullanıcılar.
- Dönen her kayıt **safe user** + `roles` dizisidir (`passwordHash` yok).
  `?role=` ile global rol adına göre filtre (`admin.repository.findUsersByUniversity`).

```jsonc
// data: [ ... ]
{
  "id": "<uuid>", "universityId": "<uuid>", "departmentId": "<uuid>|null",
  "studentNumber": "250803001", "email": "...", "firstName": "...", "lastName": "...",
  "photoUrl": null, "preferredLanguage": "tr", "status": "active",
  "createdAt": "...", "updatedAt": "..."
}
```

**Senaryolar**
- **S1.1 — Mail onayı bekleyenler:** `?status=pending` → henüz e-postasını
  doğrulamamış kullanıcılar (seed: `deniz.kara@std.antalya.edu.tr`). UI'da
  "onay bekliyor" rozetiyle gösterilir; admin manuel `active` yapabilir (§3).
- **S1.2 — Askıya alınmışlar:** `?status=suspended` → login'i reddedilen
  hesaplar (seed: `fatma.sahin@std.antalya.edu.tr`).
- **S1.3 — Tenant izolasyonu:** admin `elif.demir@antalya.edu.tr` yalnızca
  Antalya `universityId`'siyle çağırabilir; Ege'nin `universityId`'sini
  koyarsa `403` `"Bu üniversiteye ait kaynaklara erişim yetkiniz
  bulunmamaktadır."`. super_admin her ikisini de çağırabilir.
- **S1.4 — (eksik) rol filtresi:** "sadece advisor'ları göster" ya da "adminleri
  göster" **şu an mümkün değil** — listeleme role göre filtrelemez ve rol
  bilgisini döndürmez. Öneri: bkz. [05](archive/05-implemented-endpoints.md).

---

## 2. Tek kullanıcıyı görüntüleme

`GET /api/admin/universities/:universityId/users/:userId`
· yetki: `user.manage` · tenant-scoped

- Kullanıcı bu üniversitede yoksa `404` `"Kullanıcı bulunamadı."`
  (`findUserInUniversity` hem `id` hem `universityId` ile arar — başka tenant'ın
  kullanıcısı "bulunamadı" gibi davranır, izolasyon burada da geçerli).
- Yine **safe user**; roller/yetkiler/üyelikler dönmez.

**Senaryolar**
- **S2.1 — Detay draweri:** Bir kullanıcıya tıklanınca profil + durum + bölüm
  gösterilir. Ancak "bu kullanıcının rolleri neler / hangi kulüplerde" bilgisi
  bu endpoint'ten **gelmez** → detay ekranı için ek endpoint gerekir
  (eksik #2, #3 — [05](archive/05-implemented-endpoints.md)).
- **S2.2 — Başka tenant'ın kullanıcısını açma:** admin, kendi path'inde başka
  bir tenant'ın `userId`'sini denese bile kullanıcı kendi tenant'ında
  aranacağı için `404` alır (bilgi sızıntısı yok).

---

## 3. Kullanıcı durumu (status) yaşam döngüsü

Durum değişikliği (ban/unban) **`/api/moderation`** altındadır — eski
`PATCH .../users/:userId/status` endpoint'i kaldırıldı.

| İşlem | Endpoint | Yetki | Body |
|---|---|---|---|
| Askıya al (ban) | `POST /api/moderation/universities/:uid/users/:userId/ban` | `user.manage` | `{ "reason": "string (3-500)" }` |
| Askıyı kaldır (unban) | `POST .../unban` | `user.manage` | — |

`user_status` enum'u ve davranışları:

| status | Anlamı | Login? | Nasıl oluşur |
|---|---|:---:|---|
| `pending` | Mail onayı bekliyor | ✅ (bilinçli, şimdilik serbest) | Kayıt anında |
| `active` | Aktif | ✅ | Mail doğrulama veya unban |
| `suspended` | Askıya alınmış | ❌ (login `401`) | Moderation ban |

Ban/unban `userModerationActions` tablosuna sebepli kayıt düşer; geçmiş
`GET .../moderation-history` ile okunur (`user.view`).

**Senaryolar**
- **S3.1 — Manuel aktivasyon:** `pending` bir kullanıcıyı admin mail beklemeden
  `active` yapar (örn. mail ulaşmadı). Bu, e-posta doğrulama akışını **atlar**
  ama `emailVerifications` satırı `usedAt: null` kalır (temizlenmez) — zararsız,
  token yine de 24 saatte sona erer.
- **S3.2 — Askıya alma (disiplin):** `university_admin` ban endpoint'ini çağırır
  → login denemesi `401`; **mevcut oturum** bir sonraki istekte `403` alır
  (`attachAuthz` / `requireActiveUser`, authz cache'deki `status`). JWT hâlâ
  geçerlidir ama korunan yüzeylere erişemez. Tam token iptali (logout/şifre
  değişimi tüm oturumları öldürsün) henüz yok — bkz.
  [security-core.md §1.3](../planning/security-core.md).
- **S3.3 — Askıdan alma:** `POST .../unban` → `status: active`.
- **S3.4 — İlişkisel kritik nokta:** Askıya alınan kullanıcı bir **kulüp
  başkanıysa** (`clubMembers.role: president`), bu satır **silinmez/değişmez**.
  Global durum ile kulüp içi rol bağımsızdır (KATMAN A vs B). Yani askıdaki
  başkan login olamaz ama kulüp hâlâ onu başkan olarak taşır. Başkanlığı
  devretmek KATMAN B'nin (kulüp yönetimi) işidir, bu panelin değil. Bir
  başkanı görevden almak isteniyorsa süreç ayrıdır — panelde uyarı gösterin.
- **S3.5 — Kendini askıya alma:** `moderationService.banUser` aktörün kendi
  `userId`'sine ban atmayı reddeder (`400` — `moderation.cannotModerateSelf`).
  Eşit/üst rütbeli kullanıcıya dokunma `auth.service` rütbe kurallarıyla
  ayrıca korunur (bkz. [07](07-rutbe-ve-kapsam.md)).

---

## 4. Kullanıcının bölümünü (department) değiştirme

`PATCH /api/admin/universities/:universityId/users/:userId/department`
· body: `{ "departmentId": "<uuid>" | null }` · yetki: `user.manage`

- `null` gönderilebilir (bölümü kaldır).
- **İlişkisel doğrulama (önemli):** `departments` tablosunda `universityId`
  **yoktur** (bilinçli tasarım). Bu yüzden servis, hedef bölümün gerçekten bu
  üniversiteye ait olduğunu `department → faculty → university` zincirinden
  doğrular. Ait değilse `400` `"Bölüm bu üniversiteye ait değil."` — böylece
  bir tenant'ın kullanıcısına başka tenant'ın bölümü atanamaz.
- Kullanıcı yoksa `404` `"Kullanıcı bulunamadı."`

**Senaryolar**
- **S4.1 — Bölüm düzeltme:** Yanlış bölüme kayıtlı öğrencinin bölümü düzeltilir.
  UI, üniversitenin **fakülte → bölüm** kademeli seçicisini kullanmalı (public
  `GET /api/universities/:uid/faculties/:fid/departments`).
- **S4.2 — Personel (advisor):** Hoca hesaplarında `departmentId` genelde
  doludur ama zorunlu değildir; `null`'a çekilebilir.
- **S4.3 — Çapraz tenant denemesi:** super_admin Antalya kullanıcısına Ege'nin
  bir bölümünü atamaya çalışırsa yine `"Bölüm bu üniversiteye ait değil."`
  alır — doğrulama super_admin için de çalışır (path'teki `universityId` baz
  alınır).

---

## 5. Kullanıcı silme neden YOK? (kasıtlı)

`DELETE .../users/:userId` **yoktur ve bilinçlidir.** Sebep §0'daki FK ağı:
`clubs.createdBy`, `clubApplications.applicantId`, `clubApplicationApprovals.approverId`,
`announcements.authorId`, `clubGallery.uploadedBy`, `clubMembers`, `clubAdvisors`,
`userRoles`, `userPermissions`, `emailVerifications` — bir kullanıcı silinirse
bu kayıtların ya FK'sı kırılır ya da beraber silinmeleri gerekir (kulübün
kurucusu, duyurunun yazarı vb. kaybolur).

**Doğru yaklaşım:** silme yerine **`suspended`** (soft-lock). İleride gerçek
bir "kullanıcıyı anonimleştir/arşivle" akışı istenirse, tıpkı kulüp silmede
olduğu gibi (`admin.repository.deleteClub` tek transaction'da yaprak kayıtları
temizliyor) tasarlanmalıdır — bkz. [05](archive/05-implemented-endpoints.md).

---

## 6. UI için özet kontrol listesi

- [ ] Liste + `status` filtresi (pending/active/suspended sekmeleri)
- [ ] Durum değiştir (pending→active, active↔suspended) + onay dialogu
- [ ] Bölüm ata (fakülte→bölüm kademeli seçici, tenant'a ait doğrulaması var)
- [ ] "Sil" butonu **YOK** — yerine "Askıya al"
- [ ] Detayda rol/yetki/kulüp bilgisi göstermek isteniyorsa → eksik endpoint'ler
  ([05](archive/05-implemented-endpoints.md)); o gelene kadar detay draweri
  yalnızca profil+durum+bölüm gösterir
- [ ] Rol atama (admin yap vb.) ayrı bir işlem → [02-rol-yonetimi.md](02-rol-yonetimi.md)
