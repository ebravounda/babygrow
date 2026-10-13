import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Sparkles, Plus, Trash2, Save, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/common";
import { useProject } from "./ProjectLayout";
import { useProjects } from "@/components/Layout";
import { api, errMsg } from "@/lib/api";

const L = ({ children }) => <label className="eyebrow block mb-1.5">{children}</label>;

function Authors({ pid }) {
  const [list, setList] = useState([]);
  const [f, setF] = useState({ name: "", credentials: "", bio: "", photo_url: "", same_as: "" });
  const load = () => api.get(`/projects/${pid}/authors`).then((r) => setList(r.data));
  useEffect(() => { load(); }, [pid]); // eslint-disable-line
  const save = async () => {
    try { await api.post(`/projects/${pid}/authors`, f); setF({ name: "", credentials: "", bio: "", photo_url: "", same_as: "" }); load(); toast.success("Autor guardado"); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="panel p-6" data-testid="authors-panel">
      <p className="font-heading text-lg font-semibold mb-1">Perfiles de autor</p>
      <p className="text-sm text-slate-400 mb-4">Refuerzan la confianza (E-E-A-T) ante Google y las IAs. Se añaden a los datos estructurados.</p>
      {list.map((a) => (
        <div key={a.id} className="flex items-center gap-3 py-2.5 border-b border-slate-800">
          {a.photo_url ? <img src={a.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" /> : <UserRound className="text-slate-500" />}
          <div className="flex-1"><p className="font-semibold text-sm">{a.name}</p><p className="text-xs text-slate-500">{a.credentials}</p></div>
          <button data-testid={`author-delete-${a.id}`} onClick={() => api.delete(`/authors/${a.id}`).then(load)} className="text-slate-500 hover:text-rose-400"><Trash2 size={15} /></button>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <Input data-testid="author-name" placeholder="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input data-testid="author-credentials" placeholder="Credenciales (ej. Nutricionista colegiada)" value={f.credentials} onChange={(e) => setF({ ...f, credentials: e.target.value })} />
        <Input placeholder="URL de foto" value={f.photo_url} onChange={(e) => setF({ ...f, photo_url: e.target.value })} />
        <Input placeholder="Perfiles (LinkedIn, web…) separados por comas" value={f.same_as} onChange={(e) => setF({ ...f, same_as: e.target.value })} />
        <Textarea className="col-span-2" placeholder="Biografía breve" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
      </div>
      <Button data-testid="author-save" onClick={save} size="sm" className="mt-3 rounded-full"><Plus size={14} className="mr-1" /> Añadir autor</Button>
    </div>
  );
}

export default function Brand() {
  const { project, setProject } = useProject();
  const { reload: reloadList } = useProjects();
  const [params, setParams] = useSearchParams();
  const [f, setF] = useState(project);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(project), [project]);
  const b = f.brand || {};
  const setB = (k, v) => setF({ ...f, brand: { ...b, [k]: v } });

  const analyze = async () => {
    setBusy(true);
    try { const { data } = await api.post(`/projects/${project.id}/analyze`); setProject(data); toast.success("Marca analizada. Revisa y ajusta lo que quieras."); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  useEffect(() => { if (params.get("analizar")) { setParams({}); analyze(); } }, []); // eslint-disable-line

  const save = async () => {
    try {
      const comps = typeof f.competitors === "string" ? f.competitors.split(",").map((s) => s.trim()).filter(Boolean) : f.competitors;
      const { data } = await api.patch(`/projects/${project.id}`, { ...f, competitors: comps, monthly_budget: Number(f.monthly_budget) || 0 });
      setProject(data); reloadList(); toast.success("Cambios guardados");
    } catch (e) { toast.error(errMsg(e)); }
  };
  const cat = f.catalog || [];
  const setCat = (i, k, v) => setF({ ...f, catalog: cat.map((c, j) => (j === i ? { ...c, [k]: v } : c)) });

  return (
    <div>
      <PageHeader eyebrow="Perfil de marca" title="Marca y catálogo" desc="La base de todo lo que se redacta: oferta, tono, público, productos a impulsar y páginas a enlazar.">
        <Button data-testid="analyze-brand-button" variant="secondary" onClick={analyze} disabled={busy} className="rounded-full">
          <Sparkles size={15} className="mr-1" /> {busy ? "Analizando la web…" : "Analizar web automáticamente"}
        </Button>
        <Button data-testid="save-brand-button" onClick={save} className="rounded-full"><Save size={15} className="mr-1" /> Guardar</Button>
      </PageHeader>
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <div className="space-y-6">
          <div className="panel p-6 grid grid-cols-2 gap-4">
            <div><L>Nombre de marca</L><Input data-testid="brand-name" value={b.brand_name || ""} onChange={(e) => setB("brand_name", e.target.value)} /></div>
            <div><L>Tono de voz</L><Input data-testid="brand-tone" value={b.tone || ""} onChange={(e) => setB("tone", e.target.value)} /></div>
            <div className="col-span-2"><L>Oferta</L><Textarea data-testid="brand-offer" value={b.offer || ""} onChange={(e) => setB("offer", e.target.value)} /></div>
            <div className="col-span-2"><L>Público</L><Input value={b.audience || ""} onChange={(e) => setB("audience", e.target.value)} /></div>
            <div className="col-span-2"><L>Propuestas de valor (una por línea)</L>
              <Textarea rows={3} value={(b.value_props || []).join("\n")} onChange={(e) => setB("value_props", e.target.value.split("\n"))} /></div>
            <div className="col-span-2"><L>Páginas para enlazar (título | URL, una por línea)</L>
              <Textarea data-testid="brand-pages" rows={5} className="font-mono text-xs" value={(b.pages_to_link || []).map((p) => `${p.title} | ${p.url}`).join("\n")}
                onChange={(e) => setB("pages_to_link", e.target.value.split("\n").map((l) => { const [title, url] = l.split("|").map((s) => (s || "").trim()); return { title, url }; }))} /></div>
          </div>
          <div className="panel p-6" data-testid="catalog-panel">
            <div className="flex items-center justify-between mb-4">
              <div><p className="font-heading text-lg font-semibold">Catálogo de productos y servicios</p><p className="text-sm text-slate-400">Se muestran en las cajas de producto dentro de cada artículo.</p></div>
              <Button data-testid="catalog-add" size="sm" variant="secondary" className="rounded-full" onClick={() => setF({ ...f, catalog: [...cat, { name: "", url: "", price: "", benefit: "" }] })}><Plus size={14} /></Button>
            </div>
            {cat.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.3fr_.6fr_auto] gap-2 mb-2">
                <Input placeholder="Nombre" value={c.name} onChange={(e) => setCat(i, "name", e.target.value)} data-testid={`catalog-name-${i}`} />
                <Input placeholder="URL" value={c.url} onChange={(e) => setCat(i, "url", e.target.value)} />
                <Input placeholder="Precio" value={c.price} onChange={(e) => setCat(i, "price", e.target.value)} />
                <button onClick={() => setF({ ...f, catalog: cat.filter((_, j) => j !== i) })} className="text-slate-500 hover:text-rose-400 px-2"><Trash2 size={15} /></button>
                <Input className="col-span-4 mb-2" placeholder="Beneficio principal" value={c.benefit} onChange={(e) => setCat(i, "benefit", e.target.value)} />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <div className="panel p-6 space-y-4">
            <p className="font-heading text-lg font-semibold">Proyecto</p>
            <div><L>IA del proyecto</L>
              <Select value={f.llm_provider} onValueChange={(v) => setF({ ...f, llm_provider: v })}>
                <SelectTrigger data-testid="project-llm-select"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="anthropic">Claude Sonnet 5.5</SelectItem><SelectItem value="openai">GPT-5.6 Terra</SelectItem><SelectItem value="gemini">Gemini 3.1 Pro</SelectItem></SelectContent>
              </Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><L>País</L><Input value={f.country || ""} onChange={(e) => setF({ ...f, country: e.target.value })} /></div>
              <div><L>Idioma</L><Input value={f.language || ""} onChange={(e) => setF({ ...f, language: e.target.value })} /></div>
            </div>
            <div><L>Nicho</L><Input value={f.niche || ""} onChange={(e) => setF({ ...f, niche: e.target.value })} /></div>
            <div><L>Competidores (comas)</L><Input data-testid="project-competitors" value={Array.isArray(f.competitors) ? f.competitors.join(", ") : f.competitors} onChange={(e) => setF({ ...f, competitors: e.target.value })} /></div>
            <div><L>Límite mensual de gasto IA ($, 0 = sin límite)</L><Input data-testid="project-budget" type="number" value={f.monthly_budget || 0} onChange={(e) => setF({ ...f, monthly_budget: e.target.value })} /></div>
            <div><L>Email para avisos de contactos</L><Input data-testid="project-notify-email" value={f.notify_email || ""} onChange={(e) => setF({ ...f, notify_email: e.target.value })} placeholder="tu@email.com" /></div>
          </div>
          <div className="panel p-6 space-y-3">
            <p className="font-heading text-lg font-semibold">Llamada a la acción final</p>
            <Input placeholder="Texto, ej. ¿Quieres una demo gratis?" value={f.cta?.text || ""} onChange={(e) => setF({ ...f, cta: { ...f.cta, text: e.target.value } })} data-testid="cta-text" />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Botón" value={f.cta?.button || ""} onChange={(e) => setF({ ...f, cta: { ...f.cta, button: e.target.value } })} />
              <Input placeholder="URL" value={f.cta?.url || ""} onChange={(e) => setF({ ...f, cta: { ...f.cta, url: e.target.value } })} />
            </div>
          </div>
          <Authors pid={project.id} />
        </div>
      </div>
    </div>
  );
}
