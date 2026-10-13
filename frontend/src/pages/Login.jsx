import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Newspaper, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password });
      login(data.token, data.user);
      nav("/");
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] grain">
      <div className="relative hidden lg:block overflow-hidden border-r border-slate-800">
        <img src="https://images.unsplash.com/photo-1487900562037-056962ab1fb0?crop=entropy&cs=srgb&fm=jpg&q=80&w=1600" alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-[#0B0F17]/70" />
        <div className="relative h-full flex flex-col justify-end p-14">
          <p className="eyebrow text-emerald-400 mb-4">Sala de redacción · SEO + AEO</p>
          <h1 className="font-editorial text-5xl leading-tight text-white max-w-xl">Contenido de marca que posiciona en Google y que citan las IAs.</h1>
          <p className="mt-6 text-slate-300 max-w-md">Planifica, redacta con tu experiencia real, verifica cada dato y publica en todos tus sitios. Con tus propias claves.</p>
        </div>
      </div>
      <div className="flex items-center px-8 sm:px-16">
        <form onSubmit={submit} className="w-full max-w-sm fade-up" data-testid="login-form">
          <div className="flex items-center gap-2 mb-10"><Newspaper className="text-emerald-400" size={22} /><span className="font-heading font-bold text-lg">Motor SEO</span></div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">Entrar</h2>
          <p className="text-slate-400 text-sm mb-8">Acceso de administrador.</p>
          <label className="eyebrow">Email</label>
          <Input data-testid="login-email-input" className="mt-2 mb-5 h-11" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label className="eyebrow">Contraseña</label>
          <Input data-testid="login-password-input" className="mt-2 mb-6 h-11" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p data-testid="login-error" className="text-rose-400 text-sm mb-4">{error}</p>}
          <Button data-testid="login-submit-button" disabled={busy} className="w-full h-11 rounded-full font-semibold">
            {busy ? "Entrando…" : <>Entrar <ArrowRight size={16} className="ml-1" /></>}
          </Button>
        </form>
      </div>
    </div>
  );
}
