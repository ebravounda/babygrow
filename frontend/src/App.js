import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Home from "@/pages/Home";
import Settings from "@/pages/Settings";
import Costs from "@/pages/Costs";
import ProjectLayout from "@/pages/project/ProjectLayout";
import Brand from "@/pages/project/Brand";
import Plan from "@/pages/project/Plan";
import Writer from "@/pages/project/Writer";
import Library from "@/pages/project/Library";
import Editor from "@/pages/project/Editor";
import Publish from "@/pages/project/Publish";
import Stats from "@/pages/project/Stats";
import Visibility from "@/pages/project/Visibility";
import Audit from "@/pages/project/Audit";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) return <div className="min-h-screen grid place-items-center text-slate-400">Cargando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Protected><Layout /></Protected>}>
              <Route index element={<Home />} />
              <Route path="ajustes" element={<Settings />} />
              <Route path="costes" element={<Costs />} />
              <Route path="p/:pid" element={<ProjectLayout />}>
                <Route index element={<Navigate to="plan" replace />} />
                <Route path="marca" element={<Brand />} />
                <Route path="plan" element={<Plan />} />
                <Route path="redactar" element={<Writer />} />
                <Route path="articulos" element={<Library />} />
                <Route path="articulos/:aid" element={<Editor />} />
                <Route path="publicar" element={<Publish />} />
                <Route path="estadisticas" element={<Stats />} />
                <Route path="visibilidad" element={<Visibility />} />
                <Route path="auditoria" element={<Audit />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster theme="dark" position="bottom-right" richColors />
      </AuthProvider>
    </div>
  );
}
