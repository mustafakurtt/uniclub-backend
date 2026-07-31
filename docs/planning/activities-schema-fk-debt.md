# Etkinlik şeması — FK `onDelete` ve attendee çapraz-tenant tasarım notu

**Durum:** Uygulandı (2026-07-31)  
**İlgili:** [schema-product.md §Merge borcu](schema-product.md), Tier 0.4 / Tier 1.1

---

## Bağlam

`activities` merge sonrası beş FK'de açık `onDelete` politikası yoktu (PostgreSQL varsayılanı `NO ACTION`). Repo kuralı: her FK açık politika taşır. Ayrıca `activity_attendees` tenant kilidi yok — üniversitelerarası co-host bilinçli; `clubMembers` bileşik FK desenini kopyalamak turnuva senaryosunu kırar.

---

## 1. FK `onDelete` önerileri

| FK | Tablo.kolon | Politika | Gerekçe |
|---|---|---|---|
| `activities.created_by` → `users.id` | `activities.createdBy` | **RESTRICT** | Kullanıcı silme = anonimleştirme (satır kalır, `deletedAt`). Etkinlik geçmişi ve audit için oluşturan referansı korunmalı; anonim kullanıcı id'si hâlâ geçerli PK. Fiziksel user silme yok. |
| `activity_clubs.activity_id` → `activities.id` | `activityClubs.activityId` | **CASCADE** | Etkinlik silinirse kulüp bağı anlamsız. Etkinlik bugün hard-delete değil (iptal = status); ileride hard delete olsa bağı temizlenmeli. |
| `activity_clubs.club_id` → `clubs.id` | `activityClubs.clubId` | **RESTRICT** | Kulüpler bu üründe **silinmez**, `deletedAt` yok, yalnızca `status = archived` ve silme ucu yok. RESTRICT, ileride bir hard-delete yolu açılırsa etkinlik bağlarının sessizce kopmasını engeller — turnuva/co-host grafı korunur. |
| `activity_attendees.activity_id` → `activities.id` | `activityAttendees.activityId` | **CASCADE** | Etkinlik giderse RSVP satırları anlamsız. |
| `activity_attendees.user_id` → `users.id` | `activityAttendees.userId` | **RESTRICT** | Kullanıcı anonimleştirilir, satır silinmez; attendee geçmişi korunur (KVKK: kişisel alanlar user tarafında maskelenir). |

**Elenen alternatifler**

- `activities.createdBy` → SET NULL: oluşturan bilinmez olur; moderasyon/audit zayıflar.
- `activity_clubs.clubId` → CASCADE: kulüp satırı silinirse co-host bağları ve çok-üniversiteli etkinlik kırılır.
- `activity_attendees.userId` → CASCADE: anonimleştirme yerine attendee satırını silmek katılım geçmişini yok eder.

**Mevcut veri / migration güvenliği:** Yalnızca FK constraint yeniden tanımı (`DROP CONSTRAINT` + `ADD … ON DELETE`). Mevcut satırlar orphan üretmez — hiçbir parent silinmiş değil. Seed + test DB'de uygulanabilir.

---

## 2. Kulüp silme — ürün kararı ve tablolar arası tutarlılık

**Karar (2026-07-31, toparlama turu):** Bu üründe kulüp **silme yok**. `clubs` şemasında `deletedAt` yok; soft delete yok; kulüp silme API'si yok. Yaşam döngüsü `status` üzerinden (ör. `archived`). Tenant offboarding ayrı bir akış olarak ele alınacak; fiziksel kulüp satırı silme varsayılmıyor.

**Şema tepkisi — tutarlı RESTRICT:**

| Tablo | FK politikası | Anlam |
|---|---|---|
| `announcements.club_id` → `clubs` | **RESTRICT** | Kulüp satırı silinmez; duyurular orphan üretmez çünkü silme yok. CASCADE “kulüp giderse duyuru gitsin” okuması ürün kararıyla çelişiyordu. |
| `announcements` bileşik FK (`club_id`, `university_id`) → `clubs` | **RESTRICT** | Tenant kilidi + aynı silme yok varsayımı. |
| `activity_clubs.club_id` → `clubs` | **RESTRICT** | Etkinlik bağ grafiği (turnuva/co-host) sessizce kopmamalı — hipotetik hard-delete yolunda da koruma. |

**İleride kulüp silme eklenirse:** Önce etkinlik bağları (`activity_clubs`) ve içerik (duyurular, galeri vb.) arşiv veya soft-delete akışına taşınmalı; fiziksel `clubs` satırı silme RESTRICT yüzünden son adım olur veya ürün kararı değişirse migration ile CASCADE politikası yeniden değerlendirilir.

**Migration:** `announcements` FK'leri CASCADE → RESTRICT (`202607312*` toparlama migration). Mevcut veride orphan üretmez — hiçbir parent silinmiş değil.

---

## 3. `activity_attendees` çapraz-tenant kuralı

### Bu tur ne yaptı?

**Yeni erişim kontrolü getirilmedi.** Çapraz-tenant RSVP kuralı `resolveViewable` içinde zaten vardı (accepted kulüplerin tenant kümesi ∩ çağıranın `universityId`). Bu tur:

- Mantığı `assertCanRsvp` altında topladı (refactor — tek kapı, RSVP ve detay paylaşır)
- Kontrol sırasını korudu: **tenant → yayın durumu → görünürlük** (tenant 404 önce; varlık sızdırmaz)
- Şema FK `onDelete` borcunu kapattı
- Davranışı kilitleyen testler ekledi

Şema seviyesinde attendee tenant kilidi **hâlâ yok** — üniversitelerarası co-host bilinçli; `clubMembers` bileşik FK desenini kopyalamak turnuva senaryosunu kırar.

### Ürün kuralı (mevcut — kayıt)

Bir kullanıcı bir etkinliğe RSVP verebilir **yalnızca** şu koşulda:

- Kullanıcının `universityId`, etkinliğin **accepted** `activity_clubs` bağlarındaki kulüplerin `universities.id` kümesinde yer alıyor.

Yani: tek-üniversite etkinliğinde host kulübün tenant'ı; çok-üniversiteli turnuvada host **veya** accepted co-host kulüplerinin tenant'larından birinde olmalı. Farklı tenant'tan “rastgele” katılım yok.

### Görünürlük ile birleşim

Tenant ve görünürlük **ikisi de geçmeli** — tenant ilk sıradadır (404, varlık sızdırmaz):

1. **Tenant:** çağıranın `universityId` accepted kulüplerin tenant kümesinde olmalı (dış tenant → `activity.notFound` → 404).
2. **Yayın durumu:** `draft` → 404; `cancelled` → 400.
3. **Görünürlük:** `visibility = members` ise çağıran accepted kulüplerden birinin onaylı üyesi olmalı (`activity.membersOnly` → 403).

Örnek: tenant dışı + `members` etkinlik → 404 (403 değil). Tenant dışı + iptal edilmiş → 404 (400 değil). Aynı tenant + üye değil → 403.

### Co-host geri çekilme

Kural accepted bağlara dayanır. **Karar:** Co-host daha önce kabul etmiş, o tenant'tan öğrenciler RSVP vermiş, sonra co-host çekilmiş olsa bile **mevcut RSVP satırları kalır**. Öğrenci kulüpler arası politikanın bedelini ödememeli; geri çekme yalnızca yeni katılımı (ve keşif/görünürlük) etkiler, geçmiş RSVP'leri otomatik silmez.

### Nerede zorlanır?

| Katman | Değerlendirme |
|---|---|
| **Şema (bileşik FK)** | `clubMembers` desenini kopyalamak **uygun değil** — attendee'nin tenant'ı etkinliğin co-host tenant kümesinden biri olmalı; tek `university_id` kolonu yeterli değil. |
| **Servis** | `assertCanRsvp` — mevcut kuralın refactor'u; `resolveViewable` aynı kapıyı paylaşır. |
| **DB trigger** | Elenen — M:N co-host için bakım maliyeti yüksek. |

---

## 4. Enum paylaşımı (duyuru / etkinlik) — kayıt

Duyurular `activity_status` / `activity_visibility` PostgreSQL enum'larını paylaşıyor. **Bilinçli karar:** aynı semantik, tek migration yüzeyi; maliyet: etkinliğe enum değeri eklendiğinde duyurular da o değeri alır. Yeniden adlandırma (`content_status`) şimdilik ertelendi — yorumlar `activities.ts` / `announcements.ts` dosyalarında.
