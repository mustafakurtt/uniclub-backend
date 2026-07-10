# E-posta Doğrulama — Geliştirme Kurulumu

Kayıt olan kullanıcı `status: "pending"` ile oluşturulur ve okul e-postasına bir
doğrulama linki gönderilir. Link tıklanınca hesap `active` olur.

Yerelde **gerçek mail göndermiyoruz**: `docker-compose` içindeki **Mailpit** sahte
bir SMTP sunucusudur — gelen her maili yakalar ve HTML'iyle birlikte bir web
arayüzünde gösterir.

---

## Hızlı başlangıç

```sh
docker-compose up -d          # postgres + redis + mailpit
bun run dev
```

- Uygulama: <http://localhost:3000>
- **Gelen kutusu: <http://localhost:8025>** ← gönderilen mailleri burada gör

Sunucu açılışta SMTP'ye ulaşıp ulaşamadığını loglar:

```
📧 SMTP bağlantısı hazır: localhost:1025
📬 Gelen kutusu (Mailpit): http://localhost:8025
```

Ulaşamazsa uygulama **çökmez**, sadece uyarır (kuyruk gönderimi yeniden dener).

---

## Akış

```
POST /api/auth/register
   │  e-posta domain'i universityDomains'te aranır → tenant + rol otomatik atanır
   │  kullanıcı status: "pending" ile yaratılır
   ├─ emailVerifications satırı (tek kullanımlık UUID token, 24 saat geçerli)
   └─ BullMQ kuyruğuna iş atılır ────────────────┐
                                                  │ (arka planda, 3 deneme,
                                                  │  exponential backoff)
                                                  ▼
                                        nodemailer → SMTP :1025 → Mailpit
                                                  │
GET /api/auth/verify?token=<uuid>  ◄──────────────┘  (maildeki link)
   │  token geçerli + kullanılmamış + süresi dolmamış mı?
   └─ usedAt işaretlenir, kullanıcı "active" olur
```

Mail gönderimi kayıt isteğinin **içinde** yapılmaz: SMTP yavaş ya da erişilemez
olduğunda kullanıcı kaydı bekletilmemeli/başarısız olmamalıdır.

---

## Endpoint'ler

| Method | Yol | Açıklama |
|---|---|---|
| `POST` | `/api/auth/register` | Kayıt + doğrulama maili gönderir |
| `GET` | `/api/auth/verify?token=...` | Token'ı tüketir, hesabı aktifleştirir |
| `POST` | `/api/auth/resend-verification` | Doğrulama mailini yeniden gönderir |

### `POST /api/auth/resend-verification`

```jsonc
// istek
{ "email": "ogrenci@std.antalya.edu.tr" }

// yanıt — HER ZAMAN 200 ve HER ZAMAN aynı mesaj
{ "success": true,
  "message": "Eğer bu e-posta adresine ait doğrulanmamış bir hesap varsa, doğrulama maili gönderildi." }
```

Yanıt bilinçli olarak sabittir: aksi halde bu endpoint *"bu e-posta sistemde
kayıtlı mı?"* sorgusuna (**user enumeration**) dönüşürdü. Mail yalnızca gerçekten
`pending` bir hesap varsa gider; `active` ve `suspended` hesaplara gönderilmez.

**Yeniden gönderim eski linki öldürür.** Kullanıcının kullanılmamış tüm token'ları
`usedAt` ile tüketilmiş sayılır, sonra yenisi üretilir → aynı anda yalnızca **bir**
geçerli link dolaşır.

> Bu endpoint bir çıkmazı kapatıyor: link 24 saatte doluyor, ama e-posta zaten
> kullanımda olduğu için kullanıcı yeniden kayıt da olamıyordu.

### Hata mesajları (`/verify`)

| Durum | Mesaj |
|---|---|
| 400 | `Geçersiz doğrulama linki.` |
| 400 | `Bu doğrulama linki zaten kullanılmış.` |
| 400 | `Doğrulama linkinin süresi dolmuş. Yeni bir doğrulama maili talep edin.` |
| 200 | `E-posta adresiniz doğrulandı, hesabınız aktif.` |

---

## Mailpit'i kullanmak

**Web arayüzü:** <http://localhost:8025> — maili açıp HTML render'ını,
düz metin alternatifini ve ham kaynağını görebilirsin.

**API ile (script/test için):**

```sh
# kutudaki mailleri listele
curl -s http://localhost:8025/api/v1/messages | jq '.messages[] | {To, Subject}'

# bir mailin HTML'i (link buradan çıkarılır)
curl -s http://localhost:8025/api/v1/message/<ID> | jq -r '.HTML'

# kutuyu temizle
curl -X DELETE http://localhost:8025/api/v1/messages
```

Geliştirme modunda worker, Mailpit'i açmana gerek kalmasın diye linki konsola da
basar:

```
✅ [MAIL] Doğrulama maili gönderildi → Ahmet <ahmet@std.antalya.edu.tr> (id: <...>)
   🔗 Link      : http://localhost:3000/api/auth/verify?token=af1e291c-...
   📬 Gelen kutusu: http://localhost:8025
```

---

## Yapılandırma

`.env` (hepsinin makul varsayılanı var, `src/config/env.ts`):

| Değişken | Varsayılan | Not |
|---|---|---|
| `SMTP_HOST` | `localhost` | |
| `SMTP_PORT` | `1025` | Mailpit SMTP portu |
| `SMTP_SECURE` | `false` | 465 kullanıyorsan `true` |
| `SMTP_USER` / `SMTP_PASS` | — | Mailpit istemez; prod'da zorunlu |
| `MAIL_FROM` | `Kampüs Kulüp Sistemi <no-reply@kampus.local>` | |
| `APP_URL` | `http://localhost:3000` | Maildeki linkin tabanı |

## Prod'a geçerken

Kod değişmez — yalnızca env. Mailpit'i compose'dan çıkarıp gerçek bir sağlayıcı
girin (SES, Resend, Postmark, Mailgun…):

```sh
SMTP_HOST="email-smtp.eu-central-1.amazonaws.com"
SMTP_PORT=587
SMTP_SECURE=false          # 587 → STARTTLS
SMTP_USER="..."
SMTP_PASS="..."
MAIL_FROM="Kampüs Kulüp Sistemi <no-reply@senin-alan-adin.com>"
APP_URL="https://senin-alan-adin.com"
```

`APP_URL`'i frontend'e çevirirsen (`https://app.../verify?token=...`), frontend
token'ı alıp `GET /api/auth/verify`'a iletmelidir — o zaman kullanıcı JSON değil
düzgün bir sayfa görür. Bugün link doğrudan API'ye gidiyor ve JSON döner.

## Hız sınırı (rate limit)

`POST /api/auth/resend-verification` iki katmanla sınırlanır
(`src/middlewares/rate-limit.middleware.ts`):

| Anahtar | Limit | Neden |
|---|---|---|
| **e-posta** | 3 / saat | Korunan kaynak hedefin gelen kutusudur |
| IP | 30 / saat | Yalnızca kaba sel koruması |

Aşılınca `429` + `Retry-After` + `code: "RATE_LIMITED"`.

> **Neden IP değil e-posta?** Öğrenciler kampüs ağından tek bir public IP'nin
> (NAT) arkasından çıkar. IP başına sıkı bir limit, bir kişinin limiti
> doldurmasıyla **tüm kampüsü** kilitlerdi. `login` de aynı sebeple hesap
> (e-posta) başına sınırlanır, IP başına değil.

Limit e-postaya göre sayıldığı için endpoint hâlâ hesabın varlığını sızdırmaz:
hesap olmasa da sayaç artar.

Test/CI için `RATE_LIMIT_DISABLED=true`. Ters proxy arkasındaysan `TRUST_PROXY=true`
(aksi halde tüm istekler proxy'nin IP'si sayılır; proxy yokken `true` yapmak ise
IP sahteciliğine açar).

## Doğrulanmamış (`pending`) hesap ne yapabilir?

Giriş yapabilir ve **okuyabilir**, ama **yazamaz**:

- ✅ Login, kulüpleri gezme, bildirimlerini okuma, kendi profilini/şifresini değiştirme
- ❌ Kulübe katılma, kulüp başvurusu, duyuru/galeri oluşturma → `403` +
  `code: "EMAIL_NOT_VERIFIED"`

Kontrol `src/middlewares/verified-user.middleware.ts` →
`requireVerifiedUserForWrites`, `clubs.routes.ts` kökünde **metod bazlı** uygulanır
(GET serbest). Böylece feature'a sonradan eklenen her POST/PATCH/DELETE otomatik korunur.

Giriş bilinçli olarak serbest bırakıldı: arayüzdeki "e-postanı doğrula" uyarısının
ve "maili yeniden gönder" akışının çalışabilmesi için kullanıcının oturumu olmalı.

**Doğrulama anında etkilidir.** `verifyEmail`, `activateUser`'dan sonra
`invalidateUserPermissions` çağırır — `status` RBAC cache'ine gömülü olduğu için
(300s TTL) bu olmadan kullanıcı doğruladıktan sonra 5 dakika daha `pending`
görünürdü. Ayrıca `account.verified` bildirimi bağlı tüm cihazlara push'lanır
(bkz. [BILDIRIMLER.md](BILDIRIMLER.md)).

## Bilinen eksikler

- **Doğrulama linki API'ye gidiyor**, kullanıcı JSON görür. `APP_URL`'i frontend'e
  çevirip token'ı frontend'in `GET /api/auth/verify`'a iletmesi daha iyi bir UX olur.
