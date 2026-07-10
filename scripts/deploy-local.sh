#!/usr/bin/env bash
#
# Bu makinedeki production stack'ine deploy eder.
#
#   ./scripts/deploy-local.sh              # HEAD'i deploy et
#   IMAGE_TAG=abc1234 ./scripts/deploy-local.sh
#
# Yaptıkları, sırayla:
#   1. Deploy öncesi yedek (geri dönüş noktası)
#   2. İmajı release/SHA etiketiyle derle
#   3. Altyapıyı başlat (postgres, redis, mailpit)
#   4. Migration'ları ayrı bir container'da uygula
#   5. Uygulamayı başlat
#   6. /health yeşil yanana kadar bekle; yanmazsa ÖNCEKİ imaja geri dön
#   7. Proxy config'ini kesintisiz yeniden yükle
#
# Dev stack'e (docker-compose.yml) dokunmaz: ayrı proje, ayrı volume, ayrı ağ.

set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="uniclub-prod"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="${ENV_FILE:-.env.prod}"
PROFILE="${COMPOSE_PROFILE:-localmail}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"

[[ -f "$ENV_FILE" ]] || {
  echo "HATA: $ENV_FILE yok. 'cp .env.prod.example .env.prod' ile başla." >&2
  exit 1
}

# Çağıranın verdiği etiketi env dosyasını okumadan ÖNCE yakala: .env.prod içindeki
# IMAGE_TAG bir varsayılandır, deploy edilen sürümün kaynağı değil. Aksi halde her
# imaj aynı adı alır ve geri dönülecek önceki imaj kalmaz.
CLI_IMAGE_TAG="${IMAGE_TAG:-}"

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

APP_PORT="${APP_PORT:-8080}"
NEW_TAG="${CLI_IMAGE_TAG:-$(git rev-parse --short HEAD)}"

compose() {
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" --profile "$PROFILE" --env-file "$ENV_FILE" "$@"
}

# Şu an çalışan imajın etiketi — rollback için lazım.
PREV_TAG="$(docker inspect uniclub_prod_app -f '{{index .Config.Labels "image.tag"}}' 2>/dev/null || true)"
[[ -z "$PREV_TAG" ]] && PREV_TAG="$(docker inspect uniclub_prod_app -f '{{.Config.Image}}' 2>/dev/null | sed 's/.*://' || true)"

echo "▶ Deploy: ${NEW_TAG}   (önceki: ${PREV_TAG:-yok})"

# ── 1. Deploy öncesi yedek ────────────────────────────────────
if docker ps --format '{{.Names}}' | grep -qx uniclub_prod_postgres; then
  mkdir -p backups
  STAMP="$(date +%Y%m%d_%H%M%S)"
  OUT="backups/prod_predeploy_${STAMP}.dump"
  echo "▶ Deploy öncesi yedek → ${OUT}"
  docker exec uniclub_prod_postgres pg_dump \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --format=custom --compress=9 --no-owner --no-privileges > "$OUT"
  echo "  ✓ $(du -h "$OUT" | cut -f1)"
fi

# ── 2. İmajı derle ────────────────────────────────────────────
echo "▶ İmaj derleniyor: uniclub-backend:${NEW_TAG}"
IMAGE_TAG="$NEW_TAG" compose build app migrate

# ── 3. Altyapı ────────────────────────────────────────────────
echo "▶ Altyapı (postgres, redis, mailpit)"
IMAGE_TAG="$NEW_TAG" compose up -d --remove-orphans postgres redis mailpit

# ── 4. Migration — ayrı, açık bir adım ────────────────────────
# `compose run --rm migrate` migration'ları uygulayıp çıkar. `up`'a bırakmıyoruz:
# kısa ömürlü bir servisi up orkestrasyonuna sokmak, container bitip
# temizlenirken "No such container" hatası ve yanlış-negatif deploy üretiyor.
# migrate'in kendi depends_on'ı postgres:healthy bekler; migration patlarsa
# bu satır non-zero döner ve app hiç başlatılmaz.
echo "▶ Migration uygulanıyor"
IMAGE_TAG="$NEW_TAG" compose run --rm migrate

# ── 4b. Bootstrap: RBAC kataloğu + ilk super_admin ────────────
# Idempotent — her deploy'da güvenle çalışır. RBAC kataloğunu koda göre günceller
# (yeni yetki eklendiğinde otomatik gelir) ve super_admin yoksa oluşturur.
# super_admin bilgileri .env.prod'daki SUPER_ADMIN_* değişkenlerinden gelir;
# yoksa RBAC yine kurulur, admin adımı atlanır.
echo "▶ Bootstrap (RBAC + super_admin)"
IMAGE_TAG="$NEW_TAG" compose run --rm migrate bun run db:bootstrap

# ── 5. Uygulama ───────────────────────────────────────────────
echo "▶ Uygulama başlatılıyor"
IMAGE_TAG="$NEW_TAG" compose up -d app

# ── 6. Sağlık kontrolü ────────────────────────────────────────
echo "▶ /health bekleniyor (en fazla ${HEALTH_TIMEOUT}s)"
HEALTHY=0
for ((i = 1; i <= HEALTH_TIMEOUT; i++)); do
  if curl -fsS "http://localhost:${APP_PORT}/health" >/tmp/prod_health.json 2>/dev/null; then
    echo "  ✓ ${i}. saniyede sağlıklı: $(cat /tmp/prod_health.json)"
    HEALTHY=1
    break
  fi
  sleep 1
done

# ── 7. Rollback ───────────────────────────────────────────────
if [[ "$HEALTHY" -ne 1 ]]; then
  echo "✗ Sağlık kontrolü BAŞARISIZ. Son loglar:" >&2
  compose logs --tail=30 app >&2 || true

  if [[ -n "$PREV_TAG" && "$PREV_TAG" != "$NEW_TAG" ]] && docker image inspect "uniclub-backend:${PREV_TAG}" >/dev/null 2>&1; then
    echo "▶ ${PREV_TAG} imajına geri dönülüyor" >&2
    IMAGE_TAG="$PREV_TAG" compose up -d --no-build app
    echo "  ⚠ Geri dönüldü. NOT: migration'lar geri ALINMAZ." >&2
    echo "    Yıkıcı bir migration varsa yedekten dönmen gerekir (bkz. docs/operations.md)." >&2
  else
    echo "  ⚠ Geri dönülecek önceki imaj yok." >&2
  fi
  exit 1
fi

# ── 8. Proxy config'ini tazele ────────────────────────────────
# Reverse proxy ayrı ve uzun ömürlü bir compose projesi (uniclub-proxy), ama
# CONFIG'i (deploy/Caddyfile) bu repo'da ve release'lerle değişebilir. Deploy
# klonu yeni commit'e alındığında Caddyfile güncellenir; Caddy'ye yeniden
# okuması söylenmezse eski yönlendirmeyle çalışmaya devam eder.
# `caddy reload` config'i kesintisiz yeniler (restart değil).
if docker ps --format '{{.Names}}' | grep -qx uniclub_proxy; then
  # MSYS_NO_PATHCONV: Git Bash, container içi /etc/caddy/... yolunu Windows
  # yoluna çevirip komutu bozuyor. Sadece bu docker exec için kapatıyoruz.
  if MSYS_NO_PATHCONV=1 docker exec uniclub_proxy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    echo "▶ Proxy config yeniden yüklendi"
  else
    echo "  ⚠ Proxy reload başarısız — Caddyfile'ı elle kontrol et" >&2
  fi
fi

echo
echo "✓ Deploy tamam: uniclub-backend:${NEW_TAG}"
echo "  Uygulama : http://localhost:${APP_PORT}"
[[ "$PROFILE" == "localmail" ]] && echo "  Mail kutusu: http://localhost:${MAILPIT_UI_PORT:-8026}"
