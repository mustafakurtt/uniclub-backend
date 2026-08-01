# Duyurular (announcements)

Kulüp duyuruları `/api/clubs/:clubId/announcements` altında yaşar (bağımsız mount yok). Etkinliklerle aynı enum semantiği: `activity_status` (`draft` / `published` — duyuruda `cancelled` kullanılmaz) ve `activity_visibility` (`university` / `members`).

## Yaşam döngüsü

| Alan | Açıklama |
|---|---|
| `status` | `draft` → yalnızca kulüp staff görür; `published` → görünürlük kurallarına göre okunur |
| `publishedAt` | İlk yayın anı; **yalnızca bir kez** set edilir (draft→yayın tekrarı bildirim göndermez) |
| `pinned` | Kulüp listesinde üstte; kulüp başına **en fazla 3** (servis zorlar) |
| `visibility` | `university` = tenant'taki herkes (kulüp sayfasında); `members` = yalnızca onaylı üyeler |

Oluşturma: `publish: true` (varsayılan) → anında yayın + üyelere bildirim. `publish: false` → taslak; sonra `POST .../:announcementId/publish` veya **zamanlanmış yayın** (aşağıda).

## Zamanlanmış yayın

Taslak duyuruya tenant yerel saatinde otomatik yayın atanabilir.

| Alan | Açıklama |
|---|---|
| `scheduledPublishAtLocal` (istek) | Tenant IANA diliminde duvar saat: `YYYY-MM-DDTHH:mm` — offset/Z **yok** |
| `scheduledPublishAt` (yanıt/DB) | UTC `timestamptz`; sunucu tenant `timezone` ile yerel saati bu ana çevirir |

**Öncelik:** `scheduledPublishAtLocal` verildiğinde `publish: true` bile olsa anında yayınlanmaz — taslak kalır, kuyruk işi planlanır. Geçmişe dönük zaman **400** (`schedule.inPast`).

**Güncelleme:** Yalnızca `draft` içerikte `PATCH` ile zaman değiştirilebilir veya `scheduledPublishAtLocal: null` ile iptal edilir. Tarih değişince eski BullMQ işi kaldırılır.

**Yayın anı:** `status → published`, `publishedAt` set (ilk kez), `scheduledPublishAt` temizlenir, bildirim fan-out — elle yayınla aynı (`firstPublish` kuralı geçerli).

**Görünürlük:** Zamanlanmış taslak üye listesinde ve feed'de **görünmez** (yalnızca staff taslak listesinde).

## Görünürlük (sunucu zorunlu)

- `members` duyuru: üye olmayan kulüp listesinde, feed'de (üye değilse kulüp feed'e girmez) ve aramada **görünmez**.
- `draft`: yalnızca staff (danışman / officer / president); onaylı üyeler de görmez.

Görünürlük **okuma iznini** belirler. Bildirim **her zaman kulüp onaylı üyelerine** gider (`visibility = university` olsa bile tüm üniversiteye push yok).

## Bildirim

| `type` | Ne zaman | `data` |
|---|---|---|
| `announcement.published` | İlk yayın (create `publish: true` veya `POST .../publish`) | `{ announcementId, clubId }` |

Bildirim `notifySafe` ile gönderilir; hata duyuru yazımını düşürmez. Yan etki transaction commit sonrası çalışır.

## Feed

`/api/feed` yalnızca `status = published` duyuruları birleştirir; sıralama/cursor ekseni `publishedAt`. **Sabitlenme feed'de uygulanmaz** — feed çok-kulüplü karışık zaman çizelgesi; pin yalnızca tek kulüp duyuru listesinde (`pinned` önce, sonra `publishedAt` azalan).

## Uçlar

| Method | Path | Kim |
|---|---|---|
| GET | `/api/clubs/:clubId/announcements` | Bearer — görünürlük serviste |
| POST | `/api/clubs/:clubId/announcements` | staff |
| POST | `/api/clubs/:clubId/announcements/:id/publish` | staff (taslak → yayın) |
| PATCH | `/api/clubs/:clubId/announcements/:id` | staff (`pinned`, `visibility`, `scheduledPublishAtLocal`) |
| DELETE | `/api/clubs/:clubId/announcements/:id` | staff |

**POST body:** `{ title, content, visibility?, pinned?, publish?, scheduledPublishAtLocal? }` — `visibility` varsayılan `university`, `publish` varsayılan `true`. `scheduledPublishAtLocal`: tenant yerel `YYYY-MM-DDTHH:mm`.

**PATCH body:** `{ pinned?, visibility?, scheduledPublishAtLocal? | null }` — `scheduledPublishAtLocal: null` zamanlamayı iptal eder.

Liste yanıtı mevcut alanlara ek olarak `status`, `publishedAt`, `pinned`, `visibility`, `scheduledPublishAt` döner (additive).
