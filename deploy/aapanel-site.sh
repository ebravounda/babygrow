#!/usr/bin/env bash
# Configura el dominio en el nginx de aaPanel para que apunte a Motor SEO (por SSH, sin usar el panel)
# Uso: sudo ./deploy/aapanel-site.sh seo.mitiendapro.com
set -euo pipefail
cd "$(dirname "$0")/.."
DOMAIN="${1:?Indica el dominio, ej: sudo ./deploy/aapanel-site.sh seo.mitiendapro.com}"
PORT="$(grep -s '^APP_PORT=' .env.prod | cut -d= -f2)"; PORT="${PORT:-8090}"
[ "$(id -u)" = "0" ] || { echo "Ejecútalo con sudo."; exit 1; }

NGINX=/www/server/nginx/sbin/nginx
VHOST=/www/server/panel/vhost/nginx
[ -x "$NGINX" ] || NGINX="$(command -v nginx)"
[ -d "$VHOST" ] || { echo "No encuentro $VHOST (¿aaPanel con nginx instalado?)"; exit 1; }
CONF="$VHOST/$DOMAIN.conf"

echo ">> 1/5 Comprobando que la app responde en 127.0.0.1:$PORT…"
curl -sf "http://127.0.0.1:$PORT/api/" >/dev/null || { echo "La app no responde. Ejecuta: docker compose ps"; exit 1; }
echo "   OK"

echo ">> 2/5 Certificado SSL…"
AACERT=/www/server/panel/vhost/cert/$DOMAIN
if [ -s "$AACERT/fullchain.pem" ] && [ -s "$AACERT/privkey.pem" ]; then
  CRT="$AACERT/fullchain.pem"; KEY="$AACERT/privkey.pem"; echo "   Uso el certificado existente de aaPanel"
else
  mkdir -p /etc/ssl/motorseo
  CRT=/etc/ssl/motorseo/$DOMAIN.crt; KEY=/etc/ssl/motorseo/$DOMAIN.key
  [ -s "$CRT" ] || openssl req -x509 -nodes -newkey rsa:2048 -days 3650 -subj "/CN=$DOMAIN" -keyout "$KEY" -out "$CRT" >/dev/null 2>&1
  echo "   Creado certificado propio (válido con Cloudflare en modo SSL «Full»)"
fi

echo ">> 3/5 Escribiendo configuración ($CONF)…"
BAK=""
if [ -f "$CONF" ]; then BAK="$CONF.bak.$(date +%Y%m%d%H%M%S)"; cp "$CONF" "$BAK"; echo "   Copia de seguridad: $BAK"; fi
mkdir -p /www/wwwlogs
cat > "$CONF" <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    ssl_certificate     $CRT;
    ssl_certificate_key $KEY;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 30m;
    access_log /www/wwwlogs/$DOMAIN.log;
    error_log  /www/wwwlogs/$DOMAIN.error.log;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
EOF

echo ">> 4/5 Validando nginx…"
if ! "$NGINX" -t; then
  echo "!! Configuración inválida. Restaurando la anterior."
  if [ -n "$BAK" ]; then mv "$BAK" "$CONF"; else rm -f "$CONF"; fi
  exit 1
fi
"$NGINX" -s reload
echo "   nginx recargado"

echo ">> 5/5 Prueba local…"
R=$(curl -sk --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/" || true)
echo "   Respuesta: $R"
case "$R" in *activo*) echo ""; echo "LISTO. Abre https://$DOMAIN"
  echo "En Cloudflare: registro A 'seo' → IP pública del servidor (nube naranja) y SSL/TLS en «Full»"
  [ "$CRT" = "$AACERT/fullchain.pem" ] && echo "(Con certificado de aaPanel puedes usar «Full (strict)»)";;
*) echo "!! La prueba no devolvió lo esperado. Envíame esta salida.";; esac
