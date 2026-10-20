#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
backup_prefix="${1:?Usage: CONFIRM_RESTORE=yes bash scripts/restore.sh /absolute/path/praktika-TIMESTAMP}"
[ "${CONFIRM_RESTORE:-}" = yes ] || { echo 'This replaces the current database and media. Set CONFIRM_RESTORE=yes after reviewing the backup.' >&2; exit 1; }
case "$backup_prefix" in /*) ;; *) echo 'Use an absolute backup prefix' >&2; exit 1;; esac
[ -s "$backup_prefix.dump" ] && [ -s "$backup_prefix-media.tar.gz" ]
(cd "$(dirname "$backup_prefix")" && sha256sum -c "$(basename "$backup_prefix").sha256")
docker compose stop app worker
# Keep services stopped on failure so an incomplete restore cannot accept traffic.
docker compose exec -T db pg_restore -U praktika -d praktika --clean --if-exists --no-owner --single-transaction < "$backup_prefix.dump"
docker compose run --rm --no-deps -T --user root --entrypoint sh app -eu -c 'find /app/data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; tar -C /app/data -xzf -; chown -R node:node /app/data' < "$backup_prefix-media.tar.gz"
docker compose up -d app worker
printf 'Restore complete. Check docker compose ps and your domain.\n'
