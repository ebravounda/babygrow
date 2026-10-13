import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Library as LibIcon, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusBadge, Empty, IntentBadge } from "@/components/common";
import { useProject } from "./ProjectLayout";
import { api } from "@/lib/api";

const FILTERS = [["todos", "Todos"], ["draft", "Borradores"], ["review", "Por revisar"], ["scheduled", "Programados"], ["published", "Publicados"]];

export default function Library() {
  const { project } = useProject();
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [f, setF] = useState("todos");
  useEffect(() => { api.get(`/projects/${project.id}/articles`).then((r) => setItems(r.data)); }, [project.id]);
  const shown = items.filter((a) => f === "todos" || a.status === f);
  return (
    <div>
      <PageHeader eyebrow="Biblioteca" title="Artículos" desc="Borrador → programado → publicado. Abre cualquiera para editarlo, verificar datos o publicarlo.">
        <Button data-testid="library-new-article" onClick={() => nav(`/p/${project.id}/redactar`)} className="rounded-full"><PenLine size={15} className="mr-1" /> Nuevo artículo</Button>
      </PageHeader>
      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTERS.map(([k, l]) => (
          <button key={k} data-testid={`library-filter-${k}`} onClick={() => setF(k)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${f === k ? "bg-white text-black border-white" : "border-slate-700 text-slate-400 hover:text-white"}`}>
            {l} <span className="opacity-60 ml-1">{k === "todos" ? items.length : items.filter((a) => a.status === k).length}</span>
          </button>
        ))}
      </div>
      {!shown.length ? <Empty icon={LibIcon} title="Nada por aquí" desc="Redacta tu primer artículo desde el plan o la redacción en vivo." /> : (
        <div className="panel overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_90px_130px] gap-4 px-5 py-3 border-b border-slate-800 eyebrow"><span>Título</span><span>Estado</span><span>Calidad</span><span>Fecha</span></div>
          {shown.map((a) => (
            <button key={a.id} data-testid={`article-row-${a.id}`} onClick={() => nav(`/p/${project.id}/articulos/${a.id}`)}
              className="w-full text-left grid grid-cols-[1fr_120px_90px_130px] gap-4 px-5 py-4 border-b border-slate-800/70 hover:bg-slate-900/60 transition-colors items-center">
              <div className="min-w-0"><p className="font-semibold truncate">{a.title}</p>
                <div className="flex gap-2 mt-1 items-center text-xs text-slate-500"><IntentBadge intent={a.intent} /><span className="font-mono truncate">/{a.slug}</span>{a.autopilot && <span className="text-indigo-300">· piloto automático</span>}</div></div>
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
