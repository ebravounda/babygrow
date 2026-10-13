import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import { Fingerprint, CalendarRange, PenLine, Library, Send, BarChart3, Radar, Stethoscope } from "lucide-react";
import { api } from "@/lib/api";

const Ctx = createContext(null);
export const useProject = () => useContext(Ctx);

const TABS = [
  ["plan", "Plan 30 días", CalendarRange], ["redactar", "Redactar en vivo", PenLine], ["articulos", "Artículos", Library],
  ["publicar", "Publicar", Send], ["estadisticas", "Resultados", BarChart3], ["visibilidad", "Visibilidad IA", Radar],
  ["auditoria", "Auditoría", Stethoscope], ["marca", "Marca", Fingerprint],
];

export default function ProjectLayout() {
  const { pid } = useParams();
  const [project, setProject] = useState(null);
  const reload = useCallback(() => api.get(`/projects/${pid}`).then((r) => setProject(r.data)), [pid]);
  useEffect(() => { setProject(null); reload(); }, [reload]);
  if (!project) return <div className="p-10 text-slate-400">Cargando proyecto…</div>;
  return (
    <Ctx.Provider value={{ project, reload, setProject }}>
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#0B0F17]/85 border-b border-slate-800">
        <div className="px-6 md:px-10 pt-5 flex items-center gap-3">
          <h2 className="font-heading text-xl font-bold" data-testid="project-title">{project.name}</h2>
          <a href={project.url} target="_blank" rel="noreferrer" className="text-xs font-mono text-slate-500 hover:text-emerald-400">{project.url.replace(/^https?:\/\//, "")}</a>
          <span className="ml-auto text-[11px] font-mono px-2 py-1 rounded bg-slate-800 text-slate-400">IA: {project.llm_provider}</span>
        </div>
        <nav className="px-4 md:px-8 flex gap-1 overflow-x-auto mt-3">
          {TABS.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} data-testid={`project-tab-${to}`}
              className={({ isActive }) => `flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${isActive ? "border-emerald-400 text-white" : "border-transparent text-slate-400 hover:text-white"}`}>
              <Icon size={15} /> {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="p-6 md:p-10 max-w-[1500px]"><Outlet /></div>
    </Ctx.Provider>
  );
}
