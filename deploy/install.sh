#!/usr/bin/env bash
# Instalación inicial de Motor SEO en tu servidor (aaPanel / cualquier Linux con Docker)
set -euo pipefail
cd "$(dirname "$0")/.."

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then read -rp "Dominio (ej. seo.mitiendapro.com): " DOMAIN; fi

if ! command -v docker >/dev/null 2>&1; then
  echo ">> Instalando Docker…"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || { echo "Falta 'docker compose' (plugin v2)."; exit 1; }

if [ ! -f .env.prod ]; then
  read -rp "Email del administrador: " ADMIN_EMAIL
  read -rsp "Contraseña del administrador: " ADMIN_PASSWORD; echo
  case "$ADMIN_PASSWORD" in *'$'*|*'"'*|*"'"*|*' '*) echo "La contraseña no puede contener \$, comillas ni espacios."; exit 1;; esac
  JWT=$(openssl rand -hex 32)
  FERNET=$(openssl rand -base64 32 | tr '+/' '-_')
  cat > .env.prod <<EOF
DB_NAME=motorseo
PUBLIC_URL=https://${DOMAIN}
APP_PORT=8090
CORS_ORIGINS=*
JWT_SECRET=${JWT}
FERNET_KEY=${FERNET}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF
  chmod 600 .env.prod
  echo ">> Creado .env.prod (guárdalo: FERNET_KEY cifra tus claves de IA)."
fi

ln -sf .env.prod .env
docker compose up -d --build
echo ""
echo "Listo. La app escucha en http://127.0.0.1:$(grep APP_PORT .env.prod | cut -d= -f2)"
echo "Ahora en aaPanel: sitio ${DOMAIN} → Reverse proxy → http://127.0.0.1:$(grep APP_PORT .env.prod | cut -d= -f2)"
