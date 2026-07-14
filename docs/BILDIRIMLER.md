# Bildirim Sistemi (Kalıcı + Gerçek Zamanlı)

Bildirimler veritabanına yazılır **ve** kullanıcının o an bağlı olan **tüm
cihazlarına** WebSocket üzerinden anında iletilir. Çevrimdışı bir cihaz sonradan
bağlandığında geçmişi REST'ten okur.

Taşıyıcı: **Bun native WebSocket** (`hono/bun` → `createBunWebSocket`, uWebSockets motoru).

---

## Mimari

```
                        ┌──────────────── instance A ─────────────────┐
  notify(userId, ...)   │                                             │
        │               │  1. DB'ye yaz (notifications tablosu)       │
        ├──────────────►│  2. redis.publish("notifications", {...})   │
        │               │                                             │
        │               │  ┌─ redisSubscriber.on("message") ───────┐  │
        │               │  │  kendi soketlerine yaz                │  │
        │               │  └───────────────────────────────────────┘  │
        │               │        ▲              soketler(userId)      │
        │               └────────┼─────────────────────────────────────┘
        │                        │
        │                  Redis Pub/Sub
        │                   kanal: "notifications"
        │                        │
        │               ┌────────┼─────────── instance B ─────────────┐
        └──────────────►│  aynı abone → kendi soketlerine yazar       │
                        └─────────────────────────────────────────────┘
```

**Neden Pub/Sub?** Bir kullanıcının soketleri yalnızca ona hizmet eden instance'ın
belleğindedir. Yatay ölçeklemede bildirimi *üreten* instance, kullanıcının *bağlı
olduğu* instance olmayabilir. Teslimat her zaman Redis üzerinden yayınlanır; her
instance abone olup kendi soketlerine yazar. Yayınlayan instance de abonedir →
"yerel mi uzak mı" ayrımı yok, tek kod yolu.

**Neden ayrı Redis bağlantısı?** ioredis, bir bağlantı `subscribe` edildiği anda onu
subscriber moduna alır ve o bağlantıda normal komutlar (GET/SET/INCR) çalışmaz.
Paylaşılan `redis.client.ts`'i abone yapsaydık RBAC cache okumaları ve rate limit
sayaçları kırılırdı → `shared/redis/redis.subscriber.ts`.

| Dosya | Sorumluluk |
|---|---|
| `shared/ws/bun-ws.ts` | `createBunWebSocket()` — **tek kez** çağrılır, `websocket` handler'ı `index.ts` default export'una verilir |
| `features/notifications/notifications.gateway.ts` | Soket kaydı (çoklu cihaz), heartbeat, pub/sub fanout, WS ticket |
| `features/notifications/notifications.service.ts` | `notify` / `notifySafe`, liste, okundu |
| `features/notifications/notifications.repository.ts` | DB (keyset sayfalama, okunmamış sayacı) |

---

## Kimlik doğrulama — WS Ticket

WebSocket handshake'i `Authorization` header'ı **taşıyamaz**. JWT'yi `?token=` ile
göndermek onu access log'lara, proxy loglarına ve tarayıcı geçmişine sızdırır.
Bunun yerine kısa ömürlü, **tek kullanımlık** bir bilet kullanılır:

```
POST /api/notifications/ws-ticket     (Authorization: Bearer <jwt>)
  → { data: { ticket: "<uuid>", expiresIn: 60 } }        Redis: SETEX ws:ticket:<uuid> 60 <userId>

GET  /api/notifications/ws?ticket=<uuid>                  Redis: GETDEL → userId
  → upgrade                                               (ticket tüketildi, tekrar kullanılamaz)
```

Geçersiz/kullanılmış/eksik ticket → soket `4401` koduyla kapatılır.

---

## Mesaj protokolü (server → client)

```jsonc
{ "event": "ready", "data": { "userId": "..." } }   // bağlantı doğrulandı
{ "event": "ping" }                                  // istemci "pong" (düz metin) ile cevaplar
{ "event": "notification", "data": {
    "id": "...", "type": "account.verified",
    "title": "E-posta adresiniz doğrulandı",
    "body": "Hesabınız aktif...", "data": null,
    "readAt": null, "createdAt": "2026-07-09T..."
} }
```

İstemci → server: yalnızca `"pong"` (düz metin string).

**Heartbeat:** sunucu 30sn'de bir `ping` yollar. 90sn boyunca `pong` gelmeyen
bağlantı kapatılır — TCP, kablosu çekilmiş istemciyi hemen fark etmez; bu
"yarı-açık" soketler temizlenmezse bellekte birikir.

---

## Bildirim tipleri

Katalog: `features/notifications/notifications.types.ts` → `NotificationType`.
DB'deki `type` bir `varchar`'dır (pgEnum değil) — yeni tip eklemek migration
gerektirmez. Katalog bir **typo güvenliği** katmanıdır, kapalı küme değil
(aynı kalıp: `*.permissions.ts`).

| `type` | Ne zaman | `data` |
|---|---|---|
| `account.verified` | E-posta doğrulandı | — |
| `account.suspended` | Hesap askıya alındı (ban) | — |
| `account.unsuspended` | Hesabın askısı kaldırıldı | — |
| `account.passwordReset` | Yönetici şifreyi sıfırladı → geçici şifreyle girip değiştir | — |
| `club.application.decided` | Kulüp kurma başvurusu onay/red | `{ applicationId, status, clubId }` |
| `club.membership.decided` | Katılma isteği onay/red | `{ clubId, status }` |
| `role.assigned` | Global rol atandı | `{ roleId, roleName }` |

---

## REST uçları

Hepsi `Authorization: Bearer <jwt>` ister.

| Method | Yol | Not |
|---|---|---|
| `POST` | `/api/notifications/ws-ticket` | WS bileti |
| `GET` | `/api/notifications?limit=20&cursor=<ISO>` | **Keyset** sayfalama, en yeniden eskiye |
| `GET` | `/api/notifications/unread-count` | Zil rozeti |
| `PATCH` | `/api/notifications/:id/read` | Başkasınınkine `404` (IDOR koruması) |
| `PATCH` | `/api/notifications/read-all` | `{ updated: n }` |

**Neden OFFSET değil keyset?** OFFSET sayfa derinleştikçe yavaşlar ve iki sayfa
arasında yeni bildirim gelirse kayıt atlanır/tekrarlanır — bir akış (feed) için
yanlıştır. `cursor` = son görülen satırın `createdAt`'i.

```jsonc
// GET /api/notifications?limit=20
{ "data": { "items": [...], "nextCursor": "2026-07-09T17:10:22.481Z" } }
// nextCursor null ise son sayfadasın
```

> `pending` (e-postasını doğrulamamış) kullanıcı bildirimlerini **görebilir** —
> zaten "hesabını doğrula" bildirimini okuması gerekiyor.

---

## Bildirim üretmek

```ts
import { notificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/notifications.types";

await notificationsService.notifySafe(userId, {
  type: NotificationType.CLUB_MEMBERSHIP_DECIDED,
  title: "Kulübe kabul edildiniz",
  body: "'Robotik Kulübü' üyeliğiniz onaylandı.",
  data: { clubId, status: "approved" },
});
```

**Her zaman `notifySafe` kullanın.** Hatayı loglayıp yutar. Bir kulüp başvurusunun
onaylanması, bildirim gönderilemedi diye başarısız olmamalıdır — bildirim bir yan
etkidir, asıl işlemin doğruluğunu etkilemez. (`notify` hata fırlatır.)

---

## Frontend — bağlanma ve yeniden bağlanma

`bun --hot` yeniden yüklerken (ve her deploy'da) açık soketler düşer. Yeniden
bağlanma mantığı **zorunludur**. Ticket tek kullanımlık olduğu için her denemede
yenisi alınmalıdır.

```ts
let ws: WebSocket | null = null;
let attempt = 0;
let closedByUs = false;

async function connect() {
  const res = await fetch("/api/notifications/ws-ticket", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const { data } = await res.json();

  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/api/notifications/ws?ticket=${data.ticket}`);

  ws.onopen = () => { attempt = 0; };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.event === "ping") return ws!.send("pong");        // heartbeat cevabı
    if (msg.event === "ready") return;
    if (msg.event === "notification") onNotification(msg.data);
  };

  ws.onclose = (e) => {
    if (closedByUs || e.code === 4401) return;                // yetkisiz → yeniden deneme
    // Exponential backoff + jitter (sunucu yeniden başlarken hepsi aynı anda vurmasın)
    const delay = Math.min(1000 * 2 ** attempt++, 30_000) * (0.5 + Math.random());
    setTimeout(connect, delay);
  };
}

function disconnect() { closedByUs = true; ws?.close(); }
```

`onNotification` içinde:
- Zil rozetini artır / `unread-count`'u refetch et.
- `type === "account.verified"` → kullanıcı profilini (`/api/auth/me`) refetch et ve
  "e-postanı doğrula" banner'ını kaldır. **Kullanıcı maili başka bir sekmede/cihazda
  doğrulamış olabilir; bu olay açık oturumu senkronlar.**

---

## Web Push (uygulama kapalıyken teslimat)

WebSocket yalnızca uygulama **açıkken** çalışır. **Web Push** (W3C Push API + VAPID),
kullanıcı sekmeyi/uygulamayı kapatmışken de bildirimi cihaza ulaştırır: tarayıcının
push servisi → **service worker** → OS bildirimi. İkisi **tamamlayıcıdır**, biri
diğerini değiştirmez.

| | WebSocket | Web Push |
|---|---|---|
| Ne zaman | uygulama açık | uygulama kapalı da |
| Taşıma | kendi sunucun | tarayıcının push servisi (FCM/Mozilla…) + VAPID |
| Kod | `notifications.gateway.ts` | `core/notifications/*` + `push.gateway.ts` |

**Sunucu tarafı akışı** (`notificationsService.notify`): (1) DB'ye yaz (kalıcılık),
(2) web push'ı **fire-and-forget** başlat (WS/Redis'ten bağımsız, best-effort),
(3) WS fanout. Push kanalı devre dışıysa (VAPID yok) sessizce atlanır — WS etkilenmez.
Push servisi `404/410` dönen ölü abonelikler **otomatik silinir** (`core` sender).

### ⚠️ Service Worker sözleşmesi — çift-bildirim önleme

İkili teslimatta (hem WS hem push) tehlike, kullanıcının aynı bildirimi **iki kez**
görmesidir. Bunu **service worker çözer** — çünkü odak/görünürlüğü yalnızca istemci bilir:

```js
// service-worker.js
self.addEventListener("push", (event) => {
  const n = event.data.json();               // { title, body, tag, data }
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const focused = clients.some((c) => c.focused || c.visibilityState === "visible");
    if (focused) {
      // Uygulama zaten açık/odaklı → WS canlı gösterdi. OS bildirimini GÖSTERME;
      // istersen client'a mesaj at (rozet güncelle vb.).
      clients.forEach((c) => c.postMessage({ type: "notification", data: n }));
      return;
    }
    // Kapalı/arka planda → OS bildirimini göster. `tag` = bildirim id → aynı bildirim üst üste binmez.
    await self.registration.showNotification(n.title, { body: n.body, tag: n.tag, data: n.data });
  })());
});
```

> Sunucu her ikisine de gönderir; **odaklanmışken bastırma kararı SW'dedir** (yalnızca
> istemci gerçekten "bakılıyor mu"yu bilir). `tag`=bildirim id ek güvenlik (dedup).

### REST uçları (kimlik: giriş + aktif hesap)

| Yöntem | Uç | İş |
|---|---|---|
| `GET` | `/api/notifications/push-key` | `{ enabled, publicKey }` — istemci `subscribe` için VAPID public key. `enabled:false` ise abone olma. |
| `POST` | `/api/notifications/push-subscribe` | `PushSubscription.toJSON()` (`{ endpoint, keys:{p256dh,auth} }`) kaydeder (endpoint'e göre upsert). |
| `DELETE` | `/api/notifications/push-subscribe` | `{ endpoint }` — bu cihazın aboneliğini siler. |

### Kurulum (VAPID)

```sh
bunx web-push generate-vapid-keys      # publicKey + privateKey üretir
```

`.env`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:). **İkisi de**
verilmezse web push graceful biçimde kapalı kalır. Public key gizli değildir; private
key gizlidir (prod'da environment secret).

## Bilinen sınırlar

- **`createdAt` cursor'ı teorik olarak eşitlenebilir.** Pratikte timestamp
  çözünürlüğü yeterli; tam determinizm gerekirse `(createdAt, id)` bileşik cursor'a
  geçilmelidir.
- **Bildirim silme / TTL yok.** Tablo süresiz büyür; ileride "90 günden eski
  okunmuşları sil" gibi bir temizlik işi (BullMQ cron) gerekir.
