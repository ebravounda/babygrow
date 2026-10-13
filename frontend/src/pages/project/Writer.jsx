import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mic, Square, PenLine, MessagesSquare, Radio, CheckCircle2, Circle, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, ScoreRing, IntentBadge, BREAKDOWN_LABELS } from "@/components/common";
import { useProject } from "./ProjectLayout";
import { api, errMsg, streamSSE } from "@/lib/api";

function VoiceButton({ onText, testid }) {
  const [rec, setRec] = useState(null);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setBusy(true);
        const fd = new FormData();
        fd.append("file", new Blob(chunks, { type: "audio/webm" }), "nota.webm");
        try { const { data } = await api.post("/transcribe", fd); onText(data.text); toast.success("Nota de voz transcrita"); }
        catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
      };
      mr.start(); setRec(mr);
    } catch { toast.error("No se pudo acceder al micrófono"); }
  };
  const stop = () => { rec.stop(); setRec(null); };
  return (
    <button type="button" data-testid={testid} onClick={rec ? stop : start} disabled={busy}
      className={`shrink-0 w-9 h-9 grid place-items-center rounded-full border transition-colors ${rec ? "bg-rose-500 border-rose-500 text-white animate-pulse" : "border-slate-700 text-slate-400 hover:text-emerald-400 hover:border-emerald-500"}`}
      title="Responder con nota de voz">
      {busy ? <Loader2 size={15} className="animate-spin" /> : rec ? <Square size={13} /> : <Mic size={15} />}
    </button>
  );
}

function liveChecks(text) {
  return [
    ["Respuesta directa inicial", text.split("\n\n")[0]?.length > 80],
    ["Puntos clave", /## Puntos clave/.test(text)],
    ["5+ secciones H2", (text.match(/^## /gm) || []).length >= 5],
    ["Tabla comparativa", /\|\s*-{3}/.test(text)],
    ["Caja de producto", /\[\[PRODUCTO/.test(text)],
    ["Preguntas frecuentes", /## Preguntas frecuentes/.test(text)],
    ["Llamada a la acción", /\[\[CTA\]\]/.test(text)],
  ];
}

export default function Writer() {
  const { project } = useProject();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [topics, setTopics] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [topicId, setTopicId] = useState(params.get("tema") || "");
  const [authorId, setAuthorId] = useState("");
  const [words, setWords] = useState(1800);
  const [qa, setQa] = useState([]);
  const [loadingQ, setLoadingQ] = useState(false);
  const [text, setText] = useState("");
  const [log, setLog] = useState([]);
  const [phase, setPhase] = useState("idle");
  const [result, setResult] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    api.get(`/projects/${project.id}/topics`).then((r) => setTopics(r.data.filter((t) => ["propuesto", "aprobado"].includes(t.status) || t.id === topicId)));
    api.get(`/projects/${project.id}/authors`).then((r) => { setAuthors(r.data); if (r.data[0]) setAuthorId(r.data[0].id); });
  }, [project.id]); // eslint-disable-line
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [text]);
  const topic = topics.find((t) => t.id === topicId);
  const shown = useMemo(() => text.replace(/\[\[PRODUCTO:\s*(.*?)\]\]/g, "`[[ Caja de producto: $1 ]]`").replace(/\[\[CTA\]\]/g, "`[[ Llamada a la acción ]]`"), [text]);
  const wc = text.split(/\s+/).filter(Boolean).length;

  const getQuestions = async () => {
    setLoadingQ(true);
    try { const { data } = await api.post(`/topics/${topicId}/interview`); setQa(data.questions.map((q) => ({ q, a: "" }))); }
    catch (e) { toast.error(errMsg(e)); } finally { setLoadingQ(false); }
  };

  const write = async () => {
    setText(""); setResult(null); setPhase("writing"); setLog([{ c: "Preparando brief con marca, catálogo y entrevista", at: new Date() }]);
    try {
      await streamSSE("/articles/generate", { topic_id: topicId, interview: qa, author_id: authorId, words: Number(words) }, (ev) => {
        if (ev.t === "delta") setText((t) => t + ev.c);
        if (ev.t === "status" || ev.t === "start") setLog((l) => [...l, { c: ev.c || `Modelo: ${ev.provider}`, at: new Date() }]);
        if (ev.t === "done") { setResult(ev.article); setPhase("done"); setLog((l) => [...l, { c: "Artículo listo", at: new Date() }]); }
        if (ev.t === "error") { toast.error(ev.c); setPhase("idle"); }
      });
    } catch (e) { toast.error(e.message); setPhase("idle"); }
  };

  return (
    <div>
      <PageHeader eyebrow="El momento estrella" title="Redacción en vivo" desc="Elige un tema, añade tu experiencia real (opcional) y mira cómo se escribe el artículo, optimizado para Google y para las IAs." />
      <div className="grid xl:grid-cols-[380px_1fr] gap-6">
        <div className="space-y-5">
          <div className="panel p-5 space-y-4">
            <div>
              <label className="eyebrow block mb-1.5">Tema</label>
              <Select value={topicId} onValueChange={(v) => { setTopicId(v); setQa([]); }}>
                <SelectTrigger data-testid="writer-topic-select"><SelectValue placeholder="Elige un tema del plan" /></SelectTrigger>
                <SelectContent className="max-h-80">{topics.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent>
              </Select>
              {topic && <div className="flex gap-2 items-center mt-2 text-xs text-slate-500"><IntentBadge intent={topic.intent} /><span className="font-mono">{topic.keyword}</span></div>}
            </div>
            <div className="grid grid-cols-[1fr_110px] gap-3">
              <div>
                <label className="eyebrow block mb-1.5">Autor</label>
                <Select value={authorId} onValueChange={setAuthorId}>
                  <SelectTrigger data-testid="writer-author-select"><SelectValue placeholder="Sin autor" /></SelectTrigger>
                  <SelectContent>{authors.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><label className="eyebrow block mb-1.5">Palabras</label><Input data-testid="writer-words" type="number" value={words} onChange={(e) => setWords(e.target.value)} /></div>
            </div>
          </div>
          <div className="panel p-5" data-testid="interview-panel">
            <div className="flex items-center gap-2 mb-1"><MessagesSquare size={16} className="text-indigo-400" /><p className="font-heading font-semibold">Modo entrevista</p><span className="text-[10px] text-slate-500 ml-auto">OPCIONAL</span></div>
            <p className="text-xs text-slate-400 mb-4">Tu experiencia real se convierte en citas y casos propios. Es lo que más valoran Google y las IAs.</p>
            {!qa.length ? (
              <Button data-testid="interview-start-button" variant="secondary" size="sm" disabled={!topicId || loadingQ} onClick={getQuestions} className="rounded-full w-full">
                {loadingQ ? "Preparando preguntas…" : "Hacerme preguntas sobre este tema"}
              </Button>
            ) : qa.map((x, i) => (
              <div key={i} className="mb-3">
                <p className="text-sm text-slate-200 mb-1.5">{x.q}</p>
                <div className="flex gap-2 items-start">
                  <Textarea data-testid={`interview-answer-${i}`} rows={2} value={x.a} onChange={(e) => setQa(qa.map((y, j) => (j === i ? { ...y, a: e.target.value } : y)))} placeholder="Escribe o graba tu respuesta…" />
                  <VoiceButton testid={`interview-voice-${i}`} onText={(t) => setQa((cur) => cur.map((y, j) => (j === i ? { ...y, a: (y.a ? y.a + " " : "") + t } : y)))} />
                </div>
              </div>
            ))}
          </div>
          <Button data-testid="start-live-writing-button" disabled={!topicId || phase === "writing"} onClick={write} className="w-full h-12 rounded-full text-base font-semibold">
            {phase === "writing" ? <><Loader2 size={17} className="animate-spin mr-2" /> Redactando…</> : <><PenLine size={17} className="mr-2" /> Redactar en vivo</>}
          </Button>
          {phase !== "idle" && (
            <div className="panel p-5" data-testid="writer-log">
              <p className="eyebrow mb-3">Registro</p>
              {log.map((l, i) => (
                <div key={i} className="flex gap-3 text-sm mb-2"><span className="font-mono text-[11px] text-slate-500 pt-0.5">{l.at.toLocaleTimeString()}</span><span className="text-slate-300">{l.c}</span></div>
              ))}
              <div className="mt-4 pt-4 border-t border-slate-800 space-y-1.5">
                {liveChecks(text).map(([l, ok]) => (
                  <div key={l} className={`flex items-center gap-2 text-sm ${ok ? "text-emerald-400" : "text-slate-500"}`}>{ok ? <CheckCircle2 size={14} /> : <Circle size={14} />} {l}</div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="panel min-h-[640px] flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-3.5 border-b border-slate-800 bg-slate-950/40">
            {phase === "writing" ? <span data-testid="live-indicator" className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30"><Radio size={12} className="animate-pulse" /> EN VIVO</span>
              : <span className="eyebrow">Vista previa</span>}
            <span className="ml-auto font-mono text-xs text-slate-500" data-testid="live-word-count">{wc} palabras</span>
          </div>
          {result && (
            <div className="px-6 py-5 border-b border-slate-800 flex flex-wrap items-center gap-6 fade-up" data-testid="writer-result">
              <ScoreRing value={result.score?.total || 0} />
              <div className="grid grid-cols-3 gap-x-6 gap-y-1.5 text-sm flex-1">
                {Object.entries(result.score?.breakdown || {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2"><span className="text-slate-400">{BREAKDOWN_LABELS[k]}</span><b>{v}</b></div>
                ))}
              </div>
              <Button data-testid="open-in-editor-button" onClick={() => nav(`/p/${project.id}/articulos/${result.id}`)} className="rounded-full">Abrir en el editor <ArrowRight size={15} className="ml-1" /></Button>
            </div>
          )}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 md:px-14 py-10" style={{ maxHeight: "78vh" }}>
            {!text && phase === "idle" && (
              <div className="h-full grid place-items-center text-center text-slate-500">
                <div><PenLine className="mx-auto mb-3 text-slate-700" size={40} /><p className="font-editorial text-2xl text-slate-400">La página en blanco, por poco tiempo.</p><p className="text-sm mt-2">Elige un tema y pulsa «Redactar en vivo».</p></div>
              </div>
            )}
            {(text || phase === "writing") && (
              <article className="max-w-3xl mx-auto">
                <h1 className="font-editorial text-4xl leading-tight text-white mb-6">{topic?.title}</h1>
                <div className={`prose-news ${phase === "writing" ? "caret" : ""}`} data-testid="live-article-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{shown}</ReactMarkdown>
                </div>
              </article>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
