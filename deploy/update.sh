#!/usr/bin/env bash
# Actualiza Motor SEO a la última versión de tu repositorio
set -euo pipefail
cd "$(dirname "$0")/.."
./deploy/backup.sh
git pull --ff-only
docker compose build backend
docker compose build frontend
docker compose up -d
docker image prune -f --filter "label=com.motorseo.app=1" >/dev/null
echo "Actualizado: $(git log -1 --format='%h %s')"
