import { useCallback, useEffect, useState, createContext, useContext } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Newspaper, KeyRound, Wallet, LogOut, FolderOpen, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const ProjectsCtx = createContext(null);
export const useProjects = () => useContext(ProjectsCtx);

export default function Layout() {
  const { logout } = useAuth();
  const nav = useNavigate();
  const [projects, setProjects] = useState([]);
  const reload = useCallback(() => api.get("/projects").then((r) => setProjects(r.data)), []);
  useEffect(() => { reload(); }, [reload]);
  const link = ({ isActive }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? "bg-emerald-500/10 text-emerald-300" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`;

  return (
    <ProjectsCtx.Provider value={{ projects, reload }}>
      <div className="flex min-h-screen grain">
        <aside className="w-[260px] shrink-0 border-r border-slate-800 bg-[#0d121c] flex flex-col fixed inset-y-0 z-20">
          <div className="px-5 py-5 flex items-center gap-2 border-b border-slate-800">
            <Newspaper size={20} className="text-emerald-400" />
            <span className="font-heading font-bold">Motor SEO</span>
            <span className="ml-auto text-[10px] font-mono text-slate-500">AEO</span>
          </div>
          <nav className="p-3 space-y-1">
            <NavLink end to="/" className={link} data-testid="nav-home"><FolderOpen size={16} /> Proyectos</NavLink>
            <NavLink to="/ajustes" className={link} data-testid="nav-settings"><KeyRound size={16} /> Claves y ajustes</NavLink>
            <NavLink to="/costes" className={link} data-testid="nav-costs"><Wallet size={16} /> Costes de IA</NavLink>
          </nav>
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <span className="eyebrow">Mis sitios</span>
            <button data-testid="sidebar-new-project" onClick={() => nav("/?nuevo=1")} className="text-slate-500 hover:text-emerald-400"><Plus size={15} /></button>
          </div>
          <div className="px-3 space-y-0.5 overflow-y-auto flex-1">
            {projects.map((p) => (
              <NavLink key={p.id} to={`/p/${p.id}`} className={link} data-testid={`sidebar-project-${p.id}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
                <span className="truncate">{p.name}</span>
                <span className="ml-auto text-[11px] font-mono text-slate-500">{p.published_count}</span>
              </NavLink>
            ))}
            {!projects.length && <p className="px-3 text-xs text-slate-500">Aún no hay proyectos.</p>}
          </div>
          <button data-testid="logout-button" onClick={logout} className="m-3 flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-white rounded-lg hover:bg-slate-800">
            <LogOut size={15} /> Salir
          </button>
        </aside>
        <main className="flex-1 ml-[260px] relative z-10 min-w-0">
          <Outlet />
        </main>
      </div>
    </ProjectsCtx.Provider>
  );
}
