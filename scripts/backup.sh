#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
backup_dir="${1:?Usage: bash scripts/backup.sh /absolute/backup-directory}"
case "$backup_dir" in /*) ;; *) echo 'Use an absolute backup directory' >&2; exit 1;; esac
umask 077
mkdir -p "$backup_dir"
backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_name="praktika-$backup_stamp"
backup_stopped=0
resume_services() {
  if [ "$backup_stopped" = 1 ]; then docker compose start app worker; fi
}
trap resume_services EXIT
# Quiesce writes so the database and video snapshot agree. Caddy can remain up.
backup_stopped=1
docker compose stop app worker
docker compose exec -T db pg_dump -U praktika -d praktika -Fc > "$backup_dir/$backup_name.dump"
docker compose run --rm --no-deps -T --user root --entrypoint tar app -C /app/data -czf - . > "$backup_dir/$backup_name-media.tar.gz"
(cd "$backup_dir" && sha256sum "$backup_name.dump" "$backup_name-media.tar.gz" > "$backup_name.sha256")
printf 'Backup saved: %s/%s\n' "$backup_dir" "$backup_name"
