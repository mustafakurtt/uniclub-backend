# Üniversiteler arası etkinlik keşfi — Frontend entegrasyon

**Kapsam:** `GET /api/discover/activities` — T10.4 "dünya sekmesi" dilimi.

> Etkinlik modeli ve görünürlük seviyeleri: [activities.md](activities.md).
> Tenant bayrağı: [tenant-settings.md](tenant-settings.md) (`university.inter_university.enabled`).

---

## Ön koşullar

1. **Tenant bayrağı** — hem çağıranın kurumunda hem host kurumda `university.inter_university.enabled` açık olmalı (varsayılan kapalı). Çağıranın bayrağı kapalıysa endpoint **404** döner (403 değil).
2. **Görünürlük** — yalnızca `inter_university` seçilmiş **yayınlanmış** etkinlikler listelenir (`university` / `members` listede yok).
3. **Salt okunur** — bu listeden başka kurumun etkinliğine RSVP/yoklama yok (çapraz katılım ayrı iş).
4. **Kendi kurum hariç** — host kulübün üniversitesi çağıranın tenant'ı ile aynıysa etkinlik bu listede **görünmez** (kendi `/api/activities` akışında zaten var).

---

## GET — liste

```
GET /api/discover/activities?limit=20&cursor=&universityId=
Authorization: Bearer <token>
```

| Param | Açıklama |
|---|---|
| `limit` | 1–50, varsayılan 20 |
| `cursor` | Opak keyset imleci (`startsAt` + `id` tie-break) |
| `universityId` | Opsiyonel — host üniversiteye filtre |

**200 `data`:**

```json
{
  "items": [
    {
      "id": "...",
      "title": "...",
      "description": "...",
      "location": "...",
      "startsAt": "2026-08-...",
      "endsAt": null,
      "hostClub": { "name": "Yazılım ve Teknoloji Kulübü" },
      "university": { "id": "...", "name": "Ege Bilim Üniversitesi" }
    }
  ],
  "nextCursor": "..." | null
}
```

**Kişisel veri yok:** katılımcı listesi, sayı, RSVP, kullanıcı alanları yanıtta **asla** gelmez.

---

## Görünürlük seçimi (oluşturma/güncelleme)

`inter_university` yalnızca:

- Kulüp **officer/başkan** (`POST/PATCH /api/clubs/:clubId/activities`) — danışman seçemez
- **SKS** (`PATCH /api/admin/universities/:uid/clubs/:clubId/activities/:activityId`, `activity.moderate`)

Host tenant'ta bayrak kapalıysa seçim → `400`.
