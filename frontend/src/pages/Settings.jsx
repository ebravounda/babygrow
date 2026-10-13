import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Trash2, Zap, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/common";
import { api, errMsg } from "@/lib/api";

function KeyCard({ k, onChange }) {
  const [value, setValue] = useState("");
  const [extra, setExtra] = useState(k.extra_values || {});
  const [busy, setBusy] = useState("");
  const save = async () => {
    setBusy("save");
    try { await api.put(`/keys/${k.name}`, { value, extra }); setValue(""); toast.success("Clave guardada y cifrada"); onChange(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); }
  };
  const test = async () => {
    setBusy("test");
    try {
      const { data } = await api.post(`/keys/${k.name}/test`);
      data.ok ? toast.success(`Conexión correcta (${data.latency_ms} ms)`) : toast.error(data.error);
      onChange();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); }
  };
  const remove = async () => { await api.delete(`/keys/${k.name}`); toast.success("Clave borrada"); onChange(); };
  const t = k.last_test;
  return (
    <div className="panel p-5 fade-up" data-testid={`key-card-${k.name}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="font-heading font-semibold text-lg">{k.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">Cómo conseguirla: {k.help}</p>
          {k.model && <p className="text-[11px] font-mono text-slate-500 mt-1">Modelo: {k.model}</p>}
        </div>
        {k.configured ? (
          t ? (t.ok ? <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 size={14} /> Funciona</span>
                    : <span className="flex items-center gap-1 text-xs text-rose-400" title={t.error}><XCircle size={14} /> Falla</span>)
            : <span className="text-xs text-amber-400">Sin probar</span>
        ) : <span className="text-xs text-slate-500">No configurada</span>}
      </div>
      {k.configured && <p className="font-mono text-sm text-slate-400 mt-3" data-testid={`key-masked-${k.name}`}>{k.masked}</p>}
      {t && !t.ok && <p className="text-xs text-rose-400 mt-2 break-words">{t.error}</p>}
      <div className="flex gap-2 mt-4">
        <Input data-testid={`key-input-${k.name}`} type="password" value={value} onChange={(e) => setValue(e.target.value)}
          placeholder={k.configured ? "Pega una nueva clave para cambiarla" : "Pega tu clave aquí"} className="font-mono" />
        <Button data-testid={`key-save-${k.name}`} onClick={save} disabled={busy || (!value && !k.extra)} className="rounded-full">{busy === "save" ? "…" : "Guardar"}</Button>
      </div>
      {k.extra?.includes("from_email") && (
        <Input data-testid={`key-extra-${k.name}`} className="mt-2" placeholder="Remitente verificado, ej. Avisos <avisos@tudominio.com>"
          value={extra.from_email || ""} onChange={(e) => setExtra({ ...extra, from_email: e.target.value })} />
      )}
      {k.configured && (
        <div className="flex gap-2 mt-3">
          <Button data-testid={`key-test-${k.name}`} variant="secondary" size="sm" onClick={test} disabled={!!busy} className="rounded-full">
            <Zap size={14} className="mr-1" /> {busy === "test" ? "Probando…" : "Probar conexión"}
          </Button>
          <Button data-testid={`key-delete-${k.name}`} variant="ghost" size="sm" onClick={remove} className="text-slate-400 hover:text-rose-400"><Trash2 size={14} className="mr-1" /> Borrar</Button>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const [keys, setKeys] = useState([]);
  const load = () => api.get("/keys").then((r) => setKeys(r.data));
  useEffect(() => { load(); }, []);
  return (
    <div className="p-6 md:p-10 max-w-[1200px]">
      <PageHeader eyebrow="Ajustes" title="Tus claves" desc="Todo funciona con tus propias claves. Se guardan cifradas y solo se muestran enmascaradas. El gasto va directamente a tu cuenta de cada proveedor." />
      <div className="panel p-4 mb-8 flex items-center gap-3 text-sm text-slate-300">
        <ShieldCheck className="text-emerald-400 shrink-0" size={18} />
        Las claves de WordPress y Shopify se configuran en cada proyecto, pestaña <b className="mx-1">Publicar</b>.
      </div>
      <p className="eyebrow mb-3">Inteligencia artificial</p>
      <div className="grid md:grid-cols-2 gap-4 mb-10">{keys.filter((k) => k.group === "ia").map((k) => <KeyCard key={k.name + k.configured + (k.last_test?.at || "")} k={k} onChange={load} />)}</div>
      <p className="eyebrow mb-3">Email de avisos</p>
      <div className="grid md:grid-cols-2 gap-4">{keys.filter((k) => k.group === "email").map((k) => <KeyCard key={k.name + k.configured + (k.last_test?.at || "")} k={k} onChange={load} />)}</div>
    </div>
  );
}
