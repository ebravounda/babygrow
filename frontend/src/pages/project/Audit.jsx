import { useState } from "react";
import { Stethoscope, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader, Empty, ScoreRing } from "@/components/common";
import { useProject } from "./ProjectLayout";
import { api, errMsg } from "@/lib/api";

const PRIO = { alta: "bg-rose-500/15 text-rose-400", media: "bg-amber-500/15 text-amber-400", baja: "bg-slate-700/60 text-slate-300" };

export default function Audit() {
  const { project } = useProject();
  const [r, setR] = useState(project.last_audit || null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { const { data } = await api.post(`/projects/${project.id}/audit`); setR(data); toast.success("Auditoría completada"); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div>
      <PageHeader eyebrow="Salud técnica" title="Auditoría del sitio" desc="Metadatos, títulos, datos estructurados, enlaces rotos, velocidad básica, robots.txt, sitemap y llms.txt, con arreglos priorizados.">
        <Button data-testid="audit-run-button" onClick={run} disabled={busy} className="rounded-full">{busy ? <><Loader2 size={15} className="animate-spin mr-1" /> Auditando…</> : <><Stethoscope size={15} className="mr-1" /> Auditar ahora</>}</Button>
      </PageHeader>
      {!r ? <Empty icon={Stethoscope} title="Sin auditoría" desc={`Analizaremos ${project.url}.`} /> : (
        <div className="grid lg:grid-cols-[300px_1fr] gap-6">
          <div className="panel p-6 h-fit space-y-4" data-testid="audit-summary">
            <div className="flex items-center gap-4"><ScoreRing value={r.score} size={96} /><div><p className="eyebrow">Puntuación</p><p className="text-xs text-slate-500 mt-1">{r.created_at.slice(0, 16).replace("T", " ")}</p></div></div>
            {[["Respuesta", `${r.ttfb_ms} ms`], ["Peso HTML", `${r.size_kb} KB`], ["Enlaces revisados", r.checked_links], ["Enlaces rotos", r.broken_links.length], ["Bloques JSON-LD", r.jsonld_count], ["robots.txt", r.robots ? "Sí" : "No"]].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm border-b border-slate-800 pb-2"><span className="text-slate-400">{k}</span><span className="font-mono">{v}</span></div>
            ))}
          </div>
          <div className="panel overflow-hidden" data-testid="audit-issues">
            {!r.issues.length && <p className="p-6 text-emerald-400">Todo en orden. Sin problemas detectados.</p>}
            {r.issues.map((i, n) => (
              <div key={n} className="grid grid-cols-[70px_130px_1fr] gap-4 px-5 py-4 border-b border-slate-800/70 items-start">
                <span className={`text-[11px] font-bold uppercase px-2 py-1 rounded text-center ${PRIO[i.priority]}`}>{i.priority}</span>
                <span className="text-xs text-slate-400 pt-1">{i.area}</span>
                <div><p className="text-sm font-semibold break-words">{i.issue}</p><p className="text-sm text-slate-400 mt-0.5">{i.fix}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
