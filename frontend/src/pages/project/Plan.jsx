import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Swords, Check, PenLine, Trash2, CalendarRange, Network, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, IntentBadge, Empty, StatusBadge } from "@/components/common";
import { useProject } from "./ProjectLayout";
import { api, errMsg } from "@/lib/api";

const TSTATUS = { propuesto: "text-slate-400", aprobado: "text-emerald-400", escrito: "text-amber-400", publicado: "text-sky-400" };

function TopicRow({ t, onChange }) {
  const nav = useNavigate();
  const { project } = useProject();
  const toggle = () => api.patch(`/topics/${t.id}`, { status: t.status === "aprobado" ? "propuesto" : "aprobado" }).then(onChange);
  return (
    <div data-testid={`topic-row-${t.id}`} className="grid grid-cols-[44px_1fr_auto] gap-4 items-center px-4 py-3.5 border-b border-slate-800/70 hover:bg-slate-900/60 transition-colors">
      <span className="font-mono text-xs text-slate-500">D{String(t.day).padStart(2, "0")}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold truncate">{t.title}</p>
          {t.is_pillar && <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 border border-indigo-500/40 px-1.5 rounded">Pilar</span>}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
          <IntentBadge intent={t.intent} />
          <span className="font-mono">{t.keyword}</span>
          <span>· {t.cluster}</span>
          {t.product && <span>· empuja <b className="text-slate-300">{t.product}</b></span>}
          <span>· {t.type}</span>
        </div>
        {t.reason && <p className="text-xs text-slate-500 mt-1 italic">{t.reason}</p>}
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold ${TSTATUS[t.status]}`}>{t.status}</span>
        {["propuesto", "aprobado"].includes(t.status) && (
          <Button data-testid={`topic-approve-${t.id}`} size="sm" variant={t.status === "aprobado" ? "default" : "secondary"} onClick={toggle} className="rounded-full h-8">
            <Check size={14} />
          </Button>
        )}
        <Button data-testid={`topic-write-${t.id}`} size="sm" variant="secondary" className="rounded-full h-8" onClick={() => nav(`/p/${project.id}/redactar?tema=${t.id}`)}><PenLine size={14} /></Button>
        <button onClick={() => api.delete(`/topics/${t.id}`).then(onChange)} className="text-slate-600 hover:text-rose-400 p-1"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

function ClusterMap({ pid }) {
  const [data, setData] = useState([]);
  const nav = useNavigate();
  useEffect(() => { api.get(`/projects/${pid}/clusters`).then((r) => setData(r.data)); }, [pid]);
  if (!data.length) return <Empty icon={Network} title="Sin clusters" desc="Genera el plan de 30 días para ver el mapa." />;
  const node = (n, pillar) => (
    <button key={n.id} onClick={() => n.article_id && nav(`/p/${pid}/articulos/${n.article_id}`)}
      className={`text-left rounded-lg px-3 py-2 text-sm border transition-colors ${pillar ? "border-indigo-500/50 bg-indigo-500/10" : n.article_status ? "border-emerald-500/30 bg-emerald-500/5" : "border-dashed border-slate-700 text-slate-400"}`}>
      <span className="line-clamp-2">{n.title}</span>
      <span className="block mt-1">{n.article_status ? <StatusBadge status={n.article_status} /> : <span className="text-[11px] text-amber-400">Hueco por cubrir</span>}</span>
    </button>
  );
  return (
    <div className="grid md:grid-cols-2 gap-5" data-testid="cluster-map">
      {data.map((c) => (
        <div key={c.name} className="panel p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-heading text-lg font-bold">{c.name}</p>
            <span className="text-xs text-slate-400">{c.gaps} huecos</span>
          </div>
          {c.pillar ? node(c.pillar, true) : <p className="text-xs text-amber-400 mb-2">Falta una página pilar en este cluster</p>}
          <div className="ml-4 pl-4 border-l border-slate-700 mt-3 grid gap-2">{c.satellites.map((n) => node(n, false))}</div>
        </div>
      ))}
    </div>
  );
}

export default function Plan() {
  const { project } = useProject();
  const [topics, setTopics] = useState([]);
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState("todas");
  const [newT, setNewT] = useState("");
  const load = () => api.get(`/projects/${project.id}/topics`).then((r) => setTopics(r.data));
  useEffect(() => { load(); }, [project.id]); // eslint-disable-line
  const run = async (path, label) => {
    setBusy(path);
    try { const { data } = await api.post(`/projects/${project.id}/${path}`); toast.success(`${data.length} temas ${label}`); load(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); }
  };
  const approveAll = async () => { await Promise.all(topics.filter((t) => t.status === "propuesto").map((t) => api.patch(`/topics/${t.id}`, { status: "aprobado" }))); load(); };
  const add = async () => { if (!newT) return; await api.post(`/projects/${project.id}/topics`, { title: newT, keyword: newT, intent: "media", day: topics.length + 1 }); setNewT(""); load(); };
  const shown = topics.filter((t) => filter === "todas" || t.intent === filter);

  return (
    <div>
      <PageHeader eyebrow="Estrategia" title="Plan de contenidos" desc="30 días priorizados por intención de compra. Aprueba los temas que quieras: el piloto automático solo redacta temas aprobados.">
        <Button data-testid="generate-comparisons-button" variant="secondary" disabled={!!busy} onClick={() => run("comparisons", "de comparación añadidos")} className="rounded-full">
          <Swords size={15} className="mr-1" /> {busy === "comparisons" ? "Generando…" : "Páginas de comparación"}
        </Button>
        <Button data-testid="generate-plan-button" disabled={!!busy} onClick={() => run("plan", "añadidos al plan")} className="rounded-full">
          <Sparkles size={15} className="mr-1" /> {busy === "plan" ? "Planificando…" : "Generar plan de 30 días"}
        </Button>
      </PageHeader>
      <Tabs defaultValue="calendario">
        <TabsList className="mb-5 bg-slate-900 border border-slate-800">
          <TabsTrigger value="calendario" data-testid="plan-tab-calendar"><CalendarRange size={14} className="mr-1.5" /> Calendario</TabsTrigger>
          <TabsTrigger value="clusters" data-testid="plan-tab-clusters"><Network size={14} className="mr-1.5" /> Mapa de clusters</TabsTrigger>
        </TabsList>
        <TabsContent value="calendario">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {["todas", "alta", "media", "informacional"].map((f) => (
              <button key={f} data-testid={`intent-filter-${f}`} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filter === f ? "bg-white text-black border-white" : "border-slate-700 text-slate-400 hover:text-white"}`}>
                {f === "todas" ? "Todas" : `Intención ${f}`}
              </button>
            ))}
            <span className="ml-auto" />
            {topics.some((t) => t.status === "propuesto") && <Button data-testid="approve-all-button" size="sm" variant="secondary" onClick={approveAll} className="rounded-full">Aprobar todos</Button>}
          </div>
          {!topics.length ? (
            <Empty icon={CalendarRange} title="Aún no hay plan" desc="Genera 30 temas basados en tu marca, catálogo y competidores, ordenados por intención de compra." />
          ) : (
            <div className="panel overflow-hidden">{shown.map((t) => <TopicRow key={t.id} t={t} onChange={load} />)}</div>
          )}
          <div className="flex gap-2 mt-4 max-w-xl">
            <Input data-testid="new-topic-input" placeholder="Añadir un tema a mano…" value={newT} onChange={(e) => setNewT(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <Button data-testid="new-topic-add" variant="secondary" onClick={add} className="rounded-full"><Plus size={15} /></Button>
          </div>
        </TabsContent>
        <TabsContent value="clusters"><ClusterMap pid={project.id} /></TabsContent>
      </Tabs>
    </div>
  );
}
