# ADR 0003 — `core/` taşınabilir çatı vs `shared/` proje-bağımlı katman

**Durum:** Kabul edildi  
**Tarih:** 2026 (core ayrıştırması)

## Bağlam

RBAC, auth, rate limit, audit hook, cache gibi mekanizmalar birçok Hono projesinde
benzer; ancak rol adları, Drizzle şeması ve Türkçe mesaj kataloğu bu projeye özgü.
İki katman arasında net sınır olmazsa `core/` zamanla `env` ve `schema`'ya bağımlı
hale gelir ve yeniden kullanılamaz.

## Karar

- **`src/core/`** — proje-agnostik HTTP/RBAC/cache/logger mekanizmaları. `env`,
  `shared/`, `features/` **import etmez** (grep ile doğrulanır; `GUVENLIK_YOL_HARITASI`
  sınır testi önerir).
- **`src/shared/`** — bu projeye özgü dikişler: `rbac.repository`, `rbac.cache`,
  `jwt.util`, `mailer`, i18n kataloğu.
- **Enjeksiyon deseni:** `configureRbac`, `setTokenVerifier`, `setGuardAuditSink`,
  `configureTenantScope` — core mekanizmayı bilir, veri kaynağını bilmez.

**Tek kabul edilen kuplaj:** `core/rbac` → `shared/rbac/rbac.cache.ts`
(`getEffectivePermissions` read-through). Core askı kontrolünü `enforce` callback
ile alır; `suspended` kavramı `shared/rbac/authz-policy.ts`'te yaşar.

## Gerekçe

- Aynı guard zincirini başka bir üründe tekrar kullanabilmek (portable toolkit).
- Testlerde core'u mock seam'lerle izole etmek kolaylaşır.
- `GUVENLIK_YOL_HARITASI` ve `CORE_MIDDLEWARE.md`: middleware'ler **alana göre**
  gruplanır (`core/ratelimit/`, `core/rbac/`), tek `middlewares/` çuvalına
  konmaz — taşınabilirlik bozulmasın diye.

## Elenen alternatifler

| Alternatif | Neden elendi |
|---|---|
| **Tek `src/` ağacı, ayrım yok** | RBAC engine başka projeye kopyalanamaz; her değişiklik yan etki riski yüksek. |
| **Tamamen generic npm paketi (monorepo)** | Erken aşamada yayın/bakım maliyeti; fiziksel klasör ayrımı yeterli. |
| **core'un `shared`'ı import etmesi** | Sınır testi olmadan zamanla tüm bağımlılıklar core'a sızar (bilinçli kaçınılan durum). |
| **RBAC cache'i core içine almak** | Cache key şeması ve Drizzle sorgusu projeye özgü; core şişer. |

## Sonuçlar

**İyi:**
- `guard()` tek import ile tüm korumalı rotalarda aynı sırayı garanti eder.
- Yeni proje: `core/` + kendi `shared/rbac` implementasyonu.
- Audit hook core'da, sink `features/audit`'te — append-only politika korunur.

**Kötü:**
- Yeni geliştiricinin iki katmanı öğrenmesi gerekir.
- `attachAuthz` → cache okuması gizli kuplaj; dokümante edilmezse şaşırtır.
- Sınır ihlali otomatik engellenmiyor (henüz CI sınır testi yok — yol haritasında).

## Ne zaman yeniden değerlendirilir

- `core/` gerçekten ikinci bir repoya/pakete çıkarılacaksa (monorepo veya npm).
- Tek kuplaj noktası (rbac cache) performans veya döngüsel bağımlılık sorunu çıkarırsa.
