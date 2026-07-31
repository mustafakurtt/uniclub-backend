# Frontend — Panel & Akış (Dashboard / Feed)

Rollere göre özet/akış yüzeyleri. `dashboard` bir **okuma modelidir**: mevcut
clubs/announcements/activities/üyelik/başvuru verisini birleştirir — yeni bir
kaynak/tablo yoktur, yazma yapmaz.

> Genel kurallar (zarf, `Accept-Language`, `code`/status) [API.md](../API.md)'de.

## 1. Öğrenci akışı — `GET /api/feed`

Giriş yapmış kullanıcının **ONAYLI üye olduğu** kulüplerin duyuruları + **yayınlanmış**
etkinlikleri, zamanına göre (createdAt, en yeni önce) tek akışta birleştirilir.

`?limit=1-50 (vars. 20)&cursor=<ISO createdAt>` — keyset sayfalama.

```jsonc
{
  "success": true, "message": "Akış listelendi.",
  "data": {
    "items": [
      {
        "type": "activity",                       // "announcement" | "activity"
        "at": "2026-07-17T16:59:52.542Z",         // sıralama/cursor ekseni
        "club": { "id": "...", "name": "...", "slug": "...", "logoUrl": null },
        "item": { /* duyuru VEYA etkinlik satırı (type'a göre) */ }
      }
    ],
    "nextCursor": "2026-07-17T16:59:52.542Z" | null   // null → son sayfa
  }
}
```

- **Sayfalama:** `nextCursor` doluysa bir sonraki sayfa için `?cursor=<nextCursor>`.
- Üyeliği olmayan kullanıcıda `items: []`, `nextCursor: null`.
- Taslak/iptal etkinlikler akışta yer almaz; `members` görünürlüğündekiler (kendi
  kulübün olduğu için) yer alır.

## 2. Öğrenci özeti — `GET /api/users/me/dashboard`

```jsonc
{
  "clubCount": 1,                 // onaylı üyelik sayısı
  "upcomingAttendingCount": 2,    // katılım bildirdiğim yaklaşan etkinlik
  "pendingJoinRequests": 0,       // onay bekleyen üyelik isteğim
  "pendingApplications": 0,       // bekleyen kulüp kurma başvurum
  "nextActivity": {               // en yakın katılacağım etkinlik (yoksa null)
    "id": "...", "title": "...", "startsAt": "...", "location": "...",
    "hostClub": { "id": "...", "name": "...", "slug": "...", "logoUrl": null }
  }
}
```

## 3. Kulüp paneli — `GET /api/clubs/:clubId/dashboard`

Kulüp **staff'ı** (danışman/officer/başkan) için özet. Değilse `403`.

```jsonc
{
  "memberCount": 3,            // onaylı üye
  "pendingJoinRequests": 1,    // bekleyen katılım isteği (rozet)
  "upcomingActivityCount": 4,  // yaklaşan yayınlanmış etkinlik
  "announcementCount": 2
}
```

## 4. Admin paneli — `GET /api/admin/universities/:universityId/dashboard`

Tenant geneli özet. **`dashboard.view`** yetkisi + **tenantScoped** (`:universityId`
çağıranın kendi üniversitesi olmalı; super_admin/platform_support bypass). Yetki
yoksa `403`, başka tenant `403`. (`dashboard.view` seed'de university_admin,
student_affairs, auditor, platform_support, super_admin rollerindedir.)

```jsonc
{
  "clubsByStatus": { "pending": 1, "approved": 3, "rejected": 1, "archived": 1 },
  "usersByStatus": { "pending": 1, "active": 16, "suspended": 1 },
  "pendingApplications": 2,      // bekleyen kulüp kurma başvurusu (rozet)
  "upcomingActivityCount": 5
}
```

> `*ByStatus` haritaları yalnızca **var olan** durumları içerir; frontend eksik
> anahtarı `0` saymalıdır (örn. hiç `rejected` yoksa anahtar gelmez).

## Notlar

- Tüm uçlar salt-okuma; sayaçlar canlı sorgulanır (cache yok — küçük tenant'ta hızlı).
- Feed'in zaman ekseni **createdAt**'tir ("kulüplerimde ne yeni"); "yaklaşan
  etkinlikler" farklı bir görünümdür → `GET /api/activities?scope=upcoming`.
