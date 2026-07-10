#!/usr/bin/env bash
#
# db-backup.sh ve db-restore.sh tarafından "source" edilen ortak yardımcı.
#
# Postgres araçlarını (pg_dump / pg_restore / psql) nerede bulacağımıza karar verir:
#
#   1) Host'ta kuruluysa doğrudan çalıştır  → sunucuda / CI'da böyle olur
#   2) Değilse, çalışan Postgres container'ının içinden çalıştır → yerel geliştirme
#
# Böylece aynı script hem laptop'ta hem prod sunucusunda çalışır.

set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-uniclub_postgres}"

# Git Bash (MSYS/MinGW) container içi mutlak yolları — /tmp/x gibi — Windows
# yoluna çevirir ve "docker exec ... /tmp/x" bozulur. Sadece Windows'ta kapat.
case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) export MSYS_NO_PATHCONV=1 ;;
esac

# ── DATABASE_URL'i çöz ────────────────────────────────────────
resolve_database_url() {
  if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
    DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d "\"'")"
  fi
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "HATA: DATABASE_URL bulunamadı (.env veya ortam değişkeni)." >&2
    exit 1
  fi
  export DATABASE_URL
}

# ── Çalışma modunu seç ────────────────────────────────────────
detect_pg_mode() {
  if command -v pg_dump >/dev/null 2>&1 && command -v pg_restore >/dev/null 2>&1; then
    PG_MODE="host"
  elif docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$PG_CONTAINER"; then
    PG_MODE="docker"
  else
    echo "HATA: Ne host'ta postgres araçları var, ne de '${PG_CONTAINER}' container'ı çalışıyor." >&2
    echo "      'docker compose up -d' çalıştır ya da postgresql-client kur." >&2
    exit 1
  fi
  export PG_MODE
}

# ── Araç sarmalayıcıları ──────────────────────────────────────
# Docker modunda stdin/stdout container'a bağlanır (-i), TTY yok.

pg_dump_() {
  case "$PG_MODE" in
    host)   pg_dump "$@" ;;
    docker) docker exec -i "$PG_CONTAINER" pg_dump "$@" ;;
  esac
}

pg_restore_() {
  case "$PG_MODE" in
    host)   pg_restore "$@" ;;
    docker) docker exec -i "$PG_CONTAINER" pg_restore "$@" ;;
  esac
}

psql_() {
  case "$PG_MODE" in
    host)   psql "$@" ;;
    docker) docker exec -i "$PG_CONTAINER" psql "$@" ;;
  esac
}

# Bir dosyayı, araçların görebileceği yere koyar; yolunu yazdırır.
# Docker modunda container'a kopyalar (pg_restore -j stdin'den okuyamaz).
stage_dump_file() {
  local local_path="$1"
  case "$PG_MODE" in
    host)
      echo "$local_path"
      ;;
    docker)
      local remote="/tmp/$(basename "$local_path")"
      docker cp "$local_path" "${PG_CONTAINER}:${remote}" >/dev/null
      echo "$remote"
      ;;
  esac
}

unstage_dump_file() {
  local remote="$1"
  [[ "$PG_MODE" == "docker" ]] && docker exec "$PG_CONTAINER" rm -f "$remote" 2>/dev/null || true
}
