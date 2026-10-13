import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  useEffect(() => {
    if (!localStorage.getItem("mseo_token")) return setUser(false);
    api.get("/auth/me").then((r) => setUser(r.data)).catch(() => setUser(false));
  }, []);
  const login = (token, u) => { localStorage.setItem("mseo_token", token); setUser(u); };
  const logout = () => { localStorage.removeItem("mseo_token"); setUser(false); };
  return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
