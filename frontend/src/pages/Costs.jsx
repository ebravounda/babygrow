import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/common";
import { api } from "@/lib/api";

const money = (v) => `${(v || 0).toFixed(v < 1 ? 4 : 2)} $`;
const PURPOSE = { redaccion: "Redacción", metadatos: "Metadatos", plan: "Plan", analisis_marca: "Análisis de marca", verificacion: "Verificación",
  visibilidad_ia: "Visibilidad IA", reutilizacion: "Reutilización", imagen: "Imágenes", entrevista: "Entrevista", regenerar_seccion: "Regenerar sección",
  comparativas: "Comparativas", test: "Pruebas" };

function Table({ title, rows, labelFn, testid }) {
  return (
    <div className="panel p-5" data-testid={testid}>
      <p className="eyebrow mb-3">{title}</p>
      {!rows.length && <p className="text-sm text-slate-500">Sin gasto este mes.</p>}
      {rows.map((r) => (
        <div key={r.key || "x"} className="flex items-center justify-between py-2 border-b border-slate-800/70 last:border-0 text-sm">
          <span className="truncate pr-3 text-slate-300">{labelFn(r)}</span>
          <span className="font-mono text-slate-400 shrink-0">{r.calls} llam. · <b className="text-white">{money(r.cost)}</b></span>
        </div>
      ))}
    </div>
  );
}

export default function Costs() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/costs").then((r) => setD(r.data)); }, []);
  if (!d) return <div className="p-10 text-slate-400">Cargando…</div>;
  return (
    <div className="p-6 md:p-10 max-w-[1300px]">
      <PageHeader eyebrow={`Mes ${d.month}`} title="Costes de IA" desc="Estimación de lo que gastas con tus claves, por proyecto y por artículo. Fija un límite mensual en la pestaña Marca de cada proyecto." />
      <div className="grid md:grid-cols-3 gap-5 mb-6">
        <div className="panel p-6"><p className="eyebrow">Total del mes</p><p data-testid="costs-total" className="font-heading text-4xl font-extrabold mt-2">{money(d.total)}</p></div>
        <div className="panel p-6 md:col-span-2 h-[150px]">
          <ResponsiveContainer>
            <BarChart data={d.by_provider.map((r) => ({ name: r.key, cost: r.cost }))}>
              <XAxis dataKey="name" stroke="#6b7280" fontSize={12} /><YAxis stroke="#6b7280" fontSize={11} width={40} />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #1f2937" }} formatter={(v) => money(v)} />
              <Bar dataKey="cost" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-5">
        <Table testid="costs-by-project" title="Por proyecto" rows={d.by_project} labelFn={(r) => `${r.name}${r.budget ? ` (límite ${r.budget} $)` : ""}`} />
        <Table testid="costs-by-article" title="Por artículo" rows={d.by_article} labelFn={(r) => r.name} />
        <Table testid="costs-by-purpose" title="Por tarea" rows={d.by_purpose} labelFn={(r) => PURPOSE[r.key] || r.key} />
      </div>
    </div>
  );
}
