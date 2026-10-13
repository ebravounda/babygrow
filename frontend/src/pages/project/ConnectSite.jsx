import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyBox } from "@/components/common";
import { useProject } from "./ProjectLayout";
import { api, errMsg, BACKEND } from "@/lib/api";

function buildPrompt(domain, brand) {
  const d = domain.replace(/\/$/, "") || "https://TU-DOMINIO";
  return `Crea un módulo de BLOG conectado a un motor de contenidos SEO externo. NO generes artículos tú: solo muéstralos. Los artículos se crean y publican automáticamente en el motor y deben aparecer aquí solos.
IMPORTANTE: la app está en producción. NO modifiques ningún archivo .env ni variables de entorno. La conexión se configura desde el panel de administración y se guarda en la base de datos.

1. PANEL DE ADMINISTRACIÓN → nueva sección "Blog SEO" (solo administradores):
   - Campo "Enlace de conexión" (una URL con este formato: https://.../api/public/{id}/connect?key={clave}).
   - Botón "Probar conexión": el backend hace GET a ese enlace. Si la respuesta trae ok=true, muestra "Conectado a {brand} · {published} artículos publicados".
   - Botón "Guardar": guarda en la base de datos (colección/tabla blog_settings) los campos api_base y key que devuelve el enlace, más enabled=true. Muestra la clave enmascarada.
   - Botón "Desconectar": borra la configuración.

2. BACKEND: proxy, para que la clave no viaje al navegador. Todos los endpoints leen api_base y key de blog_settings. Si no hay configuración, devuelven una lista vacía o 404:
   - GET  /api/blog/articles        → GET {api_base}/articles?key={key}
   - GET  /api/blog/articles/{slug} → GET {api_base}/articles/{slug}?key={key}
   - POST /api/blog/track   body {type, article_id} → POST {api_base}/track con {key, type, article_id}
   - POST /api/blog/lead    body {email, name, message, article_id} → POST {api_base}/lead con {key, ...}
   - GET  /api/blog-sitemap.xml → GET {api_base}/sitemap.xml?key={key}, devuelto como application/xml
   - GET  /api/blog/styles.css → GET {api_base}/styles.css, devuelto como text/css
   Formato de los datos del motor:
   - lista: [{id, title, slug, excerpt, meta_title, meta_description, cover_url, published_at, cluster}]
   - artículo: {id, title, slug, html, meta_title, meta_description, cover_url, published_at, faq, key_points, author:{name, bio, photo_url, credentials}, jsonld}
   Timeout de 15 s. Sin caché (o caché máxima de 5 min).

3. FRONTEND (usa solo los endpoints /api/blog del propio backend):
   - Ruta /blog: título "Blog de ${brand}", cuadrícula de tarjetas (portada, título, extracto, fecha) con el diseño actual de la app. Si no hay artículos, muestra "Pronto publicaremos artículos".
   - Ruta /blog/:slug:
     • Pinta el campo html con dangerouslySetInnerHTML dentro de <div className="mseo-root"> y carga /api/blog/styles.css con una etiqueta <link>.
     • Muestra el H1, el autor y la fecha, la portada y, al final, una caja "Sobre el autor".
     • Usa react-helmet-async para: <title>=meta_title, meta description, canonical=${d}/blog/{slug}, og:title, og:description, og:image=cover_url, y un <script type="application/ld+json"> con JSON.stringify(jsonld).
     • Al cargar, envía track "view". En los clics de enlaces con el atributo data-track, envía track con ese valor.
     • Al final, formulario de contacto (nombre, email, mensaje) → POST /api/blog/lead → "¡Gracias! Te contactaremos pronto".
     • Si la API devuelve 404, muestra "Artículo no encontrado" con un enlace a /blog.
   - Añade "Blog" al menú principal y al footer, y una sección "Últimos artículos" (3 tarjetas) en la home. Si el blog no está conectado, oculta esa sección.

4. No toques nada más de la app: facturación, impuestos, usuarios y pagos se quedan como están.`;
}

export default function ConnectSite() {
  const { project, setProject } = useProject();
  const connectUrl = `${BACKEND}/api/public/${project.id}/connect?key=${project.public_key}`;
  const initial = (project.blog_url_pattern || "").replace(/\/blog\/\{slug\}$/, "");
  const [domain, setDomain] = useState(initial);
  const brand = project.brand?.brand_name || project.name;
  const saveDomain = async () => {
    try {
      const d = domain.trim().replace(/\/+$/, "").replace(/\/blog$/, "");
      setDomain(d);
      const { data } = await api.patch(`/projects/${project.id}`, { blog_url_pattern: d ? `${d}/blog/{slug}` : "" });
      setProject(data); toast.success("Dominio guardado");
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="grid lg:grid-cols-[1fr_1.4fr] gap-6" data-testid="connect-site-panel">
      <div className="space-y-5">
        <div className="panel p-6 space-y-3">
          <p className="font-heading font-semibold text-lg">1. Dominio del otro sitio</p>
          <p className="text-sm text-slate-400">Los artículos tendrán su URL canónica en {domain || "https://tu-dominio"}/blog/slug.</p>
          <div className="flex gap-2">
            <Input data-testid="connect-domain-input" className="font-mono" placeholder="https://openfactura.es" value={domain} onChange={(e) => setDomain(e.target.value)} />
            <Button data-testid="connect-domain-save" onClick={saveDomain} className="rounded-full">Guardar</Button>
          </div>
        </div>
        <div className="panel p-6 space-y-3">
          <p className="font-heading font-semibold text-lg">2. Enlace de conexión</p>
          <p className="text-sm text-slate-400">Pégalo en el panel de administración de tu otro sitio, sección «Blog SEO». No hace falta tocar ningún .env.</p>
          <CopyBox value={connectUrl} testid="copy-connect-url" />
        </div>
        <div className="panel p-6 text-sm text-slate-300 space-y-2">
          <p className="font-heading font-semibold text-lg text-white">3. Prompt (una sola vez)</p>
          <p>Pega el prompt de la derecha en la ventana de desarrollo de tu otro sitio. Crea el módulo de blog y la sección «Blog SEO» del panel.</p>
          <p className="font-heading font-semibold text-lg text-white pt-3">4. Modo automático</p>
          <p>Aquí, en <b>Calendario y piloto</b>: activa el piloto automático. Los artículos aparecen solos en tu web.</p>
          <p className="text-xs text-amber-400 pt-2">Si publicas esta herramienta en otra dirección, solo tendrás que copiar el nuevo enlace de conexión y pegarlo otra vez en el panel.</p>
        </div>
      </div>
      <CopyBox label="Prompt para tu otro proyecto" value={buildPrompt(domain, brand)} testid="copy-connect-prompt" />
    </div>
  );
}
