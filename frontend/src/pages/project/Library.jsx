import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Library as LibIcon, PenLine, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusBadge, Empty, IntentBadge } from "@/components/common";
import { ImportDialog } from "@/components/ImportDialog";
import { useProject } from "./ProjectLayout";
import { api, errMsg } from "@/lib/api";

const FILTERS = [["todos", "Todos"], ["draft", "Borradores"], ["review", "Por revisar"], ["scheduled", "Programados"], ["published", "Publicados"]];

function CoversButton({ project, onProgress }) {
  const [st, setSt] = useState(null);
  const load = useCallback(() => api.get(`/projects/${project.id}/covers`).then((r) => { setSt(r.data); return r.data; }), [project.id]);
  useEffect(() => { load(); }, [load]);
  const running = st?.job?.running;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => { const d = await load(); onProgress(); if (!d.job?.running) toast.success(`Portadas creadas: ${d.job.done}${d.job.errors ? ` · con error: ${d.job.errors}` : ""}`); }, 5000);
    return () => clearInterval(t);
  }, [running, load, onProgress]);
  const start = async () => {
    try { const { data } = await api.post(`/projects/${project.id}/covers/missing`); toast.success(`Creando ${data.queued} portada(s)…`); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  if (!st) return null;
  return (
    <Button data-testid="library-missing-covers-button" variant="outline" className="rounded-full" onClick={start} disabled={running || !st.missing}
      title={st.has_key ? "" : "Necesitas la clave de OpenAI o de Gemini"}>
      {running ? <><Loader2 size={15} className="mr-1 animate-spin" /> Portadas {st.job.done + st.job.errors}/{st.job.total}</>
        : <><ImagePlus size={15} className="mr-1" /> Crear portadas que faltan ({st.missing})</>}
    </Button>
  );
}

export default function Library() {
  const { project } = useProject();
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [f, setF] = useState("todos");
  const load = useCallback(() => api.get(`/projects/${project.id}/articles`).then((r) => setItems(r.data)), [project.id]);
  useEffect(() => { load(); }, [load]);
  const shown = items.filter((a) => f === "todos" || a.status === f);
  return (
    <div>
      <PageHeader eyebrow="Biblioteca" title="Artículos" desc="Borrador → programado → publicado. Abre cualquiera para editarlo, verificar datos o publicarlo.">
        <div className="flex gap-2 flex-wrap">
          <CoversButton project={project} onProgress={load} />
          <ImportDialog project={project} onDone={load} />
          <Button data-testid="library-new-article" onClick={() => nav(`/p/${project.id}/redactar`)} className="rounded-full"><PenLine size={15} className="mr-1" /> Nuevo artículo</Button>
        </div>
      </PageHeader>
      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTERS.map(([k, l]) => (
          <button key={k} data-testid={`library-filter-${k}`} onClick={() => setF(k)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${f === k ? "bg-white text-black border-white" : "border-slate-700 text-slate-400 hover:text-white"}`}>
            {l} <span className="opacity-60 ml-1">{k === "todos" ? items.length : items.filter((a) => a.status === k).length}</span>
          </button>
        ))}
      </div>
      {!shown.length ? <Empty icon={LibIcon} title="Nada por aquí" desc="Redacta tu primer artículo desde el plan o importa los que ya tienes." /> : (
        <div className="panel overflow-hidden">
          <div className="grid grid-cols-[64px_1fr_120px_90px_130px] gap-4 px-5 py-3 border-b border-slate-800 eyebrow"><span>Portada</span><span>Título</span><span>Estado</span><span>Calidad</span><span>Fecha</span></div>
          {shown.map((a) => (
            <button key={a.id} data-testid={`article-row-${a.id}`} onClick={() => nav(`/p/${project.id}/articulos/${a.id}`)}
              className="w-full text-left grid grid-cols-[64px_1fr_120px_90px_130px] gap-4 px-5 py-4 border-b border-slate-800/70 hover:bg-slate-900/60 transition-colors items-center">
              {a.cover_url ? <img src={a.cover_url} alt="" className="w-16 h-10 object-cover rounded" data-testid={`article-cover-${a.id}`} />
                : <div className="w-16 h-10 rounded bg-slate-800/80 grid place-items-center text-slate-600" title={a.cover_error || "Sin portada"}><ImagePlus size={14} /></div>}
              <div className="min-w-0"><p className="font-semibold truncate">{a.title}</p>
                <div className="flex gap-2 mt-1 items-center text-xs text-slate-500"><IntentBadge intent={a.intent} /><span className="font-mono truncate">/{a.slug}</span>
                  {a.autopilot && <span className="text-indigo-300">· piloto automático</span>}{a.imported && <span className="text-sky-300">· importado</span>}</div></div>
              <StatusBadge status={a.status} />
              <span className={`font-heading font-bold text-lg ${(a.score?.total || 0) >= 80 ? "text-emerald-400" : (a.score?.total || 0) >= 60 ? "text-amber-400" : "text-rose-400"}`}>{a.score?.total ?? "—"}</span>
              <span className="text-xs text-slate-500 font-mono">{(a.published_at || a.publish_at || a.created_at || "").slice(0, 16).replace("T", " ")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
