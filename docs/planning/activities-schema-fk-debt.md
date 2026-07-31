# Etkinlik şeması — FK `onDelete` ve attendee çapraz-tenant tasarım notu

**Durum:** Onay bekliyor (2026-07-31)  
**İlgili:** [schema-product.md §Merge borcu](schema-product.md), Tier 0.4 / Tier 1.1

Bu not **kod ve migration öncesi** karar kaydıdır. Onaylanmadan uygulanmayacak.

---

## Bağlam

`activities` merge sonrası beş FK'de açık `onDelete` politikası yok (PostgreSQL varsayılanı `NO ACTION`). Repo kuralı: her FK açık politika taşır. Ayrıca `activity_attendees` tenant kilidi yok — üniversitelerarası co-host bilinçli; `clubMembers` bileşik FK desenini kopyalamak turnuva senaryosunu kırar.

---

## 1. FK `onDelete` önerileri

| FK | Tablo.kolon | Öneri | Gerekçe |
|---|---|---|---|
| `activities.created_by` → `users.id` | `activities.createdBy` | **RESTRICT** | Kullanıcı silme = anonimleştirme (satır kalır, `deletedAt`). Etkinlik geçmişi ve audit için oluşturan referansı korunmalı; anonim kullanıcı id'si hâlâ geçerli PK. Fiziksel user silme yok. |
| `activity_clubs.activity_id` → `activities.id` | `activityClubs.activityId` | **CASCADE** | Etkinlik silinirse kulüp bağı anlamsız. Etkinlik bugün hard-delete değil (iptal = status); ileride hard delete olsa bağı temizlenmeli. |
| `activity_clubs.club_id` → `clubs.id` | `activityClubs.clubId` | **RESTRICT** | Kulüp silme yumuşak/arşiv akışı; aktif etkinlik bağlı kulübün silinmesi operasyonel olarak engellenmeli (service zaten kontrol eder). CASCADE kulüp silince etkinlik bağını sessizce koparırdı — turnuva co-host kaybı. |
| `activity_attendees.activity_id` → `activities.id` | `activityAttendees.activityId` | **CASCADE** | Etkinlik giderse RSVP satırları anlamsız. |
| `activity_attendees.user_id` → `users.id` | `activityAttendees.userId` | **RESTRICT** | Kullanıcı anonimleştirilir, satır silinmez; attendee geçmişi korunur (KVKK: kişisel alanlar user tarafında maskelenir). |

**Elenen alternatifler**

- `activities.createdBy` → SET NULL: oluşturan bilinmez olur; moderasyon/audit zayıflar.
- `activity_clubs.clubId` → CASCADE: kulüp soft-delete/operasyonel temizlikte co-host bağları ve çok-üniversiteli etkinlik kırılır.
- `activity_attendees.userId` → CASCADE: anonimleştirme yerine attendee satırını silmek katılım geçmişini yok eder.

**Mevcut veri / migration güvenliği:** Yalnızca FK constraint yeniden tanımı (`DROP CONSTRAINT` + `ADD … ON DELETE`). Mevcut satırlar orphan üretmez — hiçbir parent silinmiş değil. Seed + test DB'de uygulanabilir.

---

## 2. `activity_attendees` çapraz-tenant kuralı

### Ürün kuralı (öneri)

Bir kullanıcı bir etkinliğe RSVP verebilir **yalnızca** şu koşulda:

- Kullanıcının `universityId`, etkinliğin **accepted** `activity_clubs` bağlarındaki kulüplerin `universities.id` kümesinde yer alıyor.

Yani: tek-üniversite etkinliğinde host kulübün tenant'ı; çok-üniversiteli turnuvada host **veya** accepted co-host kulüplerinin tenant'larından birinde olmalı. Farklı tenant'tan “rastgele” katılım yok.

### Nerede zorlanır?

| Katman | Değerlendirme |
|---|---|
| **Şema (bileşik FK)** | `clubMembers` desenini kopyalamak **uygun değil** — attendee'nin tenant'ı etkinliğin co-host tenant kümesinden biri olmalı; tek `university_id` kolonu yeterli değil ve çapraz-üniversite katılımı composite FK ile ifade edilemez. |
| **Servis (önerilen)** | `activities.service` RSVP yolunda: accepted host/co-host kulüplerinin `universityId` setini çek, `user.universityId` ∈ set. Mevcut keşif/görünürlük mantığıyla uyumlu. |
| **DB trigger** | İsteğe bağlı ikinci savunma; karmaşıklık yüksek, ço-üniversite M:N için trigger bakımı zor. |

**Elenen:** `activity_attendees` üzerinde `(userId, universityId)` composite FK ile `clubs` kilidi — attendee'de `universityId` yok; user'dan türetilir ve co-host tenant kümesi çoklu.

### Test / doğrulama (uygulama sonrası)

- Aynı tenant host etkinliği → RSVP OK.
- Çok-üniversiteli etkinlik, co-host tenant'ında öğrenci → OK.
- Tenant dışı öğrenci → 403/404 (mevcut izolasyon testleriyle aynı yüzey).

---

## 3. Onay sonrası uygulama sırası (özet)

1. Migration: beş FK `onDelete` yeniden tanımı.
2. Servis: RSVP öncesi tenant ∈ accepted-club-universities kontrolü.
3. Test: FK davranışı (mock/integration), çapraz-tenant RSVP reddi.
4. `schema-product.md` merge borcu satırını kapat.

---

## 4. Enum paylaşımı (duyuru / etkinlik) — kayıt

Duyurular `activity_status` / `activity_visibility` PostgreSQL enum'larını paylaşıyor. **Bilinçli karar:** aynı semantik, tek migration yüzeyi; maliyet: etkinliğe enum değeri eklendiğinde duyurular da o değeri alır. Yeniden adlandırma (`content_status`) şimdilik ertelendi — yorumlar `activities.ts` / `announcements.ts` dosyalarında.
