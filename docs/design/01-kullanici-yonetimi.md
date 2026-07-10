# 01 — Kullanıcı Yönetimi

Yönetim panelinin "Kullanıcılar" sekmesi. Bu işlevlerin tamamı `user.manage`
yetkisiyle ve **tenant-scoped** olarak çalışır (admin kendi üniversitesi,
super_admin herhangi bir üniversite).

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

`GET /api/admin/universities/:universityId/users?status=<pending|active|suspended>`
· yetki: `user.manage` · tenant-scoped

- `status` opsiyonel filtre; verilmezse tüm kullanıcılar.
- Dönen her kayıt **safe user**'dır (`passwordHash` yok). **Roller/yetkiler
  dahil DEĞİLDİR** — düz kolonlar döner (`admin.repository.findUsersByUniversity`
  `with` kullanmıyor).

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
  bilgisini döndürmez. Öneri: bkz. [05](05-eksikler-ve-onerilen-endpointler.md).

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
  (eksik #2, #3 — [05](05-eksikler-ve-onerilen-endpointler.md)).
- **S2.2 — Başka tenant'ın kullanıcısını açma:** admin, kendi path'inde başka
  bir tenant'ın `userId`'sini denese bile kullanıcı kendi tenant'ında
  aranacağı için `404` alır (bilgi sızıntısı yok).

---

## 3. Kullanıcı durumu (status) yaşam döngüsü

`PATCH /api/admin/universities/:universityId/users/:userId/status`
· body: `{ "status": "pending" | "active" | "suspended" }` · yetki: `user.manage`

`user_status` enum'u ve davranışları:

| status | Anlamı | Login? | Nasıl oluşur |
|---|---|:---:|---|
| `pending` | Mail onayı bekliyor | ✅ (bilinçli, şimdilik serbest) | Kayıt anında |
| `active` | Aktif | ✅ | Mail doğrulama **veya** admin elle yapar |
| `suspended` | Askıya alınmış | ❌ (login `401`) | Admin elle yapar |

Geçişler serbesttir (herhangi bir durumdan herhangi birine); backend ek kural
koymaz — yalnızca kullanıcının varlığını doğrular, yoksa `404`.

**Senaryolar**
- **S3.1 — Manuel aktivasyon:** `pending` bir kullanıcıyı admin mail beklemeden
  `active` yapar (örn. mail ulaşmadı). Bu, e-posta doğrulama akışını **atlar**
  ama `emailVerifications` satırı `usedAt: null` kalır (temizlenmez) — zararsız,
  token yine de 24 saatte sona erer.
- **S3.2 — Askıya alma (disiplin):** admin bir öğrenciyi `suspended` yapar →
  bir sonraki login denemesinde `"Hesabınız askıya alınmıştır. Lütfen SKS
  birimiyle iletişime geçin."` (401). **Mevcut token'ı anında geçersiz KILMAZ**
  (JWT stateless); kullanıcı çıkış yapana/oturumu bitene kadar erişebilir.
  Kesin/anlık engelleme gerekiyorsa bu bir eksiktir — [05](05-eksikler-ve-onerilen-endpointler.md).
- **S3.3 — Askıdan alma:** `suspended` → `active` geri getirir.
- **S3.4 — İlişkisel kritik nokta:** Askıya alınan kullanıcı bir **kulüp
  başkanıysa** (`clubMembers.role: president`), bu satır **silinmez/değişmez**.
  Global durum ile kulüp içi rol bağımsızdır (KATMAN A vs B). Yani askıdaki
  başkan login olamaz ama kulüp hâlâ onu başkan olarak taşır. Başkanlığı
  devretmek KATMAN B'nin (kulüp yönetimi) işidir, bu panelin değil. Bir
  başkanı görevden almak isteniyorsa süreç ayrıdır — panelde uyarı gösterin.
- **S3.5 — Kendini askıya alma riski:** Backend, admin'in **kendi hesabını**
  ya da başka bir admin'i `suspended` yapmasını engellemez. UI seviyesinde
  "kendini/aynı yetkideki birini askıya alma" için onay/uyarı koyun (backend
  kısıtı için [05](05-eksikler-ve-onerilen-endpointler.md)).

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
temizliyor) tasarlanmalıdır — bkz. [05](05-eksikler-ve-onerilen-endpointler.md).

---

## 6. UI için özet kontrol listesi

- [ ] Liste + `status` filtresi (pending/active/suspended sekmeleri)
- [ ] Durum değiştir (pending→active, active↔suspended) + onay dialogu
- [ ] Bölüm ata (fakülte→bölüm kademeli seçici, tenant'a ait doğrulaması var)
- [ ] "Sil" butonu **YOK** — yerine "Askıya al"
- [ ] Detayda rol/yetki/kulüp bilgisi göstermek isteniyorsa → eksik endpoint'ler
  ([05](05-eksikler-ve-onerilen-endpointler.md)); o gelene kadar detay draweri
  yalnızca profil+durum+bölüm gösterir
- [ ] Rol atama (admin yap vb.) ayrı bir işlem → [02-rol-yonetimi.md](02-rol-yonetimi.md)
