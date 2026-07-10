#!/usr/bin/env bash
#
# Veritabanı yedeği alır (pg_dump, custom format) ve doğrular.
#
#   ./scripts/db-backup.sh
#   BACKUP_DIR=/mnt/yedek RETENTION_DAYS=30 ./scripts/db-backup.sh
#
# Custom format (-Fc) seçildi çünkü:
#   • sıkıştırılmış gelir
#   • pg_restore ile TEK TABLO bile geri yüklenebilir
#   • paralel restore (-j) destekler
#
# RETENTION_DAYS'ten eski yedekler silinir (varsayılan 7 gün).

set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_pg-env.sh

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

resolve_database_url
detect_pg_mode

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="${BACKUP_DIR}/uniclub_${STAMP}.dump"

echo "▶ Mod: ${PG_MODE}  →  ${OUT}"

# --no-owner / --no-privileges: yedek başka bir kullanıcıya da geri yüklenebilsin.
# Çıktıyı stdout'a alıp host'taki dosyaya yazıyoruz (docker modunda da çalışsın diye).
pg_dump_ "$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  > "$OUT"

# ── Doğrula: arşiv okunabiliyor mu? ───────────────────────────
# "Hiç geri yüklemediğin yedek, yedek değildir." En azından içindekiler okunabilmeli.
if ! pg_restore_ --list < "$OUT" > /dev/null 2>&1; then
  echo "HATA: Yedek bozuk — pg_restore okuyamadı." >&2
  rm -f "$OUT"
  exit 1
fi

TABLES="$(pg_restore_ --list < "$OUT" | grep -c 'TABLE DATA' || true)"
SIZE="$(du -h "$OUT" | cut -f1)"
echo "✓ Doğrulandı: ${SIZE}, ${TABLES} tablo verisi"

# ── Eski yedekleri temizle ────────────────────────────────────
DELETED="$(find "$BACKUP_DIR" -name 'uniclub_*.dump' -type f -mtime "+${RETENTION_DAYS}" -print -delete 2>/dev/null | wc -l | tr -d ' ')"
[[ "${DELETED:-0}" -gt 0 ]] && echo "✓ ${RETENTION_DAYS} günden eski ${DELETED} yedek silindi"

echo "✓ Tamam: ${OUT}"
