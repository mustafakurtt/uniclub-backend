# ADR 0002 — Drizzle ORM + `defineRelations` v2 ilişkisel API

**Durum:** Kabul edildi  
**Tarih:** 2026 (proje başlangıcı, Tier 0 geçişinde pekiştirildi)

## Bağlam

PostgreSQL şeması çok kiracılı, ilişkisel ve sık değişiyor. ORM seçimi migration
üretimi, tip güvenliği ve repository katmanının okunabilirliğini belirler.
`users` ↔ `clubs` gibi aynı tabloya birden fazla FK (creator/advisor/member)
ilişkileri sorgu API'sinde açık ayrıştırma gerektirir.

## Karar

**Drizzle ORM** (`drizzle-orm` + `drizzle-kit`) kullanıyoruz. Şema tek kaynak:
`src/db/schema.ts`. İlişkiler **`defineRelations` (v2 relational API)** ile
`src/db/relations.ts`'te tanımlanır; repository'ler `db.query.<table>.findFirst({
with: { ... } })` nesne-stili `where` kullanır.

## Gerekçe

- Şema TypeScript'te kalır — `InferSelectModel` ile `*.types.ts` doğrudan türetilir;
  ayrı codegen adımı yok.
- `drizzle-kit migrate` SQL migration dosyalarını `src/db/migrations` altında
  üretir; inceleme ve CI'da sıfırdan uygulama mümkün.
- v2 `defineRelations` + `alias` (ör. `creator_club` / `advisor_club` /
  `member_club`) aynı tabloya çoklu FK senaryosunu çözer (`relations.ts` yorumları).
- Hafif runtime: Prisma engine veya ağır proxy katmanı yok; Bun ile uyumlu.

## Elenen alternatifler

| Alternatif | Neden elendi |
|---|---|
| **Prisma** | Ağır client, binary engine, şema dili ayrı (`.prisma`). Çoklu FK alias ve ince migration kontrolü Drizzle'a göre daha dolaylı. |
| **TypeORM** | Dekoratör tabanlı model; ekip için daha az öngörülebilir migration çıktısı. Aktif geliştirme hızı Drizzle'a göre düşük algılandı. |
| **Knex + ham SQL** | İlişkisel sorgu ergonomisi zayıf; `db.query` API'si yok. Repository katmanı şişer. |
| **Drizzle legacy `relations()` helper** | Projede bilinçli olarak v2'ye geçildi; tek API kullanımı (`CLAUDE.md`). |

## Sonuçlar

**İyi:**
- Migration'lar versiyonlanır, code review edilebilir.
- Repository'ler okunaklı `with` zincirleri kullanır.
- `schema.ts` FK `onDelete` politikalarını açıkça zorunlu kılar.

**Kötü:**
- Drizzle v1→v2 geçişi ek öğrenme eğrisi (defineRelations).
- İlişkisel API dokümantasyonu Prisma kadar yaygın değil.
- `drizzle-kit` RC sürümü — üretimde pin ve dikkatli upgrade gerekir.

## Ne zaman yeniden değerlendirilir

- Drizzle v2 relational API ciddi regresyon veya performans sorunu çıkarırsa.
- Ekip çok daha karmaşık sorgular için ham SQL/Query Builder'a geçmek zorunda
  kalırsa (şu an repository + `sql` yeterli).
