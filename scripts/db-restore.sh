#!/usr/bin/env bash
#
# Yedeği bir veritabanına geri yükler ve doğrular.
#
#   ./scripts/db-restore.sh backups/uniclub_20260710_120000.dump
#
# VARSAYILAN olarak ayrı bir tatbikat veritabanına ('uniclub_restore_test')
# yükler — çalışan veritabanına DOKUNMAZ. Gerçekten üzerine yazmak için:
#
#   CONFIRM_OVERWRITE=evet TARGET_DB=uniclub ./scripts/db-restore.sh <dosya>
#
# Bu tasarım bilinçli: "restore" komutunu kas hafızasına
# "çalışan veritabanını ez" olarak yazdırmamak için.

set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_pg-env.sh

DUMP_FILE="${1:-}"
TARGET_DB="${TARGET_DB:-uniclub_restore_test}"
CONFIRM_OVERWRITE="${CONFIRM_OVERWRITE:-hayır}"

if [[ -z "$DUMP_FILE" ]]; then
  echo "Kullanım: $0 <yedek-dosyasi.dump>" >&2
  echo "Mevcut yedekler:" >&2
  ls -1t ./backups/*.dump 2>/dev/null | head -5 >&2 || echo "  (yok)" >&2
  exit 1
fi
[[ -f "$DUMP_FILE" ]] || { echo "HATA: dosya yok: $DUMP_FILE" >&2; exit 1; }

resolve_database_url
detect_pg_mode

# DATABASE_URL'den DB adını ayır, yerine TARGET_DB koy.
BASE_URL="${DATABASE_URL%/*}"
SOURCE_DB="${DATABASE_URL##*/}"
TARGET_URL="${BASE_URL}/${TARGET_DB}"

# ── Güvenlik kilidi ───────────────────────────────────────────
if [[ "$TARGET_DB" == "$SOURCE_DB" && "$CONFIRM_OVERWRITE" != "evet" ]]; then
  echo "DURDURULDU: Hedef, çalışan veritabanının ta kendisi ('${TARGET_DB}')." >&2
  echo "Üzerine yazmak istiyorsan: CONFIRM_OVERWRITE=evet $0 $DUMP_FILE" >&2
  exit 1
fi

OVERWRITING_LIVE=0
[[ "$TARGET_DB" == "$SOURCE_DB" ]] && OVERWRITING_LIVE=1

echo "▶ Mod: ${PG_MODE}"
echo "▶ Yedek: ${DUMP_FILE}"
if [[ "$OVERWRITING_LIVE" -eq 1 ]]; then
  echo "▶ Hedef: ${TARGET_DB}  ⚠️  ÇALIŞAN VERİTABANI SİLİNİP YENİDEN OLUŞTURULACAK"
else
  echo "▶ Hedef: ${TARGET_DB}  (tatbikat — çalışan '${SOURCE_DB}' değişmeyecek)"
fi

# ── Hedef veritabanını sıfırdan oluştur ───────────────────────
psql_ "${BASE_URL}/postgres" -v ON_ERROR_STOP=1 -q <<SQL
DROP DATABASE IF EXISTS "${TARGET_DB}";
CREATE DATABASE "${TARGET_DB}";
SQL

# pg_restore -j (paralel) stdin'den okuyamaz — dosya olarak erişilebilir olmalı.
STAGED="$(stage_dump_file "$DUMP_FILE")"
trap 'unstage_dump_file "$STAGED"' EXIT

pg_restore_ \
  --dbname="$TARGET_URL" \
  --no-owner \
  --no-privileges \
  --jobs=4 \
  "$STAGED"

# ── Tatbikat doğrulaması: veri gerçekten geldi mi? ────────────
echo
echo "── Geri yükleme doğrulaması ──"
psql_ "$TARGET_URL" -tA -F' | ' <<'SQL'
SELECT 'universities', count(*) FROM universities
UNION ALL SELECT 'users',       count(*) FROM users
UNION ALL SELECT 'roles',       count(*) FROM roles
UNION ALL SELECT 'permissions', count(*) FROM permissions
UNION ALL SELECT 'clubs',       count(*) FROM clubs;
SQL

echo
if [[ "$OVERWRITING_LIVE" -eq 1 ]]; then
  echo "✓ ÇALIŞAN veritabanı '${TARGET_DB}' yedekten geri yüklendi."
  echo "  Yedek sonrası oluşan veriler KALICI OLARAK KAYBOLDU."
  echo "  Uygulamayı yeniden başlat ve yukarıdaki sayıları beklediğinle karşılaştır."
else
  echo "✓ '${TARGET_DB}' tatbikat veritabanına geri yüklendi."
  echo "  Çalışan veritabanın ('${SOURCE_DB}') değişmedi."
fi
