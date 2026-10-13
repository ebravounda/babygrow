# Desplegar Motor SEO en tu servidor (aaPanel + Cloudflare)

Todo corre en Docker: base de datos (MongoDB), servidor (backend) y web (frontend). aaPanel solo redirige tu dominio a la app.

## Requisitos
- Servidor Linux con aaPanel, al menos 2 GB de RAM y 10 GB libres.
- Docker. Si no lo tienes, el instalador lo instala; también puedes hacerlo desde aaPanel → App Store → Docker.
- El código en un repositorio de GitHub. En Emergent: botón **Save to GitHub**.

## 1. Primera instalación (una sola vez)
Por SSH en tu servidor:
```bash
cd /www/wwwroot
git clone https://github.com/TU_USUARIO/TU_REPO.git motorseo
cd motorseo
./deploy/install.sh seo.mitiendapro.com
```
El instalador te pide el email y la contraseña del administrador. Después crea `.env.prod` con claves secretas aleatorias y arranca todo. Puede tardar entre 5 y 10 minutos la primera vez.

> Guarda una copia de `.env.prod`. La clave `FERNET_KEY` cifra tus claves de IA: si la pierdes, tendrás que volver a introducirlas.

## 2. aaPanel: redirigir el dominio
1. **Website → seo.mitiendapro.com → Conf → Reverse proxy → Add reverse proxy**.
2. Target URL: `http://127.0.0.1:8090`. Deja Sent Domain en `$host`.
3. Pestaña **SSL**: emite un certificado Let's Encrypt (o instala un *Origin Certificate* de Cloudflare) y activa *Force HTTPS*.
4. Para que la redacción en vivo funcione bien, edita la configuración del proxy y añade dentro de `location /`:
```
proxy_buffering off;
proxy_read_timeout 600s;
```

## 3. Cloudflare
- DNS: registro `A` con nombre `seo` apuntando a la IP de tu servidor, con la nube naranja (proxied).
- SSL/TLS → modo **Full (strict)**.
- Opcional: Rules → crea una regla *Cache Bypass* para `seo.mitiendapro.com/api/*`.

## 4. Actualizar (cada vez que hagas cambios)
1. En Emergent, guarda los cambios en GitHub (**Save to GitHub**).
2. En el servidor:
```bash
cd /www/wwwroot/motorseo && ./deploy/update.sh
```
El script hace una copia de seguridad, descarga los cambios y reconstruye la app. Tu base de datos y tus claves no se tocan.

## Copias de seguridad
- Manual: `./deploy/backup.sh` (se guarda en `backups/`, con las 14 últimas).
- Automática: en aaPanel → Cron → Shell script, cada día:
  `cd /www/wwwroot/motorseo && ./deploy/backup.sh`
- Restaurar: `docker compose exec -T mongo mongorestore --archive --gzip --drop < backups/ARCHIVO.archive.gz`

## Comandos útiles
- Ver el estado: `docker compose ps`
- Ver los registros del servidor: `docker compose logs -f backend`
- Reiniciar: `docker compose restart`
- Cambiar la contraseña de administrador: edita `ADMIN_PASSWORD` en `.env.prod` y ejecuta `docker compose up -d backend`.

## Problemas comunes
- **El contenedor `mongo` se reinicia sin parar** (CPU sin AVX en VPS antiguos): añade `MONGO_IMAGE=mongo:4.4` a `.env.prod` y ejecuta `docker compose up -d`.
- **El puerto 8090 está ocupado**: cambia `APP_PORT` en `.env.prod`, ejecuta `docker compose up -d` y usa el nuevo puerto en el proxy de aaPanel.
- **Cambias de dominio**: edita `PUBLIC_URL` en `.env.prod` y ejecuta `./deploy/update.sh`.

## Después de desplegar
En OpenFactura, pega el nuevo **enlace de conexión**: Proyecto → Publicar → Conectar otro proyecto. Ahora empezará por `https://seo.mitiendapro.com/api/public/...`.
