#!/usr/bin/env bash
# Actualiza Motor SEO a la última versión de tu repositorio
set -euo pipefail
cd "$(dirname "$0")/.."
./deploy/backup.sh
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
echo "Actualizado: $(git log -1 --format='%h %s')"
