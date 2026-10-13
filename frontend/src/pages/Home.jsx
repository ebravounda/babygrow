import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Globe, ArrowUpRight, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, Empty } from "@/components/common";
import { useProjects } from "@/components/Layout";
import { api, errMsg } from "@/lib/api";

const EMPTY = { name: "", url: "", niche: "", country: "España", language: "español", lang_code: "es", audience: "", competitors: "", llm_provider: "anthropic" };

function NewProject({ open, onOpenChange }) {
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const { reload } = useProjects();
  const nav = useNavigate();
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const { data } = await api.post("/projects", { ...f, competitors: f.competitors.split(",").map((s) => s.trim()).filter(Boolean) });
      await reload(); onOpenChange(false); setF(EMPTY);
      toast.success("Proyecto creado. Analiza la marca para empezar.");
      nav(`/p/${data.id}/marca?analizar=1`);
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  const field = (k, label, ph, req) => (
    <div><label className="eyebrow">{label}</label><Input data-testid={`new-project-${k}`} className="mt-1.5" value={f[k]} onChange={set(k)} placeholder={ph} required={req} /></div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-[#111827] border-slate-800" data-testid="new-project-dialog">
        <DialogHeader><DialogTitle className="font-heading text-2xl">Nuevo proyecto</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">{field("url", "URL del sitio", "misitio.com", true)}</div>
          {field("name", "Nombre", "Mi tienda", true)}
          {field("niche", "Nicho", "cosmética natural")}
          {field("country", "País", "España")}
          {field("language", "Idioma", "español")}
          <div className="col-span-2">{field("audience", "Audiencia", "mujeres 25-45 que buscan…")}</div>
          <div className="col-span-2">{field("competitors", "Competidores (separados por comas)", "competidor1.com, competidor2.com")}</div>
          <div className="col-span-2">
            <label className="eyebrow">IA del proyecto</label>
            <Select value={f.llm_provider} onValueChange={set("llm_provider")}>
              <SelectTrigger data-testid="new-project-llm" className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="anthropic">Claude Sonnet 5.5 (Anthropic)</SelectItem>
                <SelectItem value="openai">GPT-5.6 Terra (OpenAI)</SelectItem>
                <SelectItem value="gemini">Gemini 3.1 Pro (Google)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button data-testid="new-project-submit" disabled={busy} className="col-span-2 rounded-full h-11">{busy ? "Creando…" : "Crear proyecto"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Home() {
  const { projects } = useProjects();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState(null);
  const nav = useNavigate();
  useEffect(() => { if (params.get("nuevo")) { setOpen(true); setParams({}); } }, [params, setParams]);
  useEffect(() => { api.get("/keys").then((r) => setKeys(r.data.filter((k) => k.configured).length)); }, []);

  return (
    <div className="p-6 md:p-10 max-w-[1400px]">
      <PageHeader eyebrow="Sala de redacción" title="Tus sitios" desc="Cada proyecto es un sitio web: su marca, su plan de contenidos, sus artículos y sus resultados.">
        <Button data-testid="new-project-button" onClick={() => setOpen(true)} className="rounded-full"><Plus size={16} className="mr-1" /> Nuevo proyecto</Button>
      </PageHeader>
      {keys === 0 && (
        <button data-testid="keys-warning" onClick={() => nav("/ajustes")} className="w-full mb-8 panel p-5 flex items-center gap-4 text-left border-amber-500/30 hover:border-amber-500/60 transition-colors">
          <KeyRound className="text-amber-400" />
          <div><p className="font-semibold">Primero, añade tus claves</p><p className="text-sm text-slate-400">La herramienta funciona solo con tus propias claves de IA. Pégalas y pruébalas en Ajustes.</p></div>
          <ArrowUpRight className="ml-auto text-slate-500" />
        </button>
      )}
      {!projects.length ? (
        <Empty icon={Globe} title="Crea tu primer proyecto" desc="Pega la URL de tu web: analizamos tu oferta, tono y público automáticamente.">
          <Button onClick={() => setOpen(true)} className="rounded-full">Crear proyecto</Button>
        </Empty>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {projects.map((p, i) => (
            <button key={p.id} data-testid={`project-card-${p.id}`} onClick={() => nav(`/p/${p.id}`)} style={{ animationDelay: `${i * 60}ms` }}
              className="fade-up panel p-6 text-left hover:border-emerald-500/40 transition-colors group">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-heading text-xl font-bold">{p.name}</p>
                  <p className="text-sm text-slate-500 font-mono mt-1 truncate max-w-[260px]">{p.url.replace(/^https?:\/\//, "")}</p>
                </div>
                <ArrowUpRight className="text-slate-600 group-hover:text-emerald-400 transition-colors" />
              </div>
              <p className="text-sm text-slate-400 mt-4 line-clamp-2 min-h-[40px]">{p.brand?.offer || p.niche || "Sin analizar todavía"}</p>
              <div className="flex gap-6 mt-5 pt-4 border-t border-slate-800">
                <div><p className="font-heading text-2xl font-bold">{p.article_count}</p><p className="eyebrow">artículos</p></div>
                <div><p className="font-heading text-2xl font-bold text-emerald-400">{p.published_count}</p><p className="eyebrow">publicados</p></div>
                <div className="ml-auto self-end"><span className="text-[11px] font-mono text-slate-500">{p.llm_provider}</span></div>
              </div>
            </button>
          ))}
        </div>
      )}
      <NewProject open={open} onOpenChange={setOpen} />
    </div>
  );
}
