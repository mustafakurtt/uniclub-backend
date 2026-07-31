# Frontend — Etkinlikler (Activities)

Kulüp etkinlikleri: keşif, katılım (RSVP), "etkinliklerim/takvimim" ve kulüp-içi
etkinlik yönetimi. Bu doküman `activities` feature'ının frontend sözleşmesidir.

> Genel kurallar (başarı/hata zarfı, `Accept-Language`, `code`/`status`) için
> [API.md](../API.md) ve [FRONTEND_AUTH_RBAC.md](FRONTEND_AUTH_RBAC.md) geçerlidir.
> Mesajlar isteğin diline çevrilir; **kalıcı mantığı `code`/HTTP status'a bağlayın**.

## Kavramsal model (ÖNEMLİ)

Etkinlik ↔ kulüp ilişkisi **M:N**'dir (`activity_clubs`): bir etkinliğin **tam bir
`host` kulübü** (sahibi/kontrol eden) ve **sıfır+ `co_host` kulübü** olur. Co-host
kulüpler **farklı üniversitelerden** bile olabilir (üniversitelerarası turnuva) —
bu yüzden bir etkinliğin tek bir "üniversitesi" **yoktur**; tenant'ı katılan
kulüplerden türetilir.

- **Etkinliğin tenant'ı = host/co_host kulüplerinin üniversiteleri.** Keşif akışı,
  çağıranın üniversitesinden bir kulübü olan etkinlikleri gösterir — co-hosted bir
  etkinlik **her iki** üniversitenin akışında da görünür.
- **Yetki:** oluştur/güncelle/iptal/katılımcılar yalnızca **host kulübün** staff'ına
  (danışman/officer/başkan) açıktır. Co-host bir kulübün staff'ı etkinliği yönetemez.
- **Görünürlük** (`visibility`): `university` (tenant'taki herkes görür + katılır) ·
  `members` (yalnızca host/co_host kulüplerin onaylı üyeleri).

## Enum'lar

| Enum | Değerler |
|---|---|
| `activity_status` | `draft`, `published`, `cancelled` |
| `activity_visibility` | `university`, `members` |
| `activity_club_role` | `host`, `co_host` |
| `activity_club_status` | `invited`, `accepted` (co-host daveti; yalnızca `accepted` bağlar tenant/görünürlük belirler) |
| `rsvp_status` | `going`, `interested`, `waitlist` (`waitlist` şimdilik kullanıcı seçemez) |

---

## Keşif + RSVP — `/api/activities`

Tümü `Bearer` ister; tenant JWT'den çözülür (path'te `universityId` yoktur).

| Method | Path | Açıklama |
|---|---|---|
| GET | `/api/activities?scope=upcoming&search=` | Üniversite geneli **yayınlanmış + `university`** etkinlikler |
| GET | `/api/activities/:activityId` | Etkinlik detayı (görünürlük/tenant/yayın kuralları uygulanır) |
| POST | `/api/activities/:activityId/rsvp` | Katılım bildir (`{ status: "going"\|"interested" }`, varsayılan `going`) |
| DELETE | `/api/activities/:activityId/rsvp` | Katılımı geri al (idempotent) |

**`scope`** (varsayılan `upcoming`): `upcoming` (başlangıç ≥ şimdi, artan) ·
`past` (başlangıç < şimdi, azalan) · `all`. **`search`**: başlık `ILIKE`.

> **`members` görünürlüğündeki etkinlikler genel keşifte (`GET /api/activities`)
> DÖNMEZ** — onlar kulübün kendi listesinde (`GET /api/clubs/:clubId/activities`)
> yalnızca üyelere görünür.

### Detay yanıtı (`data`)
```jsonc
{
  "id": "...", "title": "...", "description": "...", "location": "...",
  "coverUrl": null, "startsAt": "2026-08-...", "endsAt": null,
  "capacity": 200, "status": "published", "visibility": "university",
  "createdBy": "...", "createdAt": "...", "updatedAt": "...",
  "creator": { /* safe user */ },
  "hostClub": { "id": "...", "name": "...", "universityId": "...", "...": "..." },
  "coHostClubs": [ { "id": "...", "name": "...", "universityId": "..." } ], // farklı üniversite olabilir
  "goingCount": 3,                                   // yalnızca 'going' sayılır (kapasite bununla kıyaslanır)
  "myRsvp": { "status": "going", "checkedInAt": null } | null
}
```

### Hata kodları (bu yüzeyde beklenenler)
| Durum | HTTP | Mesaj (tr) |
|---|---|---|
| Etkinlik yok / **tenant dışı** / taslak | `404` | Etkinlik bulunamadı. |
| İptal edilmiş | `400` | Bu etkinlik iptal edildi. |
| `members`, çağıran üye değil | `403` | Bu etkinlik yalnızca kulüp üyelerine açıktır. |
| Kapasite dolu (`going`) | `400` | Etkinlik kontenjanı dolu. |
| Geçmiş etkinliğe RSVP | `400` | Geçmiş bir etkinliğe katılım bildirilemez. |

> **RSVP upsert'tir:** aynı kullanıcı `interested` ↔ `going` arasında geçebilir.
> `going`, `capacity` doluysa reddedilir; `interested` kapasiteye tabi değildir.
> `capacity: null` = sınırsız.

---

## "Etkinliklerim" — `/api/users/me/activities`

| Method | Path | Açıklama |
|---|---|---|
| GET | `/api/users/me/activities` | Katılım bildirdiğim etkinlikler (takvim), host kulübü gömülü |

`data`: `[{ status, checkedInAt, activity: { ...etkinlik, hostClub } }]` (en yeni RSVP önce).

---

## Kulüp-içi etkinlik yönetimi — `/api/clubs/:clubId/activities`

Announcements/gallery gibi kulüp alt-kaynağı. Listeleme her giriş yapmış kullanıcıya;
**yazma işleri host kulübün staff'ına** (`requireClubStaff`: danışman/officer/başkan).

| Method | Path | Kim | Açıklama |
|---|---|---|---|
| GET | `/api/clubs/:clubId/activities` | Bearer (herkes) | Kulübün etkinlikleri (`members` yalnızca üyeye; **taslaklar yalnızca staff'a**) |
| POST | `/api/clubs/:clubId/activities` | host staff | Etkinlik oluştur (bu kulüp **host**; `publish:false` → taslak) |
| PATCH | `/api/clubs/:clubId/activities/:activityId` | host staff | Güncelle (iptal edilmiş güncellenemez) |
| POST | `/api/clubs/:clubId/activities/:activityId/publish` | host staff | **Taslağı yayınla** (üyelere bildirim) |
| POST | `/api/clubs/:clubId/activities/:activityId/cancel` | host staff | İptal et (katılımcılara bildirim gider) |
| GET | `/api/clubs/:clubId/activities/:activityId/attendees` | host staff | Katılımcı listesi (safe user + rsvp + `checkedInAt`) |
| POST | `/api/clubs/:clubId/activities/:activityId/attendees/:userId/check-in` | host staff | **Yoklama:** katılımcıyı "geldi" işaretle |
| DELETE | `/api/clubs/:clubId/activities/:activityId/attendees/:userId/check-in` | host staff | Yoklama işaretini geri al |

### Co-host davet/kabul — `/api/clubs/:clubId/activities/:activityId/...`

Yol param'ındaki `:clubId` **işlemi yapan kulüp**tür: davet/liste/kaldırmada **host** kulüp, kabul/ayrılmada **co-host** kulüp. Hepsi ilgili kulübün staff'ına açıktır.

| Method | Path (kuyruk) | Kim | Açıklama |
|---|---|---|---|
| POST | `/co-hosts` | host staff | Kulüp davet et — body `{ clubId }` (aynı ya da **farklı üniversite**) → `invited` |
| GET | `/co-hosts` | host staff | Co-host'ları listele (status: `invited`/`accepted`) |
| DELETE | `/co-hosts/:coClubId` | host staff | Co-host'u kaldır |
| POST | `/co-host/accept` | co-host staff | Daveti kabul et (`:clubId` = davet edilen kulüp) → `accepted` |
| DELETE | `/co-host` | co-host staff | Daveti reddet / ortaklıktan ayrıl |

> **`invited` bir co-host tenant/görünürlük/keşifte SAYILMAZ** — kabul edilene
> (`accepted`) kadar etkinlik o kulübün üniversitesinin akışında görünmez ve
> detayın `coHostClubs`'ında yer almaz.

### Body şemaları
- **POST** `create`: `{ title (3-256), description? (max 5000), location? (max 512), coverUrl? (url), startsAt (ISO tarih), endsAt? (ISO), capacity? (pozitif int), visibility? ("university"|"members", vars. "university"), publish? (bool, vars. true) }`
- **PATCH** `update`: `title/description/location/coverUrl/startsAt/endsAt/capacity/visibility` — hepsi opsiyonel, **en az bir alan**.
- **POST** `/co-hosts`: `{ clubId (uuid) }`. Diğerleri (publish/cancel/accept/check-in/...) body almaz.

### İş kuralı hataları
| Durum | HTTP | Mesaj (tr) |
|---|---|---|
| Başlangıç geçmişte | `400` | Etkinlik başlangıcı geçmiş bir tarih olamaz. |
| Bitiş < başlangıç | `400` | Etkinlik bitişi başlangıçtan önce olamaz. |
| Kulüp host değil | `403` | Bu kulüp etkinliğin sahibi (host) değil. |
| Zaten iptal | `400` | Etkinlik zaten iptal edilmiş. |
| Staff değil | `403` | Bu işlem için kulüp yöneticisi (başkan/officer) veya danışmanı olmalısınız. |

---

## Moderasyon (tenant yöneticisi / içerik moderatörü)

Kulüp-içi katmandan bağımsız, **tenant seviyesi** bir override (aynı
`announcement.moderate`/`gallery.moderate` deseni):

| Method | Path | Yetki |
|---|---|---|
| POST | `/api/admin/universities/:universityId/activities/:activityId/cancel` | `activity.moderate` (tenantScoped) |

Herhangi bir kulübün etkinliğini iptal eder (host olmak gerekmez); katılımcılara
`activity.cancelled` bildirimi gider. Etkinlik o tenant'a ait değilse `404`.
`activity.moderate` seed'de `university_admin`, `student_affairs`,
`content_moderator` rollerindedir.

## Bildirimler (WebSocket + kalıcı)

Etkinlik akışı iki yeni bildirim tipi üretir (bkz. [FRONTEND_BILDIRIM_VE_LIMITLER.md](FRONTEND_BILDIRIM_VE_LIMITLER.md)):

| `type` | Ne zaman | `data` |
|---|---|---|
| `activity.published` | Host kulüp yeni etkinlik yayınladı → kulübün onaylı üyelerine | `{ activityId, clubId }` |
| `activity.cancelled` | Katılım bildirilen etkinlik iptal edildi → RSVP'lilere | `{ activityId }` |
| `activity.coHostInvited` | Kulüp bir etkinliğe co-host davet edildi → hedef kulübün staff'ına | `{ activityId, hostClubId, clubId }` |

## Kapsam notu

- **Leaderboard/turnuva skorlaması** ayrı bir domain olacaktır — `activity_attendees` yalnızca RSVP+yoklamadır, skor tutmaz.
- `rsvp_status.waitlist` şema düzeyinde hazır; bekleme listesi mantığı (kontenjan dolunca sıraya alma) henüz uygulanmadı — dolu etkinlikte `going` reddedilir.
