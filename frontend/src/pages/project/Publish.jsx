import { useState } from "react";
import { Code2, Rss, Globe2, Bot, CalendarClock, Plug, Zap, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, CopyBox } from "@/components/common";
import { useProject } from "./ProjectLayout";
import { api, errMsg, BACKEND } from "@/lib/api";

const DAYS = ["L", "M", "X", "J", "V", "S", "D"];
const STEPS = {
  HTML: "Pega el código donde quieras que aparezca el blog (por ejemplo en blog.html), dentro del <body>.",
  WordPress: "Añade un bloque «HTML personalizado» en la página Blog y pega el código. O mejor: usa la publicación nativa (pestaña WordPress).",
  Shopify: "Tienda online → Páginas → crea «Blog» → botón <> (mostrar HTML) → pega el código. O usa la publicación nativa (pestaña Shopify).",
  "Wix / Webflow": "Wix: Añadir → Insertar código → Insertar HTML (va dentro de un marco). Webflow: componente Embed en la página del blog.",
  "React / Emergent": "En tu página Blog: useEffect(() => { const s = document.createElement('script'); s.src = 'URL_DEL_SCRIPT'; document.body.appendChild(s); }, []) y renderiza <div id=\"blog-seo\" />.",
};

function Integration({ name, fields, testid }) {
  const { project, reload } = useProject();
  const cur = project.integrations?.[name] || {};
  const [f, setF] = useState({});
  const [busy, setBusy] = useState("");
  const save = async (extra = {}) => {
    setBusy("save");
    try { await api.put(`/projects/${project.id}/integrations/${name}`, { ...f, ...extra }); await reload(); setF({}); toast.success("Conexión guardada"); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); }
  };
  const test = async () => {
    setBusy("test");
    try { const { data } = await api.post(`/projects/${project.id}/integrations/${name}/test`); data.ok ? toast.success(`Conectado: ${data.detail}`) : toast.error(data.detail); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); }
  };
  return (
    <div className="panel p-6 max-w-2xl space-y-4" data-testid={testid}>
      {fields.map(([k, label, ph, secret]) => (
        <div key={k}><label className="eyebrow block mb-1.5">{label}</label>
          <Input data-testid={`${testid}-${k}`} type={secret ? "password" : "text"} placeholder={secret && cur[`${k === "app_password" ? "app_password" : "token"}_enc`] ? cur[`${k === "app_password" ? "app_password" : "token"}_enc`] : ph}
            value={f[k] ?? (secret ? "" : cur[k] || "")} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button data-testid={`${testid}-save`} onClick={() => save()} disabled={!!busy} className="rounded-full">Guardar</Button>
        {cur.enabled !== undefined && <>
          <Button data-testid={`${testid}-test`} variant="secondary" onClick={test} disabled={!!busy} className="rounded-full"><Zap size={14} className="mr-1" />{busy === "test" ? "Probando…" : "Probar conexión"}</Button>
          <label className="flex items-center gap-2 text-sm text-slate-300"><Switch data-testid={`${testid}-enabled`} checked={cur.enabled} onCheckedChange={(v) => save({ enabled: v })} /> Publicar aquí al publicar</label>
          <button onClick={() => api.delete(`/projects/${project.id}/integrations/${name}`).then(reload)} className="text-slate-500 hover:text-rose-400 ml-auto"><Trash2 size={15} /></button>
        </>}
      </div>
    </div>
  );
}

function Schedule() {
  const { project, setProject } = useProject();
  const [cad, setCad] = useState(project.cadence || {});
  const [ap, setAp] = useState(project.autopilot || {});
  const save = async () => {
    try { const { data } = await api.patch(`/projects/${project.id}`, { cadence: { ...cad, per_week: Number(cad.per_week), hour: Number(cad.hour) }, autopilot: ap }); setProject(data); toast.success("Calendario guardado"); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const toggleDay = (d) => setCad({ ...cad, days: (cad.days || []).includes(d) ? cad.days.filter((x) => x !== d) : [...(cad.days || []), d] });
  return (
    <div className="panel p-6 max-w-2xl space-y-6" data-testid="schedule-panel">
      <div className="grid grid-cols-2 gap-4">
        <div><label className="eyebrow block mb-1.5">Artículos por semana</label><Input data-testid="cadence-per-week" type="number" value={cad.per_week} onChange={(e) => setCad({ ...cad, per_week: e.target.value })} /></div>
        <div><label className="eyebrow block mb-1.5">Hora (UTC)</label><Input data-testid="cadence-hour" type="number" min={0} max={23} value={cad.hour} onChange={(e) => setCad({ ...cad, hour: e.target.value })} /></div>
      </div>
      <div><label className="eyebrow block mb-2">Días</label><div className="flex gap-2">{DAYS.map((l, i) => (
        <button key={l} data-testid={`cadence-day-${i + 1}`} onClick={() => toggleDay(i + 1)} className={`w-10 h-10 rounded-full font-semibold text-sm border transition-colors ${(cad.days || []).includes(i + 1) ? "bg-emerald-500 text-black border-emerald-500" : "border-slate-700 text-slate-400"}`}>{l}</button>))}</div></div>
      <div className="space-y-3 pt-4 border-t border-slate-800">
        <label className="flex items-start gap-3"><Switch data-testid="autopilot-enabled" checked={!!ap.enabled} onCheckedChange={(v) => setAp({ ...ap, enabled: v })} />
          <span><b>Piloto automático</b><span className="block text-sm text-slate-400">Redacta los temas aprobados del plan en los días y hora elegidos, y verifica sus datos.</span></span></label>
        <label className="flex items-start gap-3"><Switch data-testid="autopilot-auto-publish" checked={!!ap.auto_publish} disabled={!ap.enabled} onCheckedChange={(v) => setAp({ ...ap, auto_publish: v })} />
          <span><b>Publicar sin revisión</b><span className="block text-sm text-slate-400">Por defecto, los artículos quedan «Por revisar». Actívalo solo si confías al 100 %.</span></span></label>
      </div>
      <Button data-testid="schedule-save" onClick={save} className="rounded-full">Guardar calendario</Button>
    </div>
  );
}

export default function Publish() {
  const { project, setProject } = useProject();
  const [w, setW] = useState(project.widget || {});
  const [pattern, setPattern] = useState(project.blog_url_pattern || "");
  const [platform, setPlatform] = useState("HTML");
  const base = `${BACKEND}/api/public/${project.id}`;
  const k = `key=${project.public_key}`;
  const script = `${base}/widget.js?${k}`;
  const snippet = `<div id="blog-seo"></div>\n<script src="${script}" async></script>`;
  const saveW = async () => { const { data } = await api.patch(`/projects/${project.id}`, { widget: w, blog_url_pattern: pattern }); setProject(data); toast.success("Guardado"); };

  return (
    <div>
      <PageHeader eyebrow="Conecta tus sitios" title="Publicar" desc="Conecta cada sitio una sola vez. Elige widget, API, publicación nativa o todas a la vez." />
      <Tabs defaultValue="widget">
        <TabsList className="mb-6 bg-slate-900 border border-slate-800 flex-wrap h-auto">
          <TabsTrigger value="widget" data-testid="publish-tab-widget"><Code2 size={14} className="mr-1.5" />Widget</TabsTrigger>
          <TabsTrigger value="feeds" data-testid="publish-tab-feeds"><Rss size={14} className="mr-1.5" />API, RSS y llms.txt</TabsTrigger>
          <TabsTrigger value="wordpress" data-testid="publish-tab-wordpress"><Plug size={14} className="mr-1.5" />WordPress</TabsTrigger>
          <TabsTrigger value="shopify" data-testid="publish-tab-shopify"><Plug size={14} className="mr-1.5" />Shopify</TabsTrigger>
          <TabsTrigger value="schedule" data-testid="publish-tab-schedule"><CalendarClock size={14} className="mr-1.5" />Calendario y piloto</TabsTrigger>
        </TabsList>
        <TabsContent value="widget">
          <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6">
            <div className="space-y-5">
              <CopyBox label="Código para pegar" value={snippet} testid="copy-widget-snippet" />
              <div className="flex gap-2 flex-wrap">{Object.keys(STEPS).map((p) => (
                <button key={p} data-testid={`platform-${p}`} onClick={() => setPlatform(p)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${platform === p ? "bg-white text-black border-white" : "border-slate-700 text-slate-400 hover:text-white"}`}>{p}</button>))}</div>
              <div className="panel p-5 text-sm text-slate-300" data-testid="platform-steps">{STEPS[platform].replace("URL_DEL_SCRIPT", script)}</div>
              <p className="text-xs text-slate-500">Nota SEO: el widget se carga con JavaScript y muchos rastreadores de IA no lo leen. Para el máximo SEO usa además la publicación nativa o las páginas rastreables.</p>
            </div>
            <div className="panel p-6 space-y-4">
              <p className="font-heading font-semibold">Estilo del widget</p>
              <div className="flex items-center gap-3"><input data-testid="widget-color" type="color" value={w.color || "#10B981"} onChange={(e) => setW({ ...w, color: e.target.value })} className="w-10 h-10 rounded bg-transparent" /><span className="text-sm text-slate-400">Color de acento (la tipografía se hereda de tu web)</span></div>
              <div className="flex gap-2">{["grid", "list"].map((l) => <button key={l} data-testid={`widget-layout-${l}`} onClick={() => setW({ ...w, layout: l })} className={`px-4 py-2 rounded-lg text-sm border ${w.layout === l ? "border-emerald-500 text-white" : "border-slate-700 text-slate-400"}`}>{l === "grid" ? "Cuadrícula" : "Lista"}</button>)}</div>
              <label className="flex items-center gap-3 text-sm"><Switch data-testid="widget-lead-form" checked={w.lead_form !== false} onCheckedChange={(v) => setW({ ...w, lead_form: v })} /> Formulario de contacto al final de cada artículo</label>
              <Input placeholder="Título del formulario" value={w.lead_title || ""} onChange={(e) => setW({ ...w, lead_title: e.target.value })} />
              <Button data-testid="widget-save" onClick={saveW} className="rounded-full">Guardar estilo</Button>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="feeds">
          <div className="grid lg:grid-cols-2 gap-5">
            <CopyBox label="API pública: lista de artículos (JSON)" value={`${base}/articles?${k}`} testid="copy-api-list" />
            <CopyBox label="API pública: un artículo" value={`${base}/articles/{slug}?${k}`} testid="copy-api-article" />
            <CopyBox label="Feed RSS" value={`${base}/rss?${k}`} testid="copy-rss" />
            <CopyBox label="Sitemap (envíalo a Search Console)" value={`${base}/sitemap.xml?${k}`} testid="copy-sitemap" />
            <CopyBox label="llms.txt (súbelo a la raíz de tu web o enlázalo)" value={`${base}/llms.txt`} testid="copy-llms" />
            <CopyBox label="Blog rastreable (HTML del servidor, lo leen Google y las IAs)" value={`${BACKEND}/api/blog/${project.id}`} testid="copy-ssr" />
          </div>
          <div className="panel p-6 mt-6 max-w-3xl space-y-3">
            <p className="font-heading font-semibold flex items-center gap-2"><Globe2 size={16} className="text-emerald-400" /> URL canónica de tus artículos</p>
            <p className="text-sm text-slate-400">Si muestras los artículos en tu propio dominio (WordPress, tu servidor vía API o un subdominio como blog.tusitio.com), indica el patrón. Se usa en el sitemap, RSS, llms.txt, enlaces internos y datos estructurados.</p>
            <Input data-testid="blog-url-pattern" className="font-mono" placeholder="https://tusitio.com/blog/{slug}" value={pattern} onChange={(e) => setPattern(e.target.value)} />
            <p className="text-xs text-slate-500"><Bot size={12} className="inline mr-1" />Subdominio propio: crea un registro CNAME (blog → este servidor) en tu proveedor de dominio, una vez publicada la herramienta.</p>
            <Button data-testid="blog-url-save" onClick={saveW} size="sm" className="rounded-full">Guardar</Button>
          </div>
        </TabsContent>
        <TabsContent value="wordpress">
          <p className="text-sm text-slate-400 mb-4 max-w-2xl">En WordPress: Usuarios → Perfil → «Contraseñas de aplicación» → escribe un nombre → Añadir. Copia la contraseña generada (con espacios).</p>
          <Integration name="wordpress" testid="wp" fields={[["url", "URL de WordPress", "https://tusitio.com"], ["user", "Usuario", "admin"], ["app_password", "Contraseña de aplicación", "xxxx xxxx xxxx xxxx", true]]} />
        </TabsContent>
        <TabsContent value="shopify">
          <p className="text-sm text-slate-400 mb-4 max-w-2xl">En Shopify: Configuración → Apps → Desarrollar apps → Crear app → permisos <span className="font-mono">write_content, read_content</span> → Instalar → copia el token de acceso de Admin API.</p>
          <Integration name="shopify" testid="shopify" fields={[["shop", "Tienda", "mitienda.myshopify.com"], ["blog_id", "ID del blog (opcional)", "se usa el primero"], ["token", "Token de Admin API", "shpat_…", true]]} />
        </TabsContent>
        <TabsContent value="schedule"><Schedule /></TabsContent>
      </Tabs>
    </div>
  );
}
