#!/usr/bin/env bash
# Copia de seguridad de la base de datos (se guardan las 14 últimas)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
F="backups/motorseo-$(date +%Y%m%d-%H%M%S).archive.gz"
docker compose exec -T mongo mongodump --db motorseo --archive --gzip > "$F"
cp .env.prod "backups/env.prod.bak" 2>/dev/null || true
ls -1t backups/*.archive.gz | tail -n +15 | xargs -r rm -f
echo "Backup: $F"
