# Kamuya açık yüzey (T10.3 / T10.5)

Kimlik doğrulama **olmadan** okunabilen tanıtım/afiş QR yüzeyi. Yazma yok; yalnızca
okuma. Tenant sınırı URL'deki `universitySlug` ile; gizli veya başka tenant kaynakları
**404** (403 ile ayırt edilmez).

> Genel zarf ve hata kuralları: [reference/api.md](../reference/api.md).

## URL tasarımı

Tenant çözümü **URL'den** (`universities.slug` global benzersiz; kulüp `slug` tenant
içinde benzersiz):

| Method | Path | Açıklama |
|---|---|---|
| GET | `/api/public/universities/:universitySlug/clubs/:clubSlug` | Kulüp tanıtım + yaklaşan etkinlikler |
| GET | `/api/public/universities/:universitySlug/activities/:activityId` | Tek etkinlik detayı |

`activityId` UUID — tenant doğrulaması sunucuda: etkinliğin **accepted** host/co-host
kulüplerinden en az biri bu `universitySlug` tenant'ına ait olmalı.

## Ne görünür / ne görünmez

| Görünür (public DTO) | Asla görünmez |
|---|---|
| Kulüp: ad, slug, açıklama, logo, kapak, iletişim linkleri | Üye listesi, danışmanlar, başkan/yönetici adları (v1 KVKK kararı) |
| Etkinlik: ad, açıklama, yer, kapak, başlangıç/bitiş, kontenjan | Katılımcı listesi, `goingCount`, RSVP, yazar/creator |
| Host/co-host kulüp: ad, slug, logo | E-posta, öğrenci no, `userId`, fotoğraf URL'i kişiye bağlı |
| Tenant: ad, slug, logo (kulüp sayfasında) | `draft`, `cancelled`, `members` görünürlük, zamanlanmış taslak |

Yanıtlar **public DTO** ile üretilir; entity doğrudan serialize edilmez.

## Görünürlük kuralları (sunucu zorunlu)

- Etkinlik: yalnızca `status = published` ve `visibility = university`.
- Kulüp: yalnızca `status = approved`.
- Tenant: `suspended` veya soft-delete → 404.
- Zamanlanmış ama vakti gelmemiş içerik → `draft` gibi **404**.

## Hız sınırı ve önbellek

- **IP başına** 120 istek/dakika (`publicReadIpLimit`); kimlik yok.
- `TRUST_PROXY=true` ise `X-Forwarded-For` ilk girdi kullanılır.
- Yanıtlar `public:` cache keyspace'te TTL **300s** (kimliğe bağlı değil).

## Frontend notları

- QR/afiş linki: `https://<app>/public/...` frontend rotası; API yolu yukarıdaki
  `/api/public/...` ile eşleştirilir.
- Kayıtsız "ilgileniyorum" (e-posta) **bu turda yok** — T10.3 genişlemesi.
- Takvime ekle (.ics) **bu turda yok** — aynı iz.
