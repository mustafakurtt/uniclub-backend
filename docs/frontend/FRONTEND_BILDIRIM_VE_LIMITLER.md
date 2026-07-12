# Frontend — Bildirimler, Hız Sınırı ve Doğrulanmamış Hesap

**Kime:** Frontend ekibine. **Ne:** Üç yeni davranış geldi — gerçek zamanlı
bildirimler (WebSocket), `429` hız sınırı ve `pending` hesabın yazma kilidi.

> Mimari ayrıntı: [BILDIRIMLER.md](BILDIRIMLER.md). Mail akışı: [MAIL_DOGRULAMA.md](MAIL_DOGRULAMA.md).

---

## 0. TL;DR

| # | Değişiklik | Frontend'de yapılacak | Kırıcı? |
|---|---|---|:---:|
| 1 | `account.verified` WS olayı | Banner'ı otomatik kaldır (**senin bildirdiğin bug**) | ➖ |
| 2 | `pending` hesap yazma yapamaz → `403 EMAIL_NOT_VERIFIED` | Bu kodu yakala, resend akışına yönlendir | ✅ **Evet** |
| 3 | `429` + `Retry-After` + `code: "RATE_LIMITED"` | Butonu geri sayımla kilitle | ✅ **Evet** |
| 4 | Bildirim zili (liste + okunmamış sayısı) | Yeni UI | ➖ Additive |

---

## 1. "Doğruladım ama uyarı ekranda kaldı" — çözüldü

Bunun **iki** sebebi vardı, ikisi de backend'de düzeltildi:

1. **Gerçek bug:** `verifyEmail` hesabı `active` yapıyor ama RBAC cache'ini
   temizlemiyordu. `status` o cache'e gömülü (300s TTL) → sistem 5 dakika daha
   `pending` görüyordu. Frontend ne yaparsa yapsın düzelmezdi. Artık doğrulama
   anında invalidate ediliyor: `GET /api/users/me/permissions` **aynı saniyede**
   `status: "active"` dönüyor.
2. **Senkronizasyon:** kullanıcı maili genelde **başka bir sekmede/cihazda** açar.
   Açık olan sekmenin haberi olmuyordu. Artık `account.verified` WS olayı
   **bağlı tüm cihazlara** düşüyor.

**Yapılacak:** WS'ten `account.verified` gelince `me`'yi (ve `me/permissions`'ı)
refetch et, banner'ı kaldır.

```ts
if (notification.type === "account.verified") {
  queryClient.invalidateQueries({ queryKey: ["me"] });
  queryClient.invalidateQueries({ queryKey: ["me", "permissions"] });
}
```

---

## 2. `pending` hesap: okuyabilir, yazamaz

Karar: doğrulanmamış kullanıcı **giriş yapabilir** ve gezebilir — böylece senin
`MainLayout`'taki pending banner'ın ve `ResendVerificationButton`'ın çalışmaya
devam eder. Yalnızca **yazma** işlemleri kilitli.

| İşlem | Durum |
|---|---|
| Login, `GET /api/clubs`, kulüp detayı, bildirimleri okuma | ✅ serbest |
| Kulübe katılma/ayrılma, kulüp başvurusu, duyuru/galeri oluşturma | ❌ `403` |
| Kendi profilini/şifresini değiştirme | ✅ serbest (bilinçli — kullanıcı şifresini düzeltebilmeli) |

Reddedilen istek:

```jsonc
// 403
{ "success": false,
  "code": "EMAIL_NOT_VERIFIED",
  "message": "Bu işlem için e-posta adresinizi doğrulamanız gerekiyor." }
```

⚠️ **`code` alanına bak, mesaja string-match etme.** Genel yetki 403'ü
(`"Bu işlem için yetkiniz bulunmamaktadır."`) `code` taşımaz.

```ts
// merkezi interceptor
if (res.status === 403 && body.code === "EMAIL_NOT_VERIFIED") {
  showVerifyEmailModal();   // ResendVerificationButton'ı içinde göster
  return;
}
```

---

## 3. Hız sınırı (`429`)

```jsonc
// 429
{ "success": false, "code": "RATE_LIMITED",
  "message": "Çok fazla deneme yaptınız. Lütfen 60 dakika sonra tekrar deneyin." }
```

Başlıklar: `Retry-After` (saniye), `RateLimit-Limit`, `RateLimit-Remaining`,
`RateLimit-Reset`.

| Endpoint | Limit | Anahtar |
|---|---|---|
| `POST /auth/resend-verification` | 3 / saat | **e-posta** |
| `POST /auth/login` | 10 / 15 dk | **e-posta (hesap)** |
| `POST /auth/register` | 60 / saat | IP |

> **Neden e-posta bazlı?** Öğrenciler kampüs ağından tek bir public IP'nin (NAT)
> arkasından çıkar. IP başına limit koysaydık bir kişinin limiti doldurması **tüm
> kampüsü** kilitlerdi. Bu yüzden `login` ve `resend` hesabın kimliğine göre
> sayılır — arkadaşınla yan yana otururken senin limitin onu etkilemez.

**Yapılacak:** Senin belirttiğin gibi butonun kendini kilitlemesi sayfa yenilenince
sıfırlanıyordu. Artık backend sınırlıyor. UI'da `Retry-After`'ı okuyup geri sayım
göster:

```ts
if (res.status === 429) {
  const seconds = Number(res.headers.get("Retry-After") ?? 60);
  setCooldownUntil(Date.now() + seconds * 1000);   // butonu bu süre boyunca disable et
  toast.error(body.message);                        // backend mesajı hazır Türkçe
}
```

`resend-verification` hâlâ hesabın varlığını sızdırmaz: limit body'deki e-postaya
göre sayılır, hesap olmasa da sayaç artar.

---

## 4. Bildirim zili

### Bağlanma

Ticket **tek kullanımlıktır ve 60 saniye yaşar** — her (yeniden) bağlanmada yenisini al.

```ts
const { data } = await api.post("/api/notifications/ws-ticket");   // { ticket, expiresIn }
const proto = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${proto}://${location.host}/api/notifications/ws?ticket=${data.ticket}`);
```

Tam örnek (yeniden bağlanma + backoff + heartbeat) için
[BILDIRIMLER.md → Frontend](BILDIRIMLER.md#frontend--bağlanma-ve-yeniden-bağlanma).

**Üç kural:**
1. `{"event":"ping"}` gelince `"pong"` (düz metin) gönder — yoksa 90sn'de kopar.
2. `onclose` → exponential backoff + **jitter** ile yeniden bağlan. Jitter şart:
   sunucu yeniden başladığında tüm istemciler aynı anda vurmasın.
3. `close code 4401` → yetkisiz, yeniden **deneme**. Kullanıcıyı login'e yolla.

### REST

| Method | Yol | Not |
|---|---|---|
| `GET` | `/api/notifications?limit=20&cursor=<ISO>` | Keyset sayfalama |
| `GET` | `/api/notifications/unread-count` | `{ count }` — zil rozeti |
| `PATCH` | `/api/notifications/:id/read` | |
| `PATCH` | `/api/notifications/read-all` | `{ updated: n }` |

Sonsuz kaydırma OFFSET değil **cursor** ile:

```ts
const { items, nextCursor } = res.data;
// nextCursor null ise son sayfa. Bir sonraki istek: ?cursor=<nextCursor>
```

### Bildirim tipleri ve derin link

`type` alanına göre ikon + tıklama hedefi:

| `type` | `data` | Nereye götür |
|---|---|---|
| `account.verified` | — | `me`'yi refetch et, banner'ı kaldır |
| `account.suspended` | — | Oturumu sonlandır |
| `account.unsuspended` | — | Bilgilendir; kullanıcı yeniden erişebilir |
| `account.passwordReset` | — | Geçici şifre uyarısı; giriş sonrası zorunlu şifre değiştirme (`mustChangePassword`) |
| `club.application.decided` | `{ applicationId, status, clubId }` | `status==="approved"` ? kulüp sayfası : başvuru detayı |
| `club.membership.decided` | `{ clubId, status }` | Kulüp sayfası |
| `role.assigned` | `{ roleId, roleName }` | `me/permissions` refetch (yeni menüler açılır) |

Tip listesi kapalı değil — tanımadığın bir `type` gelirse **çökme**, jenerik bir
ikonla `title`/`body`'yi göster.

---

## 5. Bilinen sınırlar

- **Uygulama kapalıyken push yok.** WS yalnızca sayfa açıkken çalışır. Gerçek push
  (kapalı uygulama/mobil) için Web Push (VAPID) ayrı bir katman — henüz yok.
- **`account.suspended` bildirimi** sokete düşer ama sonraki HTTP isteği zaten
  `403` alır; interceptor'ın oturumu kapatmalı.
