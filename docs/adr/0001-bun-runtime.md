# ADR 0001 — Runtime olarak Bun

**Durum:** Kabul edildi  
**Tarih:** 2026 (proje başlangıcı)

## Bağlam

Üniversite kulüp yönetimi backend'i tek deployment'ta çok kiracıya hizmet edecek;
yüksek I/O (HTTP, Redis, WebSocket, arka plan kuyruğu) ve düşük soğuk başlangıç
süresi önemli. Runtime seçimi tüm araç zincirini (test, paket yöneticisi, HTTP
sunucusu) belirler.

## Karar

**Bun**'ı tek runtime olarak kullanıyoruz: `bun run`, `bun test`, yerleşik
`Bun.serve` + native WebSocket (`hono/bun`), `Bun.password` (bcrypt).

## Gerekçe

- Tek ikili: paket yöneticisi, test koşucusu ve JS runtime aynı araçta — CI ve
  yerel kurulum basitleşir (`package.json` yalnızca `bun` engine bildirir).
- `Bun.serve` + `hono/bun` WebSocket'i ek Node adaptörü olmadan verir; bildirim
  sistemi bunun üzerine kurulu (`shared/ws/bun-ws.ts`).
- Performans: I/O ağırlıklı API için Node'a kıyasla düşük gecikme ve hızlı
  başlangıç (özellikle container ölçeklemesinde).

## Elenen alternatifler

| Alternatif | Neden elendi |
|---|---|
| **Node.js + npm/pnpm** | Ayrı test koşucusu (vitest/jest), ayrı WS adaptörü, daha yavaş cold start. Ek karmaşıklık; proje boyutu için fayda/ maliyet oranı düşük. |
| **Deno** | Ekosistem ve Drizzle/BullMQ/ioredis uyumu o dönemde daha az kanıtlıydı; ekip Node/Bun deneyimine daha yakındı. |
| **Node + tsx/ts-node (sadece dev)** | Prod/dev runtime ayrımı operasyonel yük; tek runtime tercih edildi. |

## Sonuçlar

**İyi:**
- Hızlı yerel geliştirme (`bun run dev --hot`).
- WebSocket ve şifre hash'i runtime'da hazır.
- CI'da tek `setup-bun` adımı yeterli.

**Kötü:**
- Bazı npm paketleri Node'a göre daha az test edilmiş olabilir (ör. edge-case'ler).
- Ekip üyelerinin Bun'a alışması gerekir; `CLAUDE.md` ve `CONTRIBUTING.md` bunu
  açıkça belirtir.
- Bulut sağlayıcı örnekleri çoğunlukla Node odaklıdır — Dockerfile Bun imajı
  kullanmalıdır.

## Ne zaman yeniden değerlendirilir

- Bun'un LTS/destek politikası üretim gereksinimlerini karşılamazsa.
- Kritik bir bağımlılık Bun ile uyumsuz kalırsa ve alternatif yoksa.
- Kurumsal hosting yalnızca Node destekliyorsa (şu an Dockerfile ile Bun
  deploy ediliyor).
