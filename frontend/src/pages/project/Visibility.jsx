import { useEffect, useState } from "react";
import { Radar, Play, Trash2, Plus, Loader2 } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, Empty } from "@/components/common";
import { useProject } from "./ProjectLayout";
import { api, errMsg } from "@/lib/api";

export default function Visibility() {
  const { project } = useProject();
  const [prompts, setPrompts] = useState([]);
  const [d, setD] = useState(null);
  const [text, setText] = useState("");
  const [freq, setFreq] = useState("weekly");
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState(null);
  const load = () => {
    api.get(`/projects/${project.id}/prompts`).then((r) => setPrompts(r.data));
    api.get(`/projects/${project.id}/visibility`).then((r) => setD(r.data));
  };
  useEffect(() => { load(); }, [project.id]); // eslint-disable-line
  const add = async () => { if (!text) return; await api.post(`/projects/${project.id}/prompts`, { text, frequency: freq }); setText(""); load(); };
  const run = async (prompt_id) => {
    setBusy(prompt_id || "all");
    try { const { data } = await api.post(`/projects/${project.id}/visibility/run`, prompt_id ? { prompt_id } : {}); toast.success(`${data.results.length} respuestas analizadas`); load(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); }
  };
  const brand = project.brand?.brand_name || project.name;

  return (
    <div>
      <PageHeader eyebrow="AEO" title="Visibilidad en IA" desc={`Lanza preguntas tipo «mejor X en Y» a GPT, Claude, Gemini y Perplexity, y mide si mencionan a ${brand}, en qué posición y qué competidores aparecen.`}>
        <Button data-testid="visibility-run-all" disabled={!!busy || !prompts.length} onClick={() => run()} className="rounded-full">
          {busy === "all" ? <Loader2 size={15} className="animate-spin mr-1" /> : <Play size={15} className="mr-1" />} Lanzar todas ahora
        </Button>
      </PageHeader>
      <div className="grid xl:grid-cols-[1fr_1.3fr] gap-6">
        <div className="space-y-5">
          <div className="panel p-5">
            <p className="eyebrow mb-3">Preguntas que sigues</p>
            <div className="flex gap-2 mb-4">
              <Input data-testid="prompt-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={`¿Cuál es el mejor ${project.niche || "servicio"} en ${project.country}?`} onKeyDown={(e) => e.key === "Enter" && add()} />
              <Select value={freq} onValueChange={setFreq}><SelectTrigger className="w-[120px]" data-testid="prompt-frequency"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="daily">Diaria</SelectItem><SelectItem value="weekly">Semanal</SelectItem></SelectContent></Select>
              <Button data-testid="prompt-add" variant="secondary" onClick={add} className="rounded-full"><Plus size={15} /></Button>
            </div>
            {prompts.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-2.5 border-b border-slate-800 text-sm" data-testid={`prompt-row-${p.id}`}>
                <span className="flex-1">{p.text}</span>
                <span className="text-[11px] text-slate-500">{p.frequency === "daily" ? "diaria" : "semanal"}</span>
                <button data-testid={`prompt-run-${p.id}`} onClick={() => run(p.id)} className="text-slate-400 hover:text-emerald-400 p-1">{busy === p.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}</button>
                <button onClick={() => api.delete(`/prompts/${p.id}`).then(load)} className="text-slate-600 hover:text-rose-400 p-1"><Trash2 size={14} /></button>
              </div>
            ))}
            {!prompts.length && <p className="text-sm text-slate-500">Añade 3-10 preguntas que haría tu cliente ideal.</p>}
          </div>
          {d?.competitors?.length > 0 && (
            <div className="panel p-5" data-testid="visibility-competitors"><p className="eyebrow mb-3">Competidores mencionados</p>
              {d.competitors.map((c) => <div key={c.name} className="flex justify-between text-sm py-1"><span>{c.name}</span><span className="font-mono text-slate-400">{c.count}</span></div>)}</div>
          )}
        </div>
        <div className="space-y-5">
          {!d?.summary?.length ? <Empty icon={Radar} title="Sin mediciones" desc="Añade preguntas y lánzalas. Se repetirán solas según su frecuencia." /> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="visibility-summary">
                {d.summary.map((s) => (
                  <div key={s.provider} className="panel p-4"><p className="eyebrow">{s.label}</p><p className="font-heading text-3xl font-extrabold mt-1">{s.rate}%</p>
                    <p className="text-xs text-slate-500">{s.mentions}/{s.runs} menciones{s.avg_position ? ` · pos. ${s.avg_position}` : ""}</p></div>
                ))}
              </div>
              <div className="panel p-5 h-[220px]">
                <ResponsiveContainer><LineChart data={d.timeline}><CartesianGrid stroke="#1f2937" vertical={false} /><XAxis dataKey="date" stroke="#6b7280" fontSize={11} tickFormatter={(v) => v.slice(5)} />
                  <YAxis stroke="#6b7280" fontSize={11} width={34} unit="%" /><Tooltip contentStyle={{ background: "#111827", border: "1px solid #1f2937" }} />
                  <Line dataKey="rate" name="% menciones" stroke="#10B981" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer>
              </div>
              <div className="panel overflow-hidden" data-testid="visibility-latest">
                {d.latest.map((r) => (
                  <div key={r.id} className="border-b border-slate-800/70">
                    <button onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full text-left grid grid-cols-[90px_1fr_110px] gap-3 px-5 py-3 text-sm hover:bg-slate-900/60">
                      <span className="font-mono text-xs text-slate-400">{r.provider}</span><span className="truncate">{r.prompt}</span>
                      <span className={r.error ? "text-rose-400 text-xs" : r.mentioned ? "text-emerald-400 font-semibold" : "text-slate-500"}>{r.error ? "error" : r.mentioned ? `Mencionado${r.position ? ` #${r.position}` : ""}` : "No aparece"}</span>
                    </button>
                    {open === r.id && <div className="px-5 pb-4 text-xs text-slate-400 whitespace-pre-wrap max-h-64 overflow-y-auto">{r.error || r.answer}</div>}
                  </div>
                ))}
              </div>
            </>
          )}
          <p className="text-xs text-slate-500">Se mide lo que responden los modelos por API; puede diferir de la app de ChatGPT. Perplexity (con búsqueda en vivo) es la referencia más cercana.</p>
        </div>
      </div>
    </div>
  );
}
