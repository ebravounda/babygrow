import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";

const LABEL = { imported: "Importado", exists: "Ya existía", needs_content: "Falta el texto", error: "Error" };

function ResultRow({ r, i, paste, setPaste }) {
  return (
    <div className="border border-slate-800 rounded-lg p-3 space-y-2" data-testid={`import-result-${i}`}>
      <div className="flex justify-between gap-3 text-sm">
        <span className="font-mono truncate text-slate-300">{r.url}</span>
        <span className={r.status === "imported" ? "text-emerald-400" : r.status === "needs_content" ? "text-amber-400" : "text-slate-400"}>{LABEL[r.status]}</span>
      </div>
      {(r.error || r.publish_error) && <p className="text-xs text-slate-500">{r.error || r.publish_error}</p>}
      {r.status === "needs_content" && (
        <div className="space-y-2">
          <Input data-testid={`import-paste-title-${i}`} placeholder="Título del artículo" value={paste[r.url]?.title ?? r.title ?? ""}
            onChange={(e) => setPaste({ ...paste, [r.url]: { ...paste[r.url], title: e.target.value } })} />
          <Textarea data-testid={`import-paste-content-${i}`} rows={5} placeholder="Pega aquí el texto completo del artículo (vale texto plano o Markdown)"
            value={paste[r.url]?.content || ""} onChange={(e) => setPaste({ ...paste, [r.url]: { ...paste[r.url], content: e.target.value } })} />
        </div>
      )}
    </div>
  );
}

export function ImportDialog({ project, onDone }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(`${(project.url || "").replace(/\/$/, "")}/sitemap.xml`);
  const [found, setFound] = useState([]);
  const [sel, setSel] = useState({});
  const [results, setResults] = useState([]);
  const [paste, setPaste] = useState({});
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);

  const scan = async () => {
    setBusy(true); setResults([]);
    try {
      const { data } = await api.post(`/projects/${project.id}/import/scan`, { url });
      setFound(data); setSel(Object.fromEntries(data.filter((d) => !d.exists).map((d) => [d.url, true])));
      if (!data.length) toast.info("No se encontraron artículos en esa dirección");
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const run = async (items) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/projects/${project.id}/import`, { items, publish, covers: true });
      setResults(data.results);
      const n = data.results.filter((r) => r.status === "imported").length;
      toast.success(`${n} artículo(s) importado(s)${data.covers_started ? " · creando portadas" : ""}`);
      onDone?.();
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const importSelected = () => run(found.filter((f) => sel[f.url]).map((f) => ({ url: f.url })));
  const pending = results.filter((r) => r.status === "needs_content" && paste[r.url]?.content?.trim());
  const importPasted = () => run(pending.map((r) => ({ url: r.url, title: paste[r.url]?.title ?? r.title ?? "", content: paste[r.url].content })));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="library-import-button" variant="outline" className="rounded-full"><Download size={15} className="mr-1" /> Importar artículos</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="import-dialog">
        <DialogHeader><DialogTitle>Importar artículos que ya tienes</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-400">Pon el sitemap o la página del blog de tu web. Los artículos se importan «Por revisar», con la misma URL (slug), y se les crea portada con IA.</p>
        <div className="flex gap-2">
          <Input data-testid="import-url-input" className="font-mono" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button data-testid="import-scan-button" onClick={scan} disabled={busy} className="rounded-full">{busy ? <Loader2 size={15} className="animate-spin" /> : "Buscar"}</Button>
        </div>
        {!!found.length && !results.length && (
          <div className="space-y-2">
            {found.map((f, i) => (
              <label key={f.url} className="flex items-center gap-3 text-sm" data-testid={`import-found-${i}`}>
                <Checkbox checked={!!sel[f.url]} disabled={f.exists} onCheckedChange={(v) => setSel({ ...sel, [f.url]: !!v })} />
                <span className="font-mono truncate">{f.url}</span>{f.exists && <span className="text-xs text-slate-500">ya está</span>}
              </label>
            ))}
            <label className="flex items-center gap-3 text-sm pt-2"><Checkbox data-testid="import-publish-checkbox" checked={publish} onCheckedChange={(v) => setPublish(!!v)} /> Publicar directamente (si no, quedan «Por revisar»)</label>
            <Button data-testid="import-run-button" onClick={importSelected} disabled={busy || !Object.values(sel).some(Boolean)} className="rounded-full">Importar seleccionados</Button>
          </div>
        )}
        {!!results.length && (
          <div className="space-y-2">
            {results.map((r, i) => <ResultRow key={r.url} r={r} i={i} paste={paste} setPaste={setPaste} />)}
            {results.some((r) => r.status === "needs_content") && (
              <Button data-testid="import-pasted-button" onClick={importPasted} disabled={busy || !pending.length} className="rounded-full">Importar los textos pegados</Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
