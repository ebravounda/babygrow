import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyBox } from "@/components/common";
import { useProject } from "./ProjectLayout";
import { api, errMsg, BACKEND } from "@/lib/api";

function buildPrompt(base, key, domain, brand) {
  const d = domain.replace(/\/$/, "") || "https://TU-DOMINIO";
  return `Integra en esta app un BLOG conectado a mi motor de contenidos SEO externo. NO generes artículos tú: solo muéstralos. Los artículos nuevos se crean y publican automáticamente en el motor y deben aparecer aquí solos.

DATOS DE CONEXIÓN (guárdalos en variables de entorno del frontend):
REACT_APP_BLOG_API=${base}
REACT_APP_BLOG_KEY=${key}

ENDPOINTS (públicos, solo lectura, CORS abierto):
- GET {BLOG_API}/articles?key={BLOG_KEY} → [{id, title, slug, excerpt, meta_title, meta_description, cover_url, published_at, cluster}]
- GET {BLOG_API}/articles/{slug}?key={BLOG_KEY} → {id, title, slug, html, meta_title, meta_description, cover_url, published_at, faq, key_points, author:{name, bio, photo_url, credentials}, jsonld}
- CSS de los artículos: {BLOG_API}/styles.css
- POST {BLOG_API}/track  body {key, type, article_id}  (type: "view" | "product_click" | "cta_click")
- POST {BLOG_API}/lead   body {key, email, name, message, article_id}
- Sitemap: {BLOG_API}/sitemap.xml?key={BLOG_KEY}

QUÉ CONSTRUIR:
1. Ruta /blog: título "Blog de ${brand}", cuadrícula de tarjetas (portada, título, extracto, fecha) con el diseño de esta app. Sin caché: pide la lista cada vez que se carga la página.
2. Ruta /blog/:slug:
   - Pinta el campo html con dangerouslySetInnerHTML dentro de <div className="mseo-root">. Carga {BLOG_API}/styles.css con una etiqueta <link>.
   - Muestra el título H1, el autor y la fecha, la portada y, al final, una caja "Sobre el autor".
   - Usa react-helmet-async para: <title>=meta_title, meta description, canonical=${d}/blog/{slug}, og:title, og:description, og:image=cover_url, y un <script type="application/ld+json"> con JSON.stringify(jsonld).
   - Al cargar, envía track type "view". Captura los clics en enlaces con el atributo data-track y envía track con ese valor.
   - Al final, formulario de contacto (nombre, email, mensaje) que hace POST a /lead y muestra "¡Gracias!".
   - Si la API devuelve 404, muestra "Artículo no encontrado" con un enlace a /blog.
3. Añade "Blog" al menú principal y al footer, y una sección "Últimos artículos" (3 tarjetas) en la home.
4. Backend: crea GET /api/blog-sitemap.xml que haga de proxy de {BLOG_API}/sitemap.xml?key={BLOG_KEY} y lo devuelva como application/xml.
5. No hardcodees las URLs: usa las variables de entorno de arriba.`;
}

export default function ConnectSite() {
  const { project, setProject } = useProject();
  const base = `${BACKEND}/api/public/${project.id}`;
  const initial = (project.blog_url_pattern || "").replace(/\/blog\/\{slug\}$/, "");
  const [domain, setDomain] = useState(initial);
  const brand = project.brand?.brand_name || project.name;
  const saveDomain = async () => {
    try {
      const d = domain.replace(/\/$/, "");
      const { data } = await api.patch(`/projects/${project.id}`, { blog_url_pattern: d ? `${d}/blog/{slug}` : "" });
      setProject(data); toast.success("Dominio guardado: sitemap, canonical y enlaces internos apuntarán a tu web");
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="grid lg:grid-cols-[1fr_1.4fr] gap-6" data-testid="connect-site-panel">
      <div className="space-y-5">
        <div className="panel p-6 space-y-3">
          <p className="font-heading font-semibold text-lg">1. Dominio del otro sitio</p>
          <p className="text-sm text-slate-400">La URL pública de tu otra app (ej. https://openfactura.cl). Los artículos tendrán su URL canónica en tu dominio: {domain || "https://tu-dominio"}/blog/slug.</p>
          <div className="flex gap-2">
            <Input data-testid="connect-domain-input" className="font-mono" placeholder="https://openfactura.cl" value={domain} onChange={(e) => setDomain(e.target.value)} />
            <Button data-testid="connect-domain-save" onClick={saveDomain} className="rounded-full">Guardar</Button>
          </div>
        </div>
        <div className="panel p-6 text-sm text-slate-300 space-y-2">
          <p className="font-heading font-semibold text-lg text-white">2. Pega el prompt en tu otro proyecto</p>
          <p>Abre la ventana de desarrollo de tu otro sitio (en Emergent u otra herramienta) y pega el prompt de la derecha. Construirá las páginas /blog y /blog/:slug conectadas a este motor.</p>
          <p className="font-heading font-semibold text-lg text-white pt-3">3. Activa el modo automático aquí</p>
          <p>En la pestaña <b>Calendario y piloto</b>: activa el piloto automático y, si quieres, «Publicar sin revisión». En el plan, aprueba los temas. Los artículos se escriben y publican solos, y aparecen en tu otro sitio sin tocar nada.</p>
          <p className="font-heading font-semibold text-lg text-white pt-3">4. Google</p>
          <p>Cuando esté publicado, envía <span className="font-mono text-emerald-400">{domain || "https://tu-dominio"}/api/blog-sitemap.xml</span> a Google Search Console.</p>
        </div>
      </div>
      <CopyBox label="Prompt para tu otro proyecto" value={buildPrompt(base, project.public_key, domain, brand)} testid="copy-connect-prompt" />
    </div>
  );
}
