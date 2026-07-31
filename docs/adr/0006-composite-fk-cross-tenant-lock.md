# ADR 0006 — Çapraz-tenant kilidi: bileşik yabancı anahtarlar

**Durum:** Kabul edildi (Temmuz 2026, Tier 1.1)  
**Tarih:** 2026-07-31

## Bağlam

Çok kiracılı modelde `clubMembers` yalnızca `(club_id, user_id)` tutuyordu.
Servis katmanında bir hata ile A üniversitesindeki kullanıcı B üniversitesinin
kulübüne yazılabilirdi — satır veritabanında **geçerli** sayılırdı. Uygulama
katmanı tek savunma hattıydı; regression veya yeni endpoint bu garantiyi kırabilir.

`announcements.universityId` gibi denormalize kolonlar da kulübün üniversitesiyle
otomatik eşleşmiyordu.

## Karar

Veritabanı seviyesinde **bileşik yabancı anahtar** kilidi:

1. `clubs` ve `users` üzerinde `UNIQUE (id, university_id)` (bileşik FK hedefi).
2. Alt tablolarda (`club_members`, `club_advisors`, `announcements`, …) denormalize
   `university_id` + `FOREIGN KEY (club_id, university_id) REFERENCES clubs(id, university_id)`
   (ve kullanıcı tarafında benzeri).
3. Mevcut satırlar migration içinde backfill edilir.
4. Repository/servis yeni yazımlarda `university_id` doldurur.

Kaynak: `src/db/schema.ts` (`clubMembers` üstü yorum bloğu), migration
`20260731132233_capraz_tenant_kilidi`, `tests/tenant-integrity.test.ts`.

## Gerekçe

**Savunma derinliği:** Son katman DB; uygulama hatası anında reddedilir.
Multi-tenant SaaS'ta "yanlış tenant'a yazma" en yüksek risk sınıfından biri.

Denormalize `university_id` burada sadece raporlama için değil — **kilidin parçası**
(`schema.ts`: "denormalizasyon değil, kilidin kendisidir").

## Elenen alternatifler

| Alternatif | Neden elendi |
|---|---|
| **Yalnızca servis/repo doğrulaması** | Tek hata tüm kiracıları etkiler; code review yeterli değil. Mevcut durum buydu — yetersiz bulundu. |
| **PostgreSQL Row-Level Security (RLS)** | Okuma tarafı savunması değerli ama migration/operasyon karmaşıklığı yüksek; Tier 1.1 sonrası ertelendi (`GOREV_PANOSU` A1 notu). |
| **Her sorguda manuel `WHERE university_id = ?`** | Unutulabilir; JOIN'lerde hata riski. |
| **Trigger ile doğrulama** | FK'den daha az standart; Drizzle şemada görünmez. |

## Sonuçlar

**İyi:**
- Çapraz-tenant yazma DB'de reddedilir — integration test ile kanıtlanır.
- Şema yorumları gelecek geliştiriciye niyeti anlatır.
- Denormalize kolonlar tenant-scoped sorguları hızlandırabilir.

**Kötü:**
- Migration ve backfill riski (mevcut veri kirliyse migration başarısız).
- Her yeni alt tablo aynı deseni taşımalı — unutulursa açık kalır.
- Platform hesapları (`users.university_id IS NULL`) kulüp üyeliğine yazılamaz
  (kasıtlı — `schema.ts` yan etki notu).

## Ne zaman yeniden değerlendirilir

- RLS okuma tarafı eklendiğinde (çift savunma).
- Yeni tenant izolasyon deseni (ör. bölge/çoklu üniversite scope) şemayı değiştirirse.
- Performans: bileşik FK join maliyeti sorun çıkarırsa (şu an ölçüm yok).
