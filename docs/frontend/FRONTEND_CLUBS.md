# Clubs Katmanı — Frontend Entegrasyon Dokümanı

**Kapsam:** `clubs` feature'ının (`/api/clubs`) ve ilişkili yüzeylerin tam referansı — kulüp keşfi/üyeliği (öğrenci), kulüp-içi yönetim (officer/başkan), danışman (advisor) yetkileri, kulüp kurma **başvuruları** ve okul yöneticisinin (admin/super_admin) kulüp yönetimi. Alt-kaynaklar (duyurular, galeri) ve `users` self-service'in kulüple ilgili uçları da buradadır.

> Bu doküman kod tabanından birebir doğrulanmıştır (endpoint'ler canlı sunucuda test edildi). Backend'in tüm `message` alanları **Türkçedir** — UI'da doğrudan gösterilebilir. Özet katalog için `docs/API.md §4-7`, tenant/üniversite yönetimi için `docs/FRONTEND_UNIVERSITY.md`, Auth/RBAC için `docs/FRONTEND_AUTH_RBAC.md`'ye bakın.

---

## İçindekiler

- [1. Aktörler ve İki Yetki Katmanı](#1-aktörler-ve-i̇ki-yetki-katmanı)
- [2. Roller ve Nasıl Yönetildikleri](#2-roller-ve-nasıl-yönetildikleri)
- [3. Ortak Kurallar](#3-ortak-kurallar)
- [4. Kulüp Yaşam Döngüsü (durumlar)](#4-kulüp-yaşam-döngüsü-durumlar)
- [5. Keşif ve Üyelik (her üye)](#5-keşif-ve-üyelik-her-üye)
- [6. Kulüp Kurma Başvuruları (başvuran)](#6-kulüp-kurma-başvuruları-başvuran)
- [7. Kulüp-içi Üyelik Yönetimi (officer / başkan)](#7-kulüp-içi-üyelik-yönetimi-officer--başkan)
- [8. Kulüp Profili ve İletişim Linkleri (başkan / officer)](#8-kulüp-profili-ve-i̇letişim-linkleri-başkan--officer)
- [9. Duyurular ve Galeri (alt-kaynaklar)](#9-duyurular-ve-galeri-alt-kaynaklar)
- [10. Danışman (advisor) Akışı](#10-danışman-advisor-akışı)
- [11. Okul Yöneticisi (admin) Kulüp Yönetimi](#11-okul-yöneticisi-admin-kulüp-yönetimi)
- [12. Yetki (Permission) Modeli — Granüler `club.*`](#12-yetki-permission-modeli--granüler-club)
- [13. Uçtan Uca Senaryolar](#13-uçtan-uca-senaryolar)
- [14. Hata Durumları Sözlüğü](#14-hata-durumları-sözlüğü)

---

## 1. Aktörler ve İki Yetki Katmanı

Kulüp yüzeyi **iki bağımsız yetki katmanı** kullanır — karıştırılmamalı:

| Katman | Neyi kontrol eder | Nasıl çözülür |
|---|---|---|
| **Global RBAC** (`roles`/`permissions`) | Tenant çapında yönetim: başvuru onayı, kulüp silme, durum, danışman atama | `guard()` → `requirePermission("club.*")` (+ tenant scope) |
| **Kulüp-içi rol** (`clubMembers.role` + danışmanlık) | Belirli BİR kulübün içindeki işler: üye alma/çıkarma, rol, profil, içerik | `club.middleware` (o kulüpteki role bakar), permission KULLANMAZ |

Aktörler:

| Aktör | Kaynağı | Tipik işleri |
|---|---|---|
| **Öğrenci / üye** | Giriş yapmış herhangi bir kullanıcı | Kulüpleri gez, katıl/ayrıl, kulüp kur (başvuru) |
| **Officer** | `clubMembers.role = officer` | Üyelik isteklerini onayla, üye çıkar, içerik, linkler |
| **Başkan (president)** | `clubMembers.role = president` | Officer'ın her şeyi + rol atama + başkanlık devri + kulüp profilini düzenleme |
| **Danışman (advisor)** | Global `advisor` rolü + `clubAdvisors` ataması | Danışmanı olduğu kulübe içerik girme, üyelik isteklerini/üyeleri görüntüleme |
| **Okul yöneticisi (admin)** | `club.*` permission'ları | Başvuruları onayla, kulüp durumu/profili, danışman ata, kulüp sil (kendi üniversitesi) |
| **Sistem yöneticisi (super_admin)** | Tüm permission'lar + tenant bypass | admin'in her şeyini, herhangi bir üniversitede |

---

## 2. Roller ve Nasıl Yönetildikleri

**Kulüp-içi rol hiyerarşisi:** `member < officer < president`. Kurallar:

- Bir kulübün **tam olarak bir** başkanı vardır. Başvuru onaylanınca **başvuran otomatik başkan** olur.
- **member ↔ officer** geçişi: `PATCH /:clubId/members/:userId/role` (yalnızca **başkan**).
- **Başkanlık devri:** `POST /:clubId/transfer-presidency` (yalnızca mevcut başkan). Devir sonrası **eski başkan officer'a düşer**, yeni kişi başkan olur — tek transaction. Başkanlık, `role` endpoint'inden atanamaz; ayrı akıştır.
- Başkan, **başkanlığı devretmeden kulüpten ayrılamaz** ve **çıkarılamaz** (kulüp başkansız kalmasın diye).
- **Danışman**, kulüp-içi bir rol DEĞİLDİR (ayrı tablo). Bir kişi hem üye/officer hem danışman olabilir; danışman atamayı **admin** yapar (`clubAdvisors`), üye değildir.

**Danışman uygunluğu:** admin danışman atarken hedef kullanıcının sistemde **`advisor` global rolü** olması şarttır (staff maili ile kaydolanlara otomatik atanır). Öğrenci danışman atanamaz.

---

## 3. Ortak Kurallar

- **Base URL (dev):** `http://localhost:3000`. Kök: `/api/clubs` (+ `/api/users/me/*`, `/api/admin/...`).
- **Auth:** `/api/clubs` altındaki **tüm** rotalar `Authorization: Bearer <token>` ister (public kulüp yüzeyi yoktur — sadece giriş yapmış kullanıcı kendi üniversitesinin kulüplerini görür).
- **Tenant:** Kulüp rotaları JWT'deki `universityId` ile sınırlanır; path'te `universityId` **yoktur** (admin rotaları hariç). Frontend tenant param'ı göndermez.
- **Response zarfı:** `{ success, message, data }`. Oluşturma (`POST`) → `201`. Silme → `data` içermez.
- **Hata → status:** mesajda "bulunamadı" → `404`; diğer iş kuralı ihlalleri → `400`; auth → `401`; yetki (permission/kulüp rolü) → `403`. Zod validasyon hataları `400`.
- **Güvenli kullanıcı:** Dönen hiçbir user objesinde `passwordHash` yer almaz.

---

## 4. Kulüp Yaşam Döngüsü (durumlar)

`club.status`: `pending` → `approved` → `archived` / `rejected`.

```
Başvuru (clubApplications) --admin onay--> clubs(status: approved) --admin--> archived
                           --admin red -->  (kulüp oluşmaz)                  --admin--> rejected
```

- Kulüpler **başvuru onayıyla** doğar ve doğrudan `approved` oluşturulur (pratikte `pending` kulüp, başvuru katmanında yaşar).
- **Yalnızca `approved` kulüplere katılınabilir** ve public listede yalnızca `approved` kulüpler görünür.
- **Silme (hard delete)** yalnızca `archived`/`rejected` kulüpler için — admin önce arşivlemeli.

---

## 5. Keşif ve Üyelik (her üye)

Hepsi yalnızca `Bearer` ister; kendi üniversitenin `approved` kulüpleriyle sınırlıdır.

| Method | Path | Açıklama |
|---|---|---|
| GET | `/api/clubs?search=` | Onaylı kulüpleri listele (ada göre alfabetik; `search` = `name ILIKE`) |
| GET | `/api/clubs/:clubId` | Kulüp detayı (danışmanlar + onaylı üyeler + iletişim linkleri) |
| GET | `/api/clubs/:clubId/members` | Kulübün onaylı üyeleri (rolleriyle) |
| POST | `/api/clubs/:clubId/join` | Kulübe katıl |
| DELETE | `/api/clubs/:clubId/leave` | Kulüpten ayrıl |

### 5.1 Kulüp detayı — `GET /api/clubs/:clubId`

```jsonc
{
  "success": true,
  "message": "Kulüp bulundu.",
  "data": {
    // ...clubs kolonları (id, name, slug, description, logoUrl, coverUrl, status, joinPolicy, createdBy, ...)
    "advisors": [ /* safe user objeleri */ ],
    "clubMembers": [ { "clubId":"...", "userId":"...", "role":"president|officer|member", "status":"approved", "user": { /* safe user */ } } ],
    "contactLinks": [ { "id":"...", "clubId":"...", "platform":"instagram", "url":"..." } ]
  }
}
```
`clubMembers` yalnızca `approved` üyeleri içerir. Bulunamazsa `404 "Kulüp bulunamadı."`.

### 5.2 Üye listesi — `GET /api/clubs/:clubId/members`

`data`: `clubMembers` satırları (`role`, `status: "approved"`, `joinedAt`, gömülü `user`). Üyeler `joinedAt` artan sırada. (Detay endpoint'i de üyeleri döndürür; bu uç, üye tablosunu ayrı/sayfalanabilir çekmek için.)

### 5.3 Katılma — `POST /api/clubs/:clubId/join`

- `club.joinPolicy === "open"` → üyelik **direkt `approved`** (`201`).
- `approval_required` → üyelik **`pending`** oluşur, başkan/officer onaylayana kadar bekler.

İş kuralları:
- `404 "Kulüp bulunamadı."` — kulüp yok.
- `400 "Bu kulüp şu anda üyeliğe kapalı."` — kulüp `approved` değil (arşiv/red/pending).
- `400 "Bu kulübe zaten üyesiniz veya üyelik isteğiniz beklemede."` — mevcut üyelik/istek var.

### 5.4 Ayrılma — `DELETE /api/clubs/:clubId/leave`

`200 "Kulüpten ayrıldınız."`. Hatalar: `404 "Kulüp bulunamadı."`, `400 "Bu kulübün üyesi değilsiniz."`, `400 "Başkan, başkanlığı devretmeden kulüpten ayrılamaz."`.

> Başkan ayrılmak istiyorsa: önce `transfer-presidency` ile devret, sonra `leave`.

---

## 6. Kulüp Kurma Başvuruları (başvuran)

Bir öğrenci yeni bir kulüp kurmak için **başvuru** açar; okul yöneticisi onaylarsa gerçek kulüp oluşur ve başvuran başkan olur.

| Method | Path | Açıklama |
|---|---|---|
| POST | `/api/clubs/applications` | Yeni başvuru oluştur |
| GET | `/api/clubs/applications/:applicationId` | Kendi başvurumun detayı (onay adımlarıyla) |
| DELETE | `/api/clubs/applications/:applicationId` | Bekleyen başvurumu geri çek |
| GET | `/api/users/me/applications` | Tüm başvurularım (özet liste) |

### 6.1 Başvuru oluştur — `POST /api/clubs/applications`

```jsonc
// Body
{ "proposedName": "string (3-256)", "description": "string (max 2000, opsiyonel)" }
```
`201` + oluşan başvuru (`status: "pending"`). İş kuralı: **aynı anda birden fazla `pending` başvuru olamaz** → `400 "Zaten bekleyen bir kulüp başvurunuz var."`. (Reddedilen/geri çekilen başvuru bunu bloklamaz — yeniden başvurulabilir.)

### 6.2 Başvuru detayı — `GET /api/clubs/applications/:applicationId`

Yalnızca **kendi** başvurunu görürsün (başkasınınki `404 "Başvuru bulunamadı."`). Onay zinciri gömülüdür:

```jsonc
{
  "data": {
    "id":"...", "proposedName":"Satranç Kulübü", "status":"pending", "description":"...",
    "approvals": [
      { "step":1, "approverRole":"advisor", "status":"pending", "approverId":null, "approver":null, "reviewedAt":null }
    ]
  }
}
```
`approvals`, genişletilebilir çok-adımlı onay zinciridir (şu an tek adım). İleride SKS gibi 2. adım eklenirse burada `step:2` satırı görünür — şema değişmez.

### 6.3 Başvuruyu geri çek — `DELETE /api/clubs/applications/:applicationId`

Yalnızca **`pending`** başvuru geri çekilebilir. Hatalar: `404 "Başvuru bulunamadı."`, `400 "Yalnızca bekleyen bir başvuru geri çekilebilir."`.

> Değerlendirme (onay/red) başvuranın işi DEĞİLDİR — bkz. [§11 admin](#11-okul-yöneticisi-admin-kulüp-yönetimi).

---

## 7. Kulüp-içi Üyelik Yönetimi (officer / başkan)

Yetki **global RBAC'tan değil kulüpteki rolden** gelir (`club.middleware`). Middleware, kullanıcının o kulüpte **`status: "approved"`** üyeliğini/danışmanlığını kontrol eder.

| Method | Path | Kim |
|---|---|---|
| GET | `/api/clubs/:clubId/join-requests` | **staff**: danışman / officer / başkan |
| PATCH | `/api/clubs/:clubId/join-requests/:userId` | officer / başkan |
| DELETE | `/api/clubs/:clubId/members/:userId` | officer / başkan |
| PATCH | `/api/clubs/:clubId/members/:userId/role` | **yalnızca başkan** |
| POST | `/api/clubs/:clubId/transfer-presidency` | **yalnızca başkan** |

### 7.1 Bekleyen istekler — `GET /:clubId/join-requests`

`data`: `pending` üyelik satırları (gömülü `user`). **Danışman da görüntüleyebilir** (gözetim); karar veremez.

### 7.2 İsteği onayla/reddet — `PATCH /:clubId/join-requests/:userId`

```jsonc
{ "decision": "approved" | "rejected" }
```
Hata: `400/404 "Bekleyen bir üyelik isteği bulunamadı."` (istek yok veya `pending` değil).

### 7.3 Üye çıkar — `DELETE /:clubId/members/:userId`

`200 "Üye kulüpten çıkarıldı."`. Hatalar: `404 "Üye bulunamadı."`, `400 "Başkan bu şekilde kulüpten çıkarılamaz."`.

### 7.4 Üye rolü — `PATCH /:clubId/members/:userId/role` (yalnızca başkan)

```jsonc
{ "role": "member" | "officer" }
```
`president` bu endpoint'ten atanamaz/alınamaz → `400 "Başkanın rolü bu şekilde değiştirilemez."`. Onaysız üye hedeflenirse `404 "Üye bulunamadı."`.

### 7.5 Başkanlık devri — `POST /:clubId/transfer-presidency` (yalnızca başkan)

```jsonc
{ "newPresidentId": "uuid" }   // kulübün ONAYLI bir üyesi olmalı
```
`200 "Başkanlık devredildi."` + yeni başkanın üyelik satırı. Eski başkan **officer** olur. Hatalar:
- `400 "Başkanlığı kendinize devredemezsiniz."`
- `400 "Yeni başkan, kulübün onaylı bir üyesi olmalıdır."`

---

## 8. Kulüp Profili ve İletişim Linkleri (başkan / officer)

| Method | Path | Kim | Açıklama |
|---|---|---|---|
| PATCH | `/api/clubs/:clubId` | **yalnızca başkan** | Kendi kulübünü düzenle (durum HARİÇ) |
| POST | `/api/clubs/:clubId/contact-links` | officer / başkan | İletişim linki ekle |
| PATCH | `/api/clubs/:clubId/contact-links/:linkId` | officer / başkan | Linkin URL'sini güncelle |
| DELETE | `/api/clubs/:clubId/contact-links/:linkId` | officer / başkan | Link sil |

### 8.1 Kulübü düzenle — `PATCH /api/clubs/:clubId` (başkan)

```jsonc
// Body — en az bir alan
{ "name":"...", "description":"...", "logoUrl":"url", "coverUrl":"url", "joinPolicy":"open|approval_required" }
```
**Durum (`status`) buradan değiştirilemez** — kulübü onaylama/arşivleme okul yöneticisinin işidir. Boş body → `400 "Güncellenecek en az bir alan girilmelidir."`.

### 8.2 İletişim linkleri

```jsonc
// POST body
{ "platform": "whatsapp|instagram|discord|telegram|twitter|website|email|other", "url": "url (max 512)" }
// PATCH body (platform sabit; yalnızca url)
{ "url": "url (max 512)" }
```
- Her platform için kulüp başına **tek link** → aynı platform ikinci kez eklenirse `400 "Bu platform için zaten bir bağlantı eklenmiş."`.
- Platformu değiştirmek: sil + yeniden ekle. Link yoksa `404 "Bağlantı bulunamadı."`.

---

## 9. Duyurular ve Galeri (alt-kaynaklar)

`clubs.routes.ts` içine mount edilir — bağımsız `/api/announcements` yoktur. **Yazma yetkisi "staff"tir: danışman / officer / başkan.**

### 9.1 Duyurular — `/api/clubs/:clubId/announcements`

| Method | Path | Kim |
|---|---|---|
| GET | `/api/clubs/:clubId/announcements` | Bearer (herkes) |
| POST | `/api/clubs/:clubId/announcements` | staff (danışman/officer/başkan) |
| DELETE | `/api/clubs/:clubId/announcements/:announcementId` | staff |

`POST` body: `{ "title": "string (3-256)", "content": "string (1-5000)" }`. Liste `createdAt` azalan sırada, gömülü `author`.

### 9.2 Galeri — `/api/clubs/:clubId/gallery`

| Method | Path | Kim |
|---|---|---|
| GET | `/api/clubs/:clubId/gallery` | Bearer (herkes) |
| POST | `/api/clubs/:clubId/gallery` | staff |
| DELETE | `/api/clubs/:clubId/gallery/:imageId` | staff |

`POST` body: `{ "imageUrl": "url (max 512)", "caption": "string (max 256, opsiyonel)" }`.

> Dosya upload endpoint'i yoktur — tüm `*Url` alanları düz URL string alır (S3/Cloudinary vb. frontend/ayrı servis işidir).

---

## 10. Danışman (advisor) Akışı

Danışman = global `advisor` rolü + bir kulübe `clubAdvisors` ile atanmış kişi. Danışmanı olduğu kulüpte "staff" sayılır:

- **`GET /api/users/me/advised-clubs`** — danışmanı olduğum kulüpler (gömülü `club`).
- Danışmanı olduğu kulübe **duyuru/galeri girebilir**, **üyelik isteklerini ve üyeleri görüntüleyebilir**.
- Danışman **karar mercii değildir**: üyelik isteğini onaylamak, üye çıkarmak, rol atamak, profili düzenlemek officer/başkanın işidir.
- Danışman ataması `clubAdvisors` üzerindendir; danışman kulübün "üyesi" (`clubMembers`) DEĞİLDİR — bu yüzden `GET /users/me/clubs` içinde görünmez, `advised-clubs`'ta görünür.

---

## 11. Okul Yöneticisi (admin) Kulüp Yönetimi

`/api/admin/...` — hepsi `guard(<club.*>, { tenantScoped: true })`: `:universityId` çağıranın kendi üniversitesiyle eşleşmeli (**super_admin bypass eder**). Seed'de `admin` rolüne 4 `club.*` yetkisinin tamamı atanır.

| Method | Path | Permission | Açıklama |
|---|---|---|---|
| GET | `/api/admin/universities/:universityId/club-applications?status=` | `club.approve` | Başvuruları listele |
| PATCH | `.../club-applications/:applicationId/approve` | `club.approve` | Onayla → **gerçek kulüp oluşur, başvuran başkan olur** |
| PATCH | `.../club-applications/:applicationId/reject` | `club.approve` | Reddet (kulüp oluşmaz) |
| GET | `.../clubs?status=` | `club.update` | Kulüpleri listele (tüm durumlar) |
| PATCH | `.../clubs/:clubId/status` | `club.update` | Durum güncelle (`pending/approved/rejected/archived`) |
| PATCH | `.../clubs/:clubId` | `club.update` | Profili güncelle (ad/açıklama/logo/kapak/joinPolicy) |
| GET | `.../clubs/:clubId/advisors` | `club.advisor.manage` | Danışmanları listele |
| POST | `.../clubs/:clubId/advisors` | `club.advisor.manage` | Danışman ata (`{ userId }`) |
| DELETE | `.../clubs/:clubId/advisors/:userId` | `club.advisor.manage` | Danışman kaldır |
| DELETE | `.../clubs/:clubId` | `club.delete` | Kulübü **kalıcı sil** (önce archived/rejected olmalı) |

Notlar:
- **Başvuru onayı** benzersiz slug üretir; başvuran `president` + `approved` üye olur (bkz. `admin.repository.decideClubApplication`). Zaten değerlendirilmiş başvuru → `400 "Bu başvuru zaten değerlendirilmiş."`.
- **Danışman atama** hedefin `advisor` rolü olmasını şart koşar → yoksa `400 "Danışman olarak yalnızca 'advisor' rolündeki personel atanabilir."`. Ayrıca hedef aynı üniversiteden olmalı.
- **Kulüp silme** yıkıcıdır: bağlı üyeler/danışmanlar/linkler/duyurular/galeri tek transaction'da temizlenir. Aktif kulüp silinmez → `400 "Yalnızca arşivlenmiş veya reddedilmiş kulüpler silinebilir. Önce kulübü arşivleyin."`.

---

## 12. Yetki (Permission) Modeli — Granüler `club.*`

Eski tek `club.manage` kaldırıldı; kaynak+aksiyon bazlı 4 ayrı yetkiye bölündü (üniversite feature'ındaki modelin aynısı). Böylece bir yöneticiye örneğin "kulüp düzenleme" verip "kulüp silme" vermemek mümkün.

| Permission | Kapsam |
|---|---|
| `club.approve` | Başvuru listeleme / onaylama / reddetme |
| `club.update` | Kulüp yönetim görünümü + durum + profil güncelleme |
| `club.advisor.manage` | Danışman listele / ata / kaldır |
| `club.delete` | Kulübü kalıcı silme (yıkıcı) |

- Seed'de bu 4 yetkinin tamamı **`admin` ve `super_admin`** rollerine atanır.
- Yetki eksikse `403 "Bu işlem için yetkiniz bulunmamaktadır."`; tenant uyuşmazlığı (super_admin değilse) `403 "Bu üniversiteye ait kaynaklara erişim yetkiniz bulunmamaktadır."`.
- **Kulüp-içi rol katmanı bu permission'ları KULLANMAZ** — o katman `club.middleware` ile çözülür (bkz. §7).

---

## 13. Uçtan Uca Senaryolar

### 13.1 Kulüp kurma (öğrenci → admin → başkan)
```
1) POST /api/clubs/applications            (öğrenci, proposedName)         → pending başvuru
2) GET  /api/clubs/applications/:id         (öğrenci, durumu izler)
3) PATCH .../club-applications/:id/approve  (admin: club.approve)          → kulüp oluşur, öğrenci=başkan
4) GET  /api/users/me/clubs                 (öğrenci, artık president görür)
```

### 13.2 Üyeliğe açık vs onaylı kulüp
```
open              : POST /:clubId/join → 201, status "approved" (direkt üye)
approval_required : POST /:clubId/join → 201, status "pending"
                    officer/başkan: GET /:clubId/join-requests → PATCH .../:userId {decision:"approved"}
```

### 13.3 Yönetim devri ve ayrılma
```
1) POST /:clubId/transfer-presidency { newPresidentId }  (başkan)  → eski başkan officer olur
2) DELETE /:clubId/leave                                  (artık officer, ayrılabilir)
```

### 13.4 Kulübü kapatma (admin)
```
1) PATCH .../clubs/:clubId/status { "status":"archived" }   (club.update)
2) DELETE .../clubs/:clubId                                  (club.delete, cascade temizlik)
```

### 13.5 Frontend'de buton görünürlüğü
- Kulüp-içi rol: `GET /api/users/me/clubs` (`role`,`status`) veya `GET /api/clubs/:id` (`clubMembers[]`). `status==="approved"` şart.
- Danışmanlık: `GET /api/users/me/advised-clubs`.
- Global admin: `GET /api/users/me` → `data.roles[]` (flatten permission listesi henüz endpoint'ten dönmez; rol adına bakılır — bkz. `FRONTEND_AUTH_GUARD_GUIDE.md §3`).

---

## 14. Hata Durumları Sözlüğü

| Mesaj | Status | Nerede |
|---|---|---|
| `Kulüp bulunamadı.` | 404 | detay/üye/katıl/ayrıl/profil/admin |
| `Bu kulüp şu anda üyeliğe kapalı.` | 400 | join (approved değil) |
| `Bu kulübe zaten üyesiniz veya üyelik isteğiniz beklemede.` | 400 | join |
| `Bu kulübün üyesi değilsiniz.` | 400 | leave |
| `Başkan, başkanlığı devretmeden kulüpten ayrılamaz.` | 400 | leave |
| `Zaten bekleyen bir kulüp başvurunuz var.` | 400 | başvuru oluştur |
| `Başvuru bulunamadı.` | 404 | başvuru detay/geri çek |
| `Yalnızca bekleyen bir başvuru geri çekilebilir.` | 400 | başvuru geri çek |
| `Bekleyen bir üyelik isteği bulunamadı.` | 400/404 | isteği onayla/reddet |
| `Üye bulunamadı.` | 404 | üye çıkar / rol |
| `Başkan bu şekilde kulüpten çıkarılamaz.` | 400 | üye çıkar |
| `Başkanın rolü bu şekilde değiştirilemez.` | 400 | rol güncelle |
| `Başkanlığı kendinize devredemezsiniz.` | 400 | başkanlık devri |
| `Yeni başkan, kulübün onaylı bir üyesi olmalıdır.` | 400 | başkanlık devri |
| `Güncellenecek en az bir alan girilmelidir.` | 400 | kulüp profili düzenle |
| `Bu platform için zaten bir bağlantı eklenmiş.` | 400 | iletişim linki ekle |
| `Bağlantı bulunamadı.` | 404 | iletişim linki güncelle/sil |
| `Bu işlem için kulüp yöneticisi (başkan/officer) olmalısınız.` | 403 | officer/başkan gerektiren uçlar |
| `Bu işlem için kulüp yöneticisi (başkan/officer) veya danışmanı olmalısınız.` | 403 | staff gerektiren uçlar (istek listesi, içerik) |
| `Bu işlem için kulüp başkanı olmalısınız.` | 403 | rol/devir/profil |
| `Bu başvuru zaten değerlendirilmiş.` | 400 | admin onay/red |
| `Danışman olarak yalnızca 'advisor' rolündeki personel atanabilir.` | 400 | admin danışman ata |
| `Bu kullanıcı zaten kulübün danışmanı.` | 400 | admin danışman ata |
| `Yalnızca arşivlenmiş veya reddedilmiş kulüpler silinebilir. Önce kulübü arşivleyin.` | 400 | admin kulüp sil |
| `Bu işlem için yetkiniz bulunmamaktadır.` | 403 | eksik `club.*` permission |
| `Bu üniversiteye ait kaynaklara erişim yetkiniz bulunmamaktadır.` | 403 | admin tenant scope (super_admin değilse) |
