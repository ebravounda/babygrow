#!/usr/bin/env bash
# Instalación inicial de Motor SEO en tu servidor (aaPanel / cualquier Linux con Docker)
set -euo pipefail
cd "$(dirname "$0")/.."

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then read -rp "Dominio (ej. seo.mitiendapro.com): " DOMAIN; fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker no está instalado. Instálalo desde aaPanel → App Store → Docker y vuelve a ejecutar."; exit 1
fi
docker compose version >/dev/null 2>&1 || { echo "Falta 'docker compose' (plugin v2)."; exit 1; }

./deploy/check.sh
read -rp "¿Continuar con la instalación? (s/N): " GO
[ "$GO" = "s" ] || [ "$GO" = "S" ] || exit 0

if [ ! -f .env.prod ]; then
  PORT=8090
  while ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$PORT$"; do PORT=$((PORT+1)); done
  echo ">> Puerto libre elegido: $PORT"
  read -rp "Email del administrador: " ADMIN_EMAIL
  read -rsp "Contraseña del administrador: " ADMIN_PASSWORD; echo
  case "$ADMIN_PASSWORD" in *'$'*|*'"'*|*"'"*|*' '*) echo "La contraseña no puede contener \$, comillas ni espacios."; exit 1;; esac
  JWT=$(openssl rand -hex 32)
  FERNET=$(openssl rand -base64 32 | tr '+/' '-_')
  cat > .env.prod <<EOF
DB_NAME=motorseo
PUBLIC_URL=https://${DOMAIN}
APP_PORT=${PORT}
CORS_ORIGINS=*
JWT_SECRET=${JWT}
FERNET_KEY=${FERNET}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF
  chmod 600 .env.prod
  grep -q avx /proc/cpuinfo || echo "MONGO_IMAGE=mongo:4.4" >> .env.prod
  echo ">> Creado .env.prod (guárdalo: FERNET_KEY cifra tus claves de IA)."
fi

ln -sf .env.prod .env
docker compose up -d --build
echo ""
echo "Listo. La app escucha en http://127.0.0.1:$(grep APP_PORT .env.prod | cut -d= -f2)"
echo "Ahora en aaPanel: sitio ${DOMAIN} → Reverse proxy → http://127.0.0.1:$(grep APP_PORT .env.prod | cut -d= -f2)"
