#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[ ! -e .env ] || { echo '.env already exists. Preserve it and edit it instead.' >&2; exit 1; }
site_domain="${1:?Usage: bash scripts/configure.sh learn.example.ru admin@example.ru [acme@example.ru]}"
site_admin="${2:?Set the administrator email}"
site_acme="${3:-$site_admin}"
[[ "$site_domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$ ]] || { echo 'Use an ASCII domain without https:// or a path.' >&2; exit 1; }
for site_email in "$site_admin" "$site_acme"; do
  [[ "$site_email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || { echo 'Invalid email address.' >&2; exit 1; }
done
umask 077
site_db_password="$(openssl rand -hex 24)"
site_admin_password="$(openssl rand -hex 24)"
# noclobber also protects against a concurrent initializer.
set -o noclobber
{
  printf 'DOMAIN=%s\nACME_EMAIL=%s\nPOSTGRES_PASSWORD=%s\nADMIN_EMAIL=%s\nADMIN_PASSWORD=%s\n' "$site_domain" "$site_acme" "$site_db_password" "$site_admin" "$site_admin_password"
  printf 'UPLOAD_MAX_BYTES=10737418240\nTRANSCODE_THREADS=1\nMAX_VIDEO_HEIGHT=720\nREGISTRATION_OPEN=true\nDISK_RESERVE_BYTES=2147483648\n'
} > .env
printf 'Configuration saved to .env (mode 600). Read ADMIN_PASSWORD locally, then change it in account settings after your first login.\n'
