#!/usr/bin/env bash
# Revisión previa: SOLO LEE, no modifica nada. Comprueba que Motor SEO no choque con lo que ya tienes.
cd "$(dirname "$0")/.."
PORT="${1:-$(grep -s '^APP_PORT=' .env.prod | cut -d= -f2)}"; PORT="${PORT:-8090}"
ok() { echo "  [OK]  $1"; }; warn() { echo "  [!!]  $1"; }

echo "== Docker"
command -v docker >/dev/null && ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ,)" || { warn "Docker no instalado (aaPanel → App Store → Docker)"; exit 1; }
docker compose version >/dev/null 2>&1 && ok "docker compose v2 disponible" || warn "Falta el plugin 'docker compose' v2"

echo "== Nombres (proyecto 'motorseo')"
C=$(docker ps -a --format '{{.Names}}' | grep -E '^motorseo[-_]' || true)
[ -z "$C" ] && ok "No hay contenedores con el prefijo motorseo" || warn "Ya existen contenedores motorseo: $C (¿instalación previa?)"
docker volume ls --format '{{.Name}}' | grep -q '^motorseo_mongo_data$' && warn "Ya existe el volumen motorseo_mongo_data (se reutilizará)" || ok "Volumen motorseo_mongo_data libre"
docker network ls --format '{{.Name}}' | grep -q '^motorseo_motorseo$' && warn "Ya existe la red motorseo_motorseo" || ok "Red motorseo_motorseo libre"
docker images --format '{{.Repository}}' | grep -qE '^motorseo-(backend|frontend)$' && warn "Ya existen imágenes motorseo-*" || ok "Nombres de imagen libres"

echo "== Puerto $PORT (solo 127.0.0.1)"
if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$PORT$"; then
  warn "El puerto $PORT YA ESTÁ EN USO. Usa otro: ./deploy/check.sh 8095 y pon APP_PORT=8095 en .env.prod"
else ok "Puerto $PORT libre"; fi

echo "== Recursos"
free -m | awk '/Mem:/ {printf "  [i]   RAM total %s MB, disponible %s MB (Motor SEO usa ~1,3 GB en marcha)\n",$2,$7}'
free -m | awk '/Swap:/ {if ($2 < 2000) print "  [!!]  Swap de solo " $2 " MB: recomendable 4 GB para compilar (ver DESPLIEGUE.md)"; else print "  [OK]  Swap " $2 " MB"}'
df -h . | awk 'NR==2 {printf "  [i]   Disco libre: %s (necesita ~5 GB)\n",$4}'
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
  grep -q avx /proc/cpuinfo && ok "CPU x86 con AVX (mongo:7 compatible)" || warn "CPU x86 sin AVX: se usará mongo:4.4"
else
  grep -q asimddp /proc/cpuinfo && ok "CPU ARM ($ARCH) ARMv8.2+ (mongo:7 compatible)" || warn "CPU ARM antigua: se usará mongo:4.4"
fi

echo "== Contenedores existentes (no se tocarán)"
docker ps --format '  - {{.Names}}  [{{.Ports}}]'
echo ""
echo "Motor SEO solo crea recursos con el prefijo 'motorseo', no publica MongoDB y solo escucha en 127.0.0.1:$PORT."
