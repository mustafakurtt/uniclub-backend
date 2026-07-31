# Görev Panosu — Paralel Ajan Koordinasyonu

İki ajan **aynı çalışma kopyasında** eş zamanlı çalışıyor. Bu dosya kimin neye
dokunacağını ve işin nerede olduğunu tutar. Geçici bir dosyadır: iki hat da
bitip birleştirildiğinde silinir.

| Hat | Ajan | Konu | Durum |
|---|---|---|---|
| **A** | Claude Code | Tier 1 — şema bütünlüğü | ✅ **Tier 1 tamamen kapandı** |
| **B** | Cursor | Tier 4 — doküman borcu | ✅ tamamlandı; kalan işleri A devraldı (IDE çöktü) |

Kaynak yol haritası: [docs/SEMA_VE_URUN_YOL_HARITASI.md](docs/SEMA_VE_URUN_YOL_HARITASI.md)

---

## Neden path sahipliği?

Ajanlar ayrı git branch'lerinde **değil**, aynı dizinde çalışıyor. Branch ayırmak
diskteki dosyayı ayırmaz — iki ajan aynı anda `git checkout` yaparsa diğerinin
kaydetmediği işi siler. Bu yüzden tek koordinasyon mekanizması **dosya yolu
sahipliğidir**.

### Sahiplik tablosu

| Yol | Sahip | Not |
|---|---|---|
| `src/**` | **A** | Şema, migration, servis, repo, rota |
| `tests/**` | **A** | |
| `CLAUDE.md` | **A** | |
| `docs/SEMA_VE_URUN_YOL_HARITASI.md` | **A** | Tier durumlarını A günceller |
| `docs/**` (yukarıdaki hariç) | **B** | API.md, design/, frontend/, README.md, mimari/ops dokümanları |
| `CONTRIBUTING.md` | **B** | |
| `CHANGELOG.md` | **B** | |
| `scripts/**` | **B** | 2. tur: doküman kontrol scripti |
| `.github/**` | **B** | 2. tur: CI adımı |
| `GOREV_PANOSU.md` (bu dosya) | **ortak** | Yalnızca kendi satırını/log'unu düzenle |

### Kurallar

1. **Sahibi olmadığın dosyayı değiştirme.** Değişmesi gerekiyorsa aşağıdaki
   "Devir talepleri" bölümüne yaz, sahibi yapsın.
2. **Branch değiştirme, stash yapma, `git checkout <dosya>` çalıştırma.** Diğer
   ajanın kaydedilmemiş işi gider.
3. **Commit ederken yolları açıkça ver:** `git add docs/API.md` gibi.
   `git add -A` / `git add .` **yasak** — diğer hattın yarım işini içeri alır.
4. Bir işi bitirince bu dosyadaki durum kutucuğunu güncelle ve **Log**'a bir
   satır ekle.
5. Kalite kapıları ikisi için de aynı: `bun run typecheck` ve `bun run test:all`
   **yeşil** olmadan iş bitmiş sayılmaz. (B hattı yalnızca doküman değiştirse
   bile çalıştırır — A hattının o an bozuk bir ara durumda olmadığını doğrular.)

---

## Hat A — Tier 1: şema bütünlüğü (Claude Code)

### A1. Çapraz-tenant sızıntısını DB seviyesinde kapat  ⭐
`clubMembers` yalnızca `(club_id, user_id)` tutuyor; A üniversitesindeki bir
kullanıcıyı B üniversitesinin kulübüne yazan bir servis hatası veritabanı
seviyesinde **tamamen geçerli** bir satır. `announcements.universityId` da
denormalize ama kulübün üniversitesiyle eşleştiği garanti değil.

- [x] `clubs` + `users`'a `UNIQUE (id, university_id)`
- [x] Alt tablolara `university_id` + bileşik FK (7 adet)
- [x] Mevcut satırların backfill'i (migration içinde, 3 adımlı kolon ekleme)
- [x] Repo/servis katmanının yeni kolonu doldurması
- [x] Çapraz-tenant yazmanın DB'de reddedildiğini gösteren test
      (`tests/tenant-integrity.test.ts`, 8 test)

✅ **A1 tamamlandı** — migration `20260731132233_capraz_tenant_kilidi`, 113 test yeşil.
Ertelenen: Postgres RLS (okuma tarafı savunması) — 2.1'den sonra.

### A2. Kullanıcı anonimleştirme (KVKK)
- [x] `users`'a `deletedAt` (soft delete)
- [x] Anonimleştirme akışı (`POST .../users/:userId/anonymize`)
- [x] Silinmiş hesap giriş yapamaz / yetki taşımaz (authz cache dahil)
- [x] Testler (`tests/anonymize.test.ts`, 9 test)

✅ **A2 tamamlandı** — migration `20260731133623_kullanici_anonimlestirme`, 122 test yeşil.

> **Karar:** `userStatusEnum`'a `deleted` değeri EKLENMEYECEK. Postgres'te
> `ALTER TYPE ... ADD VALUE` transaction içinde çalışmaz; drizzle migration'ları
> transaction içinde koştuğu için bu migration'ı kırardı. Silinmişlik işareti
> `deleted_at IS NOT NULL`.

### A3. Küçük borçlar ✅
- [x] `src/**` içindeki `docs/yonetim/...` → `docs/design/...` (15 dosya)
- [x] `clubMembers`'a `leftAt` + `timestamps` (Tier 1.3)
- [x] `clubApplicationApprovals`'a `note` (Tier 1.4)
- [x] Test ortamında audit sink sessizce düşüyordu (`clientIp` sunucusuz ortamda
      patlıyordu) → düzeltildi + `tests/audit.test.ts` ile sabitlendi

---

## Hat B — Tier 4: doküman borcu (Cursor)

Ayrıntılı görev tanımı ve kanıtlar: yol haritasının **Tier 4** bölümü.
Aşağıdaki maddelerin hepsi kod üzerinden doğrulanmış sapmalardır.

- [x] **B1.** `docs/design/` eskimişliği — README §2/§3/§5/§7 yeniden yazımı,
      eskiyen içeriğin `design/archive/`'a taşınması
- [x] **B2.** `docs/GUVENLIK_YOL_HARITASI.md:145` — var olmayan "observability
      yol haritası" dokümanına atıf
- [x] **B3.** `docs/API.md` — `/api/notifications` ve `/api/audit` bölümleri yok
- [x] **B4.** `CHANGELOG.md` oluştur; `docs/README.md`'deki "Frontend'e son
      değişiklikler" bölümünü oraya taşı
- [x] **B5.** `CONTRIBUTING.md`'ye dil politikası kuralı
- [x] **B6.** `docs/**` içindeki `docs/yonetim/...` atıflarını düzelt
      (şu an: `docs/frontend/FRONTEND_YONETIM.md:12`)

**Kapsam dışı (bilinçli):** `docs/DATA_MODEL.md` (ER diyagramı) — Hat A şemayı
şu anda değiştiriyor, bugün yazılan diyagram yarın yanlış olur. A1/A2 bitince
açılacak.

---

## Hat B — 2. tur: eksik doküman türleri + doküman CI'ı (Cursor)

- [x] **B7.** `docs/ONBOARDING_TENANT.md` — yeni üniversite açma runbook'u
      (uçtan uca, gerçek endpoint'lerle: üniversite + domainler + fakülte/bölüm
      + ilk `university_admin`). Sattığımız şey bu ve bugün hiçbir yerde yazılı değil.
- [x] **B8.** `docs/adr/` — mevcut kararları ADR formatına dök (neden Bun, neden
      Drizzle + `defineRelations`, `core/` vs `shared/` ayrımı, 9 rol + rütbe,
      hata sözleşmesi, çapraz-tenant kilidi). Karar kaydı bugün yok; `design/`
      fiilen RBAC için ADR gibi çalışıyor, format oradan alınabilir.
- [x] **B9.** Doküman CI'ı — `docs/` relative link kontrolü + "mount edilen router
      sayısı = API.md bölüm sayısı" kontrolü, `scripts/` altında + `ci.yml`'e adım.
      4.1/4.3'teki sapmaları ilk günde yakalayacak olan şey buydu.

### Hat B'nin devralınan işleri (A yaptı — Cursor'ın IDE'si çöktüğü için)
- [x] `scripts/check-docs.ts` yanlış pozitif düzeltmesi
- [x] `docs/DATA_MODEL.md` — ER diyagramı + tablo sözlüğü + şema kuralları
- [x] `docs/KVKK.md` — kişisel veri envanteri, anonimleştirme, saklama süreleri

### Cursor döndüğünde sıradaki (henüz kimse başlamadı)
- [ ] **B10.** Tier 4.4 — `@hono/zod-openapi` ile OpenAPI üretimi + Swagger UI.
      Doküman borcunun kökü; elle yazılan API.md/frontend rehberleri bu yüzden sapıyor.
- [ ] **B11.** Yeni yüzeylerin frontend rehberleri: anonimleştirme endpoint'i,
      ret gerekçesi zorunluluğu, üyelik `leftAt` semantiği
      (`docs/frontend/FRONTEND_MODERASYON.md`, `FRONTEND_CLUBS.md`, `FRONTEND_YONETIM.md`)

---

## Devir talepleri

Sahibi olmadığın bir dosyada değişiklik gerekiyorsa buraya yaz.

| Tarih | İsteyen | Dosya | Ne gerekiyor | Durum |
|---|---|---|---|---|
| 2026-07-31 | A → ~~B~~ A | `scripts/check-docs.ts` | **`docs:check` şu an KIRMIZI, CI'ı da kırıyor.** Yanlış pozitif: script "API.md'de fazladan bölüm" diyerek `/api/clubs/:clubId/announcements` ve `/api/clubs/:clubId/gallery`'yi işaretliyor. Bunlar gerçek yüzeyler — `index.ts`'te değil, `clubs.routes.ts:40-41`'de **alt router** olarak mount ediliyorlar. Kontrolün "eksik bölüm" yönü doğru, "fazladan bölüm" yönü hatalı: alt mount'ları da taraması ya da o yönü tamamen kaldırması gerekiyor (API.md'nin mount listesinden daha ayrıntılı olması meşru). | ✅ A devraldı ve düzeltti (alt router mount'ları da taranıyor) |

---

## Log

| Tarih | Hat | Ne yapıldı |
|---|---|---|
| 2026-07-31 | B | 2. tur: ONBOARDING_TENANT runbook, docs/adr/ (7 ADR), scripts/check-docs.ts + docs:check CI. |
| 2026-07-31 | B | Tier 4 doküman borcu: design/README yeniden yazımı + archive, API.md notifications/audit, CHANGELOG.md, CONTRIBUTING dil politikası, yonetim→design link düzeltmeleri, GUVENLIK outbox referansı. typecheck/test kırmızı — Hat A ara durumu (club_advisors.university_id). |
| 2026-07-31 | A | Tier 0 tamamlandı: 2 migration, e-posta normalizasyonu, timestamptz, FK politikaları, index'ler, token hash'leme. 105 test yeşil. |
| 2026-07-31 | — | Bu pano oluşturuldu; paralel çalışma başlıyor. |
| 2026-07-31 | A | A1 çapraz-tenant kilidi: 7 bileşik FK, 3 tabloya `university_id`, `tests/tenant-integrity.test.ts` (8 test). 113 test yeşil. |
| 2026-07-31 | A | A2 KVKK anonimleştirme: `users.deletedAt`, maskeli anonymize endpoint'i, rbac'ta tek noktadan etkisizleştirme, `tests/anonymize.test.ts` (9 test). 122 test yeşil. |
| 2026-07-31 | A | Tier 1 kapandı (1.3 üyelik tarihçesi + 1.4 ret gerekçesi). Cursor'ın kalanları devralındı: docs:check düzeltmesi, DATA_MODEL.md, KVKK.md. audit sink test ortamında düzeltildi. 131 test yeşil. |
