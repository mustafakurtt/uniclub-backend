#!/usr/bin/env bash
#
# Pull-based deploy agent (GitOps modeli).
#
#   ./scripts/deploy-agent.sh            # bir kez kontrol et, gerekirse deploy et
#   ./scripts/deploy-agent.sh --watch    # her INTERVAL saniyede bir kontrol et
#
# ── NEDEN PULL, PUSH DEĞİL ────────────────────────────────────────────────
# Self-hosted bir GitHub Actions runner, GitHub'ın gönderdiği işleri bu makinede
# çalıştırır. Repo public olduğundan bir fork PR'ı buraya kod sokabilir; GitHub
# da self-hosted runner'ları public repo'larda önermiyor.
#
# Bu ajan tersini yapar: GitHub'a yalnızca OKUMAK için bakar. Makineye gelen
# bağlantı yoktur. Çalıştırdığı tek kod, yayınlanmış bir release'in kodudur.
#
# ── GÜVEN ZİNCİRİ ─────────────────────────────────────────────────────────
#   1. Kod yalnızca PR ile main'e girer (branch protection).
#   2. CI yeşil olmadan merge edilemez.
#   3. Release'i bir insan keser — deploy'un onay kapısı budur.
#   4. Ajan yalnızca "en son release" + "o commit'in CI'ı yeşil" ise deploy eder.
#
# Deploy dizini bilerek ayrıdır: geliştirme çalışma kopyandaki yarım kalmış
# değişiklikler production'a asla sızmaz.

set -euo pipefail

REPO="${REPO:-mustafakurtt/uniclub-backend}"
WORKFLOW="${WORKFLOW:-CI}"
DEPLOY_DIR="${DEPLOY_DIR:-$HOME/uniclub-prod}"
INTERVAL="${INTERVAL:-300}"
APP_CONTAINER="uniclub_prod_app"

command -v gh >/dev/null 2>&1 || { echo "HATA: gh CLI gerekli." >&2; exit 1; }

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

latest_release_tag() {
  gh api "repos/${REPO}/releases/latest" --jq '.tag_name' 2>/dev/null || true
}

# Tag'in işaret ettiği commit. Annotated tag'ler bir tag nesnesine bakar;
# ^{} ile altındaki commit'e inilir.
tag_commit() {
  local tag="$1"
  gh api "repos/${REPO}/git/refs/tags/${tag}" --jq '.object.sha' 2>/dev/null |
    while read -r sha; do
      local type
      type="$(gh api "repos/${REPO}/git/tags/${sha}" --jq '.object.sha' 2>/dev/null || true)"
      if [[ -n "$type" ]]; then echo "$type"; else echo "$sha"; fi
    done
}

# O commit için başarılı bir CI koşusu var mı?
ci_is_green() {
  local sha="$1" count
  count="$(gh api "repos/${REPO}/actions/runs?head_sha=${sha}&status=success&per_page=50" \
    --jq "[.workflow_runs[] | select(.name == \"${WORKFLOW}\")] | length" 2>/dev/null || echo 0)"
  [[ "${count:-0}" -gt 0 ]]
}

deployed_version() {
  docker inspect "$APP_CONTAINER" -f '{{.Config.Image}}' 2>/dev/null | sed 's/.*://' || true
}

# `git clone` boş olmayan bir dizine yazmayı reddeder — ve bu dizin boş olmaz:
# .env.prod klondan önce oraya konur (secret git'te taşınmaz). Bu yüzden klonlamak
# yerine dizini bir repo'ya dönüştürüp fetch ediyoruz.
ensure_clone() {
  [[ -d "${DEPLOY_DIR}/.git" ]] && return 0
  log "Deploy repo'su hazırlanıyor: ${DEPLOY_DIR}"
  mkdir -p "$DEPLOY_DIR"
  git -C "$DEPLOY_DIR" init --quiet
  git -C "$DEPLOY_DIR" remote add origin "https://github.com/${REPO}.git" 2>/dev/null || true
  git -C "$DEPLOY_DIR" fetch --quiet --tags origin
}

# .env.prod git'te değildir (secret içerir); klona bir kez elle konur.
ensure_env() {
  [[ -f "${DEPLOY_DIR}/.env.prod" ]] && return 0
  echo "HATA: ${DEPLOY_DIR}/.env.prod yok." >&2
  echo "      Örnekten oluşturup gerçek değerleri doldur:" >&2
  echo "      cp .env.prod.example \"${DEPLOY_DIR}/.env.prod\"" >&2
  exit 1
}

check_once() {
  local tag sha deployed
  tag="$(latest_release_tag)"
  if [[ -z "$tag" || "$tag" == "null" ]]; then
    log "Yayınlanmış release yok — yapılacak bir şey yok."
    return 0
  fi

  deployed="$(deployed_version)"
  if [[ "$tag" == "$deployed" ]]; then
    log "Güncel: ${tag} zaten çalışıyor."
    return 0
  fi

  sha="$(tag_commit "$tag")"
  if [[ -z "$sha" ]]; then
    log "HATA: ${tag} tag'inin commit'i çözümlenemedi."
    return 1
  fi

  if ! ci_is_green "$sha"; then
    log "${tag} (${sha:0:7}) için yeşil bir ${WORKFLOW} koşusu yok — deploy EDİLMEDİ."
    return 0
  fi

  log "Yeni sürüm: ${deployed:-yok} → ${tag} (${sha:0:7})"
  ensure_clone
  ensure_env

  git -C "$DEPLOY_DIR" fetch --quiet --tags origin
  git -C "$DEPLOY_DIR" checkout --quiet --detach "$sha"
  log "Deploy klonu ${tag} sürümüne alındı."

  if (cd "$DEPLOY_DIR" && IMAGE_TAG="$tag" bash scripts/deploy-local.sh); then
    log "✓ Deploy başarılı: ${tag}"
  else
    log "✗ Deploy BAŞARISIZ: ${tag} — deploy-local.sh önceki imaja geri döndü."
    return 1
  fi
}

if [[ "${1:-}" == "--watch" ]]; then
  log "İzleme: ${REPO} release'leri, her ${INTERVAL}s. Çıkmak için Ctrl+C."
  while true; do
    check_once || log "Bu turda hata oldu; bir sonraki turda yeniden denenecek."
    sleep "$INTERVAL"
  done
else
  check_once
fi
