import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

export function PageHeader({ eyebrow, title, desc, children }) {
  return (
    <div className="flex flex-wrap items-end gap-4 justify-between mb-8 fade-up">
      <div>
        {eyebrow && <p className="eyebrow text-emerald-400 mb-2">{eyebrow}</p>}
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{title}</h1>
        {desc && <p className="text-slate-400 mt-2 max-w-2xl text-sm sm:text-base">{desc}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function CopyBox({ value, testid, label }) {
  const [ok, setOk] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setOk(true); toast.success("Copiado");
    setTimeout(() => setOk(false), 1500);
  };
  return (
    <div className="relative">
      {label && <p className="eyebrow mb-1.5">{label}</p>}
      <pre className="font-mono text-[12px] bg-[#070a10] border border-slate-800 rounded-lg p-3 pr-12 whitespace-pre-wrap break-all text-slate-300">{value}</pre>
      <button data-testid={testid} onClick={copy} className="absolute right-2 bottom-2 p-1.5 rounded-md bg-slate-800 hover:bg-emerald-500 hover:text-black text-slate-300">
        {ok ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

const INTENT = {
  alta: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  media: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  informacional: "bg-slate-700/50 text-slate-300 border-slate-600/40",
};
export function IntentBadge({ intent }) {
  return <span className={`border px-2 py-0.5 rounded-md text-[11px] font-semibold ${INTENT[intent] || INTENT.informacional}`}>{intent || "—"}</span>;
}

const STATUS = {
  draft: ["Borrador", "bg-slate-700/50 text-slate-300"],
  review: ["Por revisar", "bg-amber-500/15 text-amber-400"],
  scheduled: ["Programado", "bg-indigo-500/15 text-indigo-300"],
  published: ["Publicado", "bg-emerald-500/15 text-emerald-400"],
  generating: ["Redactando", "bg-amber-500/15 text-amber-400"],
};
export function StatusBadge({ status }) {
  const [l, c] = STATUS[status] || [status, "bg-slate-700 text-slate-300"];
  return <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${c}`}>{l}</span>;
}

export function ScoreRing({ value = 0, size = 88 }) {
  const r = size / 2 - 7, c = 2 * Math.PI * r;
  const color = value >= 80 ? "#10B981" : value >= 60 ? "#F59E0B" : "#F43F5E";
  return (
    <svg width={size} height={size} data-testid="score-ring">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#1f2937" strokeWidth="7" fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="7" fill="none" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (c * value) / 100} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset .6s ease" }} />
      <text x="50%" y="54%" textAnchor="middle" fill="#f9fafb" fontSize={size / 3.6} fontFamily="Outfit" fontWeight="700">{value}</text>
    </svg>
  );
}

export function Empty({ icon: Icon, title, desc, children }) {
  return (
    <div className="panel p-10 text-center">
      {Icon && <Icon className="mx-auto text-slate-600 mb-3" size={32} />}
      <p className="font-heading font-semibold text-lg">{title}</p>
      {desc && <p className="text-slate-400 text-sm mt-1 max-w-md mx-auto">{desc}</p>}
      <div className="mt-5 flex justify-center gap-2">{children}</div>
    </div>
  );
}

export const BREAKDOWN_LABELS = {
  estructura: "Estructura", palabra_clave: "Palabra clave", legibilidad: "Legibilidad",
  optimizacion_ia: "Optimización IA", marca: "Presencia de marca", venta: "Potencial de venta",
};
