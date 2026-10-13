import { useState } from "react";
import { ShieldCheck, ShieldAlert, Image as ImageIcon, Repeat2, Link2, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScoreRing, BREAKDOWN_LABELS, CopyBox } from "@/components/common";
import { api, errMsg } from "@/lib/api";

function useAction() {
  const [busy, setBusy] = useState(false);
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  return [busy, run];
}

const Box = ({ title, icon: Icon, children, testid, right }) => (
  <div className="panel p-5" data-testid={testid}>
    <div className="flex items-center gap-2 mb-3">{Icon && <Icon size={16} className="text-emerald-400" />}<p className="font-heading font-semibold">{title}</p><span className="ml-auto">{right}</span></div>
    {children}
  </div>
);

export function ScorePanel({ a }) {
  const s = a.score || { total: 0, breakdown: {}, tips: [] };
  return (
    <Box title="Puntuación de calidad" testid="score-panel">
      <div className="flex gap-5 items-center">
        <ScoreRing value={s.total} />
        <div className="flex-1 space-y-1.5">
          {Object.entries(s.breakdown).map(([k, v]) => (
            <div key={k}>
              <div className="flex justify-between text-xs"><span className="text-slate-400">{BREAKDOWN_LABELS[k]}</span><span className="font-mono">{v}</span></div>
              <div className="h-1 rounded bg-slate-800 mt-0.5"><div className="h-1 rounded bg-emerald-500" style={{ width: `${v}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
      {!!s.tips?.length && <ul className="mt-4 space-y-1 text-xs text-slate-400 list-disc pl-4">{s.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
      <p className="text-[11px] text-slate-500 mt-3 font-mono">{s.words} palabras</p>
    </Box>
  );
}

export function SensitivePanel({ a }) {
  const s = a.sensitive || {};
  if (!s.is_sensitive) return null;
  return (
    <Box title={`Tema sensible: ${s.category}`} icon={AlertTriangle} testid="sensitive-panel">
      {s.disclaimer && <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded p-2 mb-2">Aviso añadido: {s.disclaimer}</p>}
      {!!s.risky_phrases?.length && <><p className="eyebrow mb-1">Frases arriesgadas</p><ul className="text-xs text-slate-300 space-y-1 list-disc pl-4">{s.risky_phrases.map((p) => <li key={p}>"{p}"</li>)}</ul></>}
    </Box>
  );
}

const FC = { con_fuente: ["Con fuente", "text-emerald-400"], sin_fuente: ["Sin fuente", "text-amber-400"], dudosa: ["Dudosa", "text-rose-400"] };

export function FactCheckPanel({ a, onChange }) {
  const [busy, run] = useAction();
  const flagged = (a.factcheck || []).filter((c) => c.status !== "con_fuente");
  return (
    <Box title="Verificación de datos" icon={a.factcheck && !flagged.length ? ShieldCheck : ShieldAlert} testid="factcheck-panel"
      right={<Button data-testid="factcheck-run-button" size="sm" variant="secondary" className="rounded-full h-7" disabled={busy}
        onClick={() => run(async () => { const { data } = await api.post(`/articles/${a.id}/factcheck`); toast.success(`${data.claims.length} afirmaciones revisadas`); onChange(); })}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : a.factcheck ? "Repetir" : "Verificar"}</Button>}>
      {!a.factcheck && <p className="text-xs text-slate-400">Comprueba cada cifra del artículo. Usa Perplexity (búsqueda en vivo) si tienes su clave.</p>}
      {a.factcheck && !a.factcheck.length && <p className="text-xs text-emerald-400">No hay afirmaciones con cifras.</p>}
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {(a.factcheck || []).map((c, i) => (
          <div key={i} className="text-xs border-b border-slate-800 pb-2">
            <span className={`font-semibold ${FC[c.status]?.[1]}`}>{FC[c.status]?.[0] || c.status}</span>
            <p className="text-slate-300 mt-0.5">{c.claim}</p>
            {c.note && <p className="text-slate-500 mt-0.5">{c.note}</p>}
            {c.source_url && <a href={c.source_url} target="_blank" rel="noreferrer" className="text-emerald-400 underline break-all">{c.source_url}</a>}
          </div>
        ))}
      </div>
      {!!flagged.length && (
        <label className="flex items-start gap-2 mt-3 text-xs text-slate-300 cursor-pointer">
          <Checkbox data-testid="facts-approve-checkbox" checked={!!a.facts_approved} onCheckedChange={(v) => api.patch(`/articles/${a.id}`, { facts_approved: !!v }).then(onChange)} />
          He revisado los {flagged.length} datos marcados y doy mi visto bueno para publicar.
        </label>
      )}
    </Box>
  );
}

function DeletableImage({ url, label, testid, onDelete, busy, className }) {
  return (
    <div className="relative group" data-testid={testid}>
      <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" className={className} /></a>
      {label && <span className="absolute left-1.5 top-1.5 text-[10px] font-semibold bg-black/70 text-white px-1.5 py-0.5 rounded">{label}</span>}
      <button type="button" data-testid={`${testid}-delete`} disabled={busy} onClick={onDelete} title="Eliminar imagen"
        className="absolute right-1.5 top-1.5 p-1.5 rounded-full bg-black/70 text-rose-300 hover:bg-rose-600 hover:text-white transition-colors">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export function ImagesPanel({ a, onChange }) {
  const [busy, run] = useAction();
  const gen = (kind) => run(async () => { await api.post(`/articles/${a.id}/image`, { kind }); toast.success("Imagen generada"); onChange(); });
  const del = (url, what) => {
    if (!window.confirm(`¿Eliminar ${what}? No se puede deshacer.`)) return;
    run(async () => { await api.post(`/articles/${a.id}/images/delete`, { url }); toast.success("Imagen eliminada"); onChange(); });
  };
  const others = (a.images || []).filter((i) => i.url !== a.cover_url);
  return (
    <Box title="Imágenes con IA" icon={ImageIcon} testid="images-panel">
      {a.cover_url && <div className="mb-3"><DeletableImage url={a.cover_url} label="Portada" testid="cover-image" busy={busy}
        onDelete={() => del(a.cover_url, "la portada")} className="rounded-lg aspect-video object-cover w-full" /></div>}
      {!!others.length && <div className="grid grid-cols-3 gap-2 mb-3">{others.map((i, n) => (
        <DeletableImage key={i.url} url={i.url} label={i.kind === "cover" ? "Portada antigua" : "Infografía"} testid={`image-${n}`} busy={busy}
          onDelete={() => del(i.url, i.kind === "cover" ? "esta portada antigua" : "esta infografía")} className="rounded aspect-square object-cover w-full" />
      ))}</div>}
      <div className="flex gap-2">
        <Button data-testid="generate-cover-button" size="sm" variant="secondary" className="rounded-full flex-1" disabled={busy} onClick={() => gen("cover")}>{busy ? "Generando…" : "Portada"}</Button>
        <Button data-testid="generate-infographic-button" size="sm" variant="secondary" className="rounded-full flex-1" disabled={busy} onClick={() => gen("infographic")}>Infografía</Button>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Usa tu clave de OpenAI (GPT Image) o, si no, Gemini.</p>
    </Box>
  );
}

const RP = [["newsletter", "Email newsletter"], ["linkedin", "Post de LinkedIn"], ["x_thread", "Hilo de X"], ["video_script", "Guion vídeo corto"], ["google_business", "Google Business"]];

export function RepurposePanel({ a, onChange }) {
  const [busy, run] = useAction();
  const r = a.repurposed;
  return (
    <Box title="Reutilizar en otros formatos" icon={Repeat2} testid="repurpose-panel"
      right={<Button data-testid="repurpose-button" size="sm" variant="secondary" className="rounded-full h-7" disabled={busy}
        onClick={() => run(async () => { await api.post(`/articles/${a.id}/repurpose`); onChange(); toast.success("Formatos generados"); })}>{busy ? <Loader2 size={13} className="animate-spin" /> : r ? "Regenerar" : "Generar"}</Button>}>
      {!r && <p className="text-xs text-slate-400">Newsletter, LinkedIn, hilo de X, guion de vídeo y post de Google Business, listos para copiar.</p>}
      {r && <div className="space-y-3 max-h-96 overflow-y-auto">{RP.map(([k, l]) => r[k] && <CopyBox key={k} label={l} testid={`copy-${k}`} value={Array.isArray(r[k]) ? r[k].map((t, i) => `${i + 1}/ ${t}`).join("\n\n") : r[k]} />)}</div>}
    </Box>
  );
}

export function LinksPanel({ a }) {
  const [data, setData] = useState(null);
  const [busy, run] = useAction();
  const load = () => run(async () => setData((await api.get(`/articles/${a.id}/link-suggestions`)).data));
  const apply = (s) => run(async () => { await api.post(`/articles/${a.id}/apply-link`, s); toast.success(`Enlace añadido en «${s.source_title}»`); setData({ ...data, suggestions: data.suggestions.filter((x) => x !== s) }); });
  return (
    <Box title="Enlazado interno retroactivo" icon={Link2} testid="links-panel"
      right={<Button data-testid="link-suggestions-button" size="sm" variant="secondary" className="rounded-full h-7" disabled={busy} onClick={load}>Buscar</Button>}>
      <p className="text-xs text-slate-400 mb-2">Enlaces desde tus artículos antiguos hacia este, aplicables con un clic.</p>
      {data && !data.suggestions.length && <p className="text-xs text-slate-500">No hay oportunidades nuevas.</p>}
      {data?.suggestions.map((s) => (
        <div key={s.source_id} className="text-xs border-b border-slate-800 py-2">
          <p className="font-semibold text-slate-200">{s.source_title}</p>
          <p className="text-slate-500 mt-0.5">…{s.snippet}…</p>
          <Button data-testid={`apply-link-${s.source_id}`} size="sm" className="rounded-full h-6 mt-1.5 text-[11px]" onClick={() => apply(s)}>Enlazar «{s.anchor}»</Button>
        </div>
      ))}
    </Box>
  );
}
