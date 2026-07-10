# Frontend: Ortamlar, Deploy ve Backend Entegrasyonu

Bu doküman `mustafakurtt/uniclub-frontend` reposu içindir. Backend tarafında
kurulan dev/prod ayrımı, CI/CD ve yerel ağ yapısına frontend'i bağlamak için
yapılması gerekenleri, uygulanabilir kodla birlikte anlatır.

> Backend'in işletim kuralları: [operations.md](../operations.md).
> Makine kurulumu ve ağ: [MAKINE_KURULUMU.md](../MAKINE_KURULUMU.md).

## Frontend'de hâlihazırda ne var

İyi haber: iskelet zaten kurulu.

| Var | Nerede |
| --- | --- |
| CI (lint + typecheck + build + docker build) | `.github/workflows/ci.yml` |
| İmaj yayınlama (GHCR) | `.github/workflows/publish.yml` |
| Multi-stage Dockerfile (Bun build → nginx) | `Dockerfile` |
| SPA fallback + asset cache | `nginx.conf` |
| Ortam değişkeni şablonu | `.env.example` |

Eksik olan: **ortam ayrımı**, **production'a nasıl indiği**, ve **backend'in
önünde durduğu reverse proxy'ye nasıl bağlandığı**.

---

## Mimari karar: tek origin, path tabanlı

Backend'in önünde bir Caddy reverse proxy var. Frontend **kökte**, backend
**`/api/*` altında** duracak.

```
https://uniclub.test/            → frontend (nginx, SPA)
https://uniclub.test/api/...     → backend
https://uniclub.test/health      → backend
```

### Neden alt alan adı değil de path?

**1. Vite ortam değişkenlerini build anında pakete gömer.** `VITE_API_BASE_URL`
mutlak bir adres olursa (`https://api.uniclub.test/api`), her ortam için **ayrı
imaj** derlemen gerekir; dev'de derlenen imaj prod'a gidemez. Adres göreli
(`/api`) olduğunda **tek imaj her ortamda** çalışır — CI'da bir kez derlenir,
aynı imaj deploy edilir. Bu, "test edilen artefakt ile yayınlanan artefakt aynı
olmalı" ilkesinin ta kendisidir.

**2. CORS tamamen ortadan kalkar.** Tarayıcı için tek origin. Preflight yok,
`Access-Control-*` başlık ayarı yok, "neden localhost'ta çalışıyor prod'da
çalışmıyor" yok.

**3. WebSocket de aynı origin'den bağlanır.** Ayrı bir ws host'u, ayrı sertifika,
ayrı CORS kuralı gerekmez.

Backend'in **tüm** rotaları zaten `/api/*` altında, yani çakışma yok.

> Bu yönlendirme backend tarafında **hazır**: `deploy/Caddyfile`. Frontend
> container'ı ayağa kalkana kadar kök adres anlaşılır bir 503 döner.

---

## Frontend'de yapılacak değişiklikler

### 1. `.env` dosyaları

`.env.example` şu an mutlak adres öneriyor. Göreli yap:

```sh
# .env.example
# REST API + WebSocket temel adresi.
# GÖRELİ bırak: hem dev sunucusunun proxy'si hem prod'daki Caddy /api'yi
# backend'e yönlendirir. Mutlak adres yazarsan imaj ortama bağımlı hale gelir.
VITE_API_BASE_URL=/api
```

> **`VITE_` ile başlayan her değişken istemci paketine gömülür ve herkese
> açıktır.** Asla API anahtarı, secret, token koyma. Backend'in `JWT_SECRET`'ı
> frontend'i hiç ilgilendirmez.

### 2. `vite.config.ts` — dev proxy

Dev'de `/api` isteklerini backend'e ilet. Böylece geliştirirken de tek origin
kuralı geçerli olur ve prod'la aynı kodu çalıştırırsın.

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Reverse proxy test.uniclub.test üzerinden geldiğinde Vite, tanımadığı
    // Host başlığını güvenlik gereği reddeder ("Blocked request"). İzin ver.
    allowedHosts: ['test.uniclub.test'],
    proxy: {
      // ws: true → /api/notifications/ws yükseltmesi de taşınır.
      '/api': { target: 'http://localhost:3000', changeOrigin: true, ws: true },
      '/health': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
```

### 3. `src/shared/api/client.ts` — WebSocket adresi

Base URL göreli olduğu için `http → ws` çevirisi artık **string değiştirerek
yapılamaz**. Adresi tarayıcının konumundan türet:

```ts
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

/**
 * WebSocket adresi. VITE_API_BASE_URL göreli ("/api") olduğu için protokolü ve
 * host'u window.location'dan alıyoruz; mutlak bir base verilirse de çalışır.
 */
export function notificationsWsUrl(ticket: string): string {
  const url = new URL(`${API_BASE}/notifications/ws`, window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('ticket', ticket)
  return url.toString()
}
```

### 4. `Dockerfile` — varsayılan build arg

```dockerfile
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
```

### 5. `.github/workflows/ci.yml` — build arg

`VITE_API_BASE_URL: http://localhost:3000/api` satırlarını `/api` yap. Aksi
halde CI, prod'a gidenden farklı bir paket derler ve testin bir anlamı kalmaz.

### 6. `docker-compose.prod.yml` — yeni dosya

Prod'da **imaj derlenmez, çekilir**. `publish.yml` zaten GHCR'a basıyor.

```yaml
# Production. Laptop'ta backend'in yanında çalışır.
#
#   IMAGE_TAG=v1.3.0 docker compose -p uniclub-web -f docker-compose.prod.yml up -d
#
# Port YAYINLANMAZ: dışarıya tek kapı Caddy'dir. Caddy container'a ağ üzerinden
# adıyla (uniclub_prod_web) ulaşır.
services:
  web:
    image: ghcr.io/mustafakurtt/uniclub-frontend:${IMAGE_TAG:?IMAGE_TAG zorunlu}
    container_name: uniclub_prod_web
    restart: unless-stopped
    networks: [proxy]

networks:
  # Backend'in prod compose projesinin ağı; Caddy de oraya bağlı.
  proxy:
    external: true
    name: uniclub-prod_default
```

Mevcut `docker-compose.yml`'deki `8080:80` yayınını **kaldır ya da değiştir** —
backend'in prod uygulaması da 8080 kullanıyor, çakışır.

### 7. Dal adı

Backend `develop` kullanıyor, frontend `dev`. İkisini `develop`'ta birleştir;
`CONTRIBUTING.md` ve workflow'lardaki `dev` referanslarını güncelle. Farklı
isimler, iki repo arasında gidip gelirken sürekli hata yaptırır.

### 8. Deploy: backend'le aynı desen

Backend, self-hosted runner **kullanmıyor** — public repo'da fork PR'ı runner'da
kod çalıştırabilir. Bunun yerine production makinesi GitHub'ı okuyup kendini
deploy ediyor. Frontend de aynısını yapmalı, tek farkla: **imaj derlemez,
GHCR'dan çeker.**

`scripts/deploy-agent.sh` (backend'dekinin frontend uyarlaması):

```sh
#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-mustafakurtt/uniclub-frontend}"
IMAGE="ghcr.io/mustafakurtt/uniclub-frontend"
CONTAINER="uniclub_prod_web"

tag="$(gh api "repos/${REPO}/releases/latest" --jq '.tag_name')"
running="$(docker inspect "$CONTAINER" -f '{{.Config.Image}}' 2>/dev/null | sed 's/.*://' || true)"
[[ "$tag" == "$running" ]] && { echo "Güncel: $tag"; exit 0; }

# Release commit'inin CI'ı yeşil mi?
sha="$(gh api "repos/${REPO}/git/refs/tags/${tag}" --jq '.object.sha')"
green="$(gh api "repos/${REPO}/actions/runs?head_sha=${sha}&status=success" --jq '[.workflow_runs[] | select(.name=="CI")] | length')"
[[ "${green:-0}" -gt 0 ]] || { echo "CI yeşil değil, deploy yok."; exit 0; }

docker pull "${IMAGE}:${tag}"
IMAGE_TAG="$tag" docker compose -p uniclub-web -f docker-compose.prod.yml up -d

# Sağlık: nginx ayakta mı, Caddy üzerinden kök 200 mü?
for i in $(seq 1 30); do
  if docker exec "$CONTAINER" wget -qO- http://localhost/ >/dev/null 2>&1; then
    echo "✓ ${tag} sağlıklı"; exit 0
  fi
  sleep 1
done

echo "✗ Sağlık kontrolü başarısız, ${running} sürümüne dönülüyor" >&2
IMAGE_TAG="$running" docker compose -p uniclub-web -f docker-compose.prod.yml up -d
exit 1
```

Laptop'ta 5 dakikada bir çalışacak bir zamanlanmış görev kur (backend'inkinin
aynısı, bkz. `MAKINE_KURULUMU.md`).

**`publish.yml`'i doğrula:** imajın `v1.3.0` gibi release tag'iyle
etiketlendiğinden emin ol; ajan imajı o etiketle arıyor.

---

## Backend'in frontend'e verdiği garantiler

### Yanıt zarfı

```json
{ "success": true, "message": "Kulüpler listelendi.", "data": {} }
```

### Hatalar

| Durum | Anlamı | Ne yapmalı |
| --- | --- | --- |
| `400` / `404` | İş kuralı hatası; `message` Türkçe ve **kullanıcıya gösterilebilir** | Mesajı göster |
| `403` + `code: "EMAIL_NOT_VERIFIED"` | Doğrulanmamış hesap yazma denedi | Doğrulama banner'ı + tekrar gönder |
| `403` (kodsuz) | Yetki yok, ya da hesap askıda | Genel yetkisiz ekranı |
| `429` + `code: "RATE_LIMITED"` | Hız sınırı | **`Retry-After` başlığını** (saniye) oku, geri sayım |
| `500` | Beklenmeyen hata; `message` jeneriktir | "Bir şeyler ters gitti" + `requestId` |

**Asla `message` metnine göre dallanma.** Makine tarafından okunacak alan
`code`'dur. `429`'da kalan süreyi mesajdan ayrıştırma; `Retry-After` var.

Her hata yanıtında `requestId` bulunur. Destek ekranında göstermeye değer:
sunucu logunda o id ile isteğin tamamı bulunur.

### Kimlik doğrulama

- `POST /api/auth/register` → tenant **e-posta domaininden çıkarılır**. Kullanıcıya
  "üniversite seç" diye sorma; tanınmayan domain reddedilir.
- `POST /api/auth/login` → JWT, 7 gün. `Authorization: Bearer <token>`.
- **Doğrulanmamış kullanıcı giriş yapabilir ve okuyabilir.** Bu kasıtlı: banner ve
  tekrar-gönder akışı bir oturum gerektirir. Yalnızca yazma engellenir.
- `GET /api/users/me/permissions` → **efektif** yetki kümesi. Menüleri ve butonları
  buna göre çiz, rol adına göre değil. Rol → yetki eşlemesi sunucuda değişebilir.

### Gerçek zamanlı bildirimler

Handshake `Authorization` başlığı taşıyamaz, o yüzden **tek kullanımlık ticket**:

```ts
const { data } = await api.post('/notifications/ws-ticket')   // { ticket, expiresIn: 60 }
const ws = new WebSocket(notificationsWsUrl(data.ticket))
```

- Ticket **bir kez** kullanılır (Redis `GETDEL`) ve 60 saniye geçerlidir.
- Yeniden bağlanırken **yeni ticket al**; eskisini saklama.
- Kapanma kodu `4401` → ticket yok/geçersiz/kullanılmış. Yeni ticket alıp tekrar dene.
- Token'ı query string'e **koyma**; loglara ve tarayıcı geçmişine sızar.

---

## Frontend'e özgü tuzaklar

**Production'da veri yoktur.** Seed, `NODE_ENV=production`'da açık onay olmadan
çalışmayı reddeder. `https://uniclub.test` üzerinde kulüp listesi boş görünür —
bu bir hata değil. Geliştirme ve deneme için dev ortamını kullan (`db:seed` ile
3 üniversite, 38 kullanıcı, 13 kulüp; tüm şifreler `Password123!`).

**Yerel CA'ya güvenmeden `fetch` sessizce patlar.** `uniclub.test` sertifikası
Caddy'nin yerel CA'sıyla imzalı. Tarayıcı o kökü tanımıyorsa konsolda anlaşılmaz
bir network hatası görürsün. `scripts/setup-local-dns.ps1` (backend reposunda)
kökü kurar.

**`curl` ile test etme.** Ne Git Bash'in `curl`'ü ne de `curl.exe` Windows
sertifika deposuna bakar; ikisi de kendi CA paketini taşır ve olmayan bir TLS
hatası uydurur. Tarayıcı ya da PowerShell `Invoke-WebRequest` kullan.

**Vite, tanımadığı Host başlığını reddeder.** `test.uniclub.test` üzerinden dev
sunucusuna ulaşacaksan `server.allowedHosts` şart.

---

## Kontrol listesi

- [ ] `.env.example` → `VITE_API_BASE_URL=/api`
- [ ] `vite.config.ts` → `server.proxy` + `allowedHosts`
- [ ] `client.ts` → WS adresi `window.location`'dan türetiliyor
- [ ] `Dockerfile` → `ARG VITE_API_BASE_URL=/api`
- [ ] `ci.yml` → build arg `/api`
- [ ] `docker-compose.yml` → `8080` çakışması giderildi
- [ ] `docker-compose.prod.yml` → GHCR imajı, port yayınlanmıyor, `uniclub-prod_default` ağına bağlı
- [ ] `publish.yml` → imaj release tag'iyle etiketleniyor
- [ ] `scripts/deploy-agent.sh` + zamanlanmış görev
- [ ] Dal adı `dev` → `develop`
- [ ] `main` branch protection: PR + yeşil CI zorunlu
