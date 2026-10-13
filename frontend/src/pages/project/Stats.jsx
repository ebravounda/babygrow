import { useEffect, useState } from "react";
import { Eye, MousePointerClick, Percent, Inbox, Mail } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, Empty } from "@/components/common";
import { useProject } from "./ProjectLayout";
import { api } from "@/lib/api";

const Stat = ({ icon: Icon, label, value, testid }) => (
  <div className="panel p-5" data-testid={testid}><div className="flex items-center gap-2 text-slate-400"><Icon size={15} /><span className="eyebrow">{label}</span></div><p className="font-heading text-3xl font-extrabold mt-2">{value}</p></div>
);

function Leads({ pid }) {
  const [leads, setLeads] = useState([]);
  const load = () => api.get(`/projects/${pid}/leads`).then((r) => setLeads(r.data));
  useEffect(() => { load(); }, [pid]); // eslint-disable-line
  if (!leads.length) return <Empty icon={Inbox} title="Bandeja vacía" desc="Los contactos del formulario del widget aparecerán aquí y te llegará un aviso por email (si configuraste Resend)." />;
  return (
    <div className="panel overflow-hidden" data-testid="leads-inbox">
      {leads.map((l) => (
        <div key={l.id} className="grid grid-cols-[1fr_1.5fr_auto] gap-4 px-5 py-4 border-b border-slate-800/70 items-start">
          <div><p className="font-semibold">{l.name || "Sin nombre"}</p><a href={`mailto:${l.email}`} className="text-sm text-emerald-400 font-mono">{l.email}</a>
            <p className="text-[11px] text-slate-500 mt-1 font-mono">{l.created_at.slice(0, 16).replace("T", " ")}</p></div>
          <div><p className="text-sm text-slate-300">{l.message || "—"}</p>{l.article_title && <p className="text-xs text-slate-500 mt-1">Desde: {l.article_title}</p>}</div>
          <div className="flex flex-col items-end gap-2">
            <button data-testid={`lead-status-${l.id}`} onClick={() => api.patch(`/leads/${l.id}`, { status: l.status === "nuevo" ? "contactado" : "nuevo" }).then(load)}
              className={`text-xs px-2 py-1 rounded-md font-semibold ${l.status === "nuevo" ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"}`}>{l.status}</button>
            <span className="text-[11px] text-slate-500 flex items-center gap-1"><Mail size={11} /> {l.email_status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Stats() {
  const { project } = useProject();
  const [d, setD] = useState(null);
  useEffect(() => { api.get(`/projects/${project.id}/stats`).then((r) => setD(r.data)); }, [project.id]);
  if (!d) return <p className="text-slate-400">Cargando…</p>;
  return (
    <div>
      <PageHeader eyebrow="Últimos 30 días" title="Resultados" desc="Visitas a tus artículos, clics en cajas de producto y llamadas a la acción, y contactos captados. Los enlaces llevan UTM para Google Analytics." />
      <Tabs defaultValue="stats">
        <TabsList className="mb-6 bg-slate-900 border border-slate-800">
          <TabsTrigger value="stats" data-testid="stats-tab-metrics">Métricas</TabsTrigger>
          <TabsTrigger value="leads" data-testid="stats-tab-leads">Contactos</TabsTrigger>
        </TabsList>
        <TabsContent value="stats">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat icon={Eye} label="Lecturas" value={d.totals.views} testid="stat-views" />
            <Stat icon={MousePointerClick} label="Clics producto + CTA" value={d.totals.clicks} testid="stat-clicks" />
            <Stat icon={Percent} label="Tasa de clic" value={`${d.totals.ctr}%`} testid="stat-ctr" />
            <Stat icon={Inbox} label="Contactos" value={d.totals.leads} testid="stat-leads" />
          </div>
          <div className="panel p-5 h-[280px] mb-6">
            <ResponsiveContainer>
              <AreaChart data={d.series}>
                <CartesianGrid stroke="#1f2937" vertical={false} />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={11} tickFormatter={(v) => v.slice(5)} />
                <YAxis stroke="#6b7280" fontSize={11} width={30} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #1f2937" }} />
                <Area dataKey="view" name="Lecturas" stroke="#10B981" fill="#10B98122" />
                <Area dataKey="product_click" name="Clics producto" stroke="#6366F1" fill="#6366F122" />
                <Area dataKey="lead" name="Contactos" stroke="#F59E0B" fill="#F59E0B22" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="panel overflow-hidden" data-testid="stats-articles-table">
            <div className="grid grid-cols-[1fr_80px_80px_80px_80px] gap-3 px-5 py-3 border-b border-slate-800 eyebrow"><span>Artículo</span><span>Lecturas</span><span>Clics</span><span>CTR</span><span>Contactos</span></div>
            {!d.articles.length && <p className="p-5 text-sm text-slate-500">Aún no hay datos. Pega el widget en tu web y publica artículos.</p>}
            {d.articles.map((r) => (
              <div key={r.article_id} className="grid grid-cols-[1fr_80px_80px_80px_80px] gap-3 px-5 py-3 border-b border-slate-800/70 text-sm">
                <span className="truncate">{r.title}</span><span className="font-mono">{r.view}</span><span className="font-mono">{r.clicks}</span><span className="font-mono text-emerald-400">{r.ctr}%</span><span className="font-mono">{r.lead}</span>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="leads"><Leads pid={project.id} /></TabsContent>
      </Tabs>
    </div>
  );
}
