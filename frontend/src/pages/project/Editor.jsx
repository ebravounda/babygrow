import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Save, Send, CalendarClock, Undo2, Trash2, RefreshCw, ExternalLink, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/common";
import { ScorePanel, SensitivePanel, FactCheckPanel, ImagesPanel, RepurposePanel, LinksPanel } from "./EditorPanels";
import { useProject } from "./ProjectLayout";
import { api, errMsg } from "@/lib/api";

function Regenerate({ a, onDone }) {
  const [heading, setHeading] = useState(null);
  const [ins, setIns] = useState("");
  const [busy, setBusy] = useState(false);
  const h2 = (a.content.match(/^## (.+)$/gm) || []).map((h) => h.slice(3));
  const go = async () => {
    setBusy(true);
    try { const { data } = await api.post(`/articles/${a.id}/regenerate-section`, { heading, instructions: ins }); onDone(data); setHeading(null); setIns(""); toast.success("Sección regenerada"); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="panel p-5" data-testid="regenerate-panel">
      <p className="font-heading font-semibold mb-2">Regenerar una sección</p>
      <div className="flex flex-wrap gap-1.5">{h2.map((h) => <button key={h} data-testid={`regen-${h.slice(0, 20)}`} onClick={() => setHeading(h)} className="text-xs px-2.5 py-1 rounded-full border border-slate-700 text-slate-300 hover:border-emerald-500 hover:text-white transition-colors"><RefreshCw size={11} className="inline mr-1" />{h}</button>)}</div>
      <Dialog open={!!heading} onOpenChange={(o) => !o && setHeading(null)}>
        <DialogContent className="bg-[#111827] border-slate-800">
          <DialogHeader><DialogTitle>Regenerar «{heading}»</DialogTitle></DialogHeader>
          <Textarea data-testid="regen-instructions" value={ins} onChange={(e) => setIns(e.target.value)} placeholder="Instrucciones opcionales: más concreto, añade un ejemplo, tono más cercano…" />
          <Button data-testid="regen-submit" onClick={go} disabled={busy} className="rounded-full">{busy ? "Regenerando…" : "Regenerar sección"}</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Editor() {
  const { aid } = useParams();
  const { project } = useProject();
  const nav = useNavigate();
  const [a, setA] = useState(null);
  const [authors, setAuthors] = useState([]);
  const [when, setWhen] = useState("");
  const load = useCallback(() => api.get(`/articles/${aid}`).then((r) => setA(r.data)), [aid]);
  useEffect(() => { load(); api.get(`/projects/${project.id}/authors`).then((r) => setAuthors(r.data)); }, [load, project.id]);
  if (!a) return <p className="text-slate-400">Cargando artículo…</p>;
  const set = (k) => (e) => setA({ ...a, [k]: e?.target ? e.target.value : e });

  const act = async (fn, ok) => { try { const r = await fn(); if (r?.data?.id) setA((cur) => ({ ...cur, ...r.data })); await load(); ok && toast.success(ok); } catch (e) { toast.error(errMsg(e)); } };
  const save = () => act(() => api.patch(`/articles/${aid}`, { title: a.title, content: a.content, meta_title: a.meta_title, meta_description: a.meta_description, slug: a.slug, author_id: a.author_id }), "Guardado");
  const publish = () => act(async () => { const r = await api.post(`/articles/${aid}/publish`); (r.data.publish_errors || []).forEach((e) => toast.error(e)); return r; }, "Publicado");
  const schedule = () => when && act(() => api.post(`/articles/${aid}/schedule`, { publish_at: new Date(when).toISOString() }), "Programado");

  return (
    <div>
      <button onClick={() => nav(`/p/${project.id}/articulos`)} className="text-sm text-slate-400 hover:text-white flex items-center gap-1 mb-4" data-testid="editor-back"><ArrowLeft size={14} /> Artículos</button>
      <div className="flex flex-wrap items-start gap-4 mb-6">
        <div className="basis-full">
          <div className="flex items-center gap-2 mb-2"><StatusBadge status={a.status} />{a.publish_at && a.status === "scheduled" && <span className="text-xs font-mono text-indigo-300">{new Date(a.publish_at).toLocaleString()}</span>}</div>
          <input data-testid="editor-title-input" value={a.title} onChange={set("title")} className="w-full bg-transparent font-editorial text-3xl sm:text-4xl text-white outline-none" />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Button data-testid="editor-save-button" variant="secondary" onClick={save} className="rounded-full"><Save size={15} className="mr-1" /> Guardar</Button>
          {a.status === "published" ? (
            <>
              <a href={a.url} target="_blank" rel="noreferrer"><Button variant="secondary" className="rounded-full" data-testid="editor-view-live"><ExternalLink size={15} className="mr-1" /> Ver</Button></a>
              <Button data-testid="editor-unpublish-button" variant="secondary" onClick={() => act(() => api.post(`/articles/${aid}/unpublish`), "Despublicado")} className="rounded-full"><Undo2 size={15} className="mr-1" /> Despublicar</Button>
            </>
          ) : (
            <>
              <Input data-testid="editor-schedule-input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-[200px]" />
              <Button data-testid="editor-schedule-button" variant="secondary" onClick={schedule} className="rounded-full"><CalendarClock size={15} className="mr-1" /> Programar</Button>
              <Button data-testid="editor-publish-button" onClick={publish} className="rounded-full"><Send size={15} className="mr-1" /> Publicar ahora</Button>
            </>
          )}
          <Button data-testid="editor-delete-button" variant="ghost" onClick={() => window.confirm("¿Eliminar este artículo?") && api.delete(`/articles/${aid}`).then(() => nav(`/p/${project.id}/articulos`))} className="text-slate-500 hover:text-rose-400"><Trash2 size={15} /></Button>
        </div>
      </div>
      {!!a.publish_errors?.length && <div className="panel border-rose-500/40 p-3 mb-5 text-sm text-rose-300" data-testid="publish-errors">{a.publish_errors.join(" · ")}</div>}
      <div className="grid xl:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-5 min-w-0">
          <div className="panel p-5 grid md:grid-cols-2 gap-4">
            <div><label className="eyebrow flex justify-between mb-1.5">Meta título <span className={a.meta_title?.length > 60 ? "text-rose-400" : ""}>{a.meta_title?.length || 0}/60</span></label><Input data-testid="editor-meta-title" value={a.meta_title || ""} onChange={set("meta_title")} /></div>
            <div><label className="eyebrow block mb-1.5">URL corta</label><Input data-testid="editor-slug" className="font-mono" value={a.slug || ""} onChange={set("slug")} /></div>
            <div className="md:col-span-2"><label className="eyebrow flex justify-between mb-1.5">Meta descripción <span>{a.meta_description?.length || 0}/155</span></label><Textarea data-testid="editor-meta-description" rows={2} value={a.meta_description || ""} onChange={set("meta_description")} /></div>
            <div><label className="eyebrow block mb-1.5">Autor</label>
              <Select value={a.author_id || ""} onValueChange={set("author_id")}>
                <SelectTrigger data-testid="editor-author-select"><SelectValue placeholder="Sin autor" /></SelectTrigger>
                <SelectContent>{authors.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
              </Select></div>
            <div><label className="eyebrow block mb-1.5">Palabra clave</label><p className="font-mono text-sm text-slate-300 pt-2">{a.keyword}</p></div>
          </div>
          <Tabs defaultValue="preview">
            <TabsList className="bg-slate-900 border border-slate-800">
              <TabsTrigger value="preview" data-testid="editor-tab-preview">Vista previa</TabsTrigger>
              <TabsTrigger value="edit" data-testid="editor-tab-edit">Editar Markdown</TabsTrigger>
              <TabsTrigger value="schema" data-testid="editor-tab-schema">FAQ y datos estructurados</TabsTrigger>
            </TabsList>
            <TabsContent value="preview">
              <div className="panel p-8 md:p-12"><h1 className="font-editorial text-4xl text-white mb-6">{a.title}</h1>
                <div className="prose-news max-w-3xl" data-testid="editor-preview" dangerouslySetInnerHTML={{ __html: a.html }} /></div>
            </TabsContent>
            <TabsContent value="edit">
              <Textarea data-testid="editor-content-textarea" value={a.content} onChange={set("content")} className="font-mono text-[13px] leading-relaxed min-h-[70vh] bg-[#070a10]" />
              <p className="text-xs text-slate-500 mt-2">Marcadores: <span className="marker-chip">[[PRODUCTO: Nombre]]</span> caja de producto · <span className="marker-chip">[[CTA]]</span> llamada a la acción.</p>
            </TabsContent>
            <TabsContent value="schema">
              <div className="panel p-6 space-y-4">
                <div><p className="eyebrow mb-2">Puntos clave</p><ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">{(a.key_points || []).map((k) => <li key={k}>{k}</li>)}</ul></div>
                <div><p className="eyebrow mb-2">Preguntas frecuentes ({a.faq?.length || 0})</p>{(a.faq || []).map((f) => <div key={f.q} className="mb-2"><p className="font-semibold text-sm">{f.q}</p><p className="text-sm text-slate-400">{f.a}</p></div>)}</div>
                <p className="text-xs text-slate-500">El JSON-LD (BlogPosting + FAQPage + autor) se genera automáticamente al publicar y en el widget.</p>
              </div>
            </TabsContent>
          </Tabs>
          <Regenerate a={a} onDone={setA} />
        </div>
        <div className="space-y-5">
          <ScorePanel a={a} />
          <SensitivePanel a={a} />
          <FactCheckPanel a={a} onChange={load} />
          <LinksPanel a={a} />
          <ImagesPanel a={a} onChange={load} />
          <RepurposePanel a={a} onChange={load} />
        </div>
      </div>
    </div>
  );
}
