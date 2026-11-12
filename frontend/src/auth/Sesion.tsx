/* Sesión actual: se pregunta al backend (/auth/yo) al abrir la app. La cookie la maneja el navegador. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { auth } from "../api/servicios";
import { cuandoSePierdaLaSesion } from "../api/cliente";
import type { Rol, Usuario } from "../api/tipos";
import { DEMO, USUARIOS_DEMO } from "../interna/cuentasDemo";
import { CLAVE_NAV_ADMIN, limpiarNavegacion } from "../hooks/usePersistedTab";

/* Modo demo: sin backend. Solo se recuerda cuál cuenta de prueba se eligió (no hay token). */
const CLAVE_DEMO = "jsl_demo_cuenta";
const demo = {
  yo: async () => { const u = USUARIOS_DEMO.find(x => x.email === sessionStorage.getItem(CLAVE_DEMO)); if (!u) throw new Error("Sin sesión"); return u; },
  ingresar: async (email: string, clave: string) => {
    const u = USUARIOS_DEMO.find(x => x.email === email.trim().toLowerCase());
    if (!u || clave !== "demo1234") throw new Error("En la demo usa admin@demo.co, asistente@demo.co o mensajero@demo.co con la clave demo1234.");
    sessionStorage.setItem(CLAVE_DEMO, u.email);
    return u;
  },
  salir: async () => { sessionStorage.removeItem(CLAVE_DEMO); }
};
const sesion = DEMO ? demo : auth;

interface Sesion {
  usuario: Usuario | null;
  cargando: boolean;
  ingresar: (email: string, clave: string) => Promise<void>;
  salir: () => Promise<void>;
}

const Ctx = createContext<Sesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    sesion.yo().then(setUsuario).catch(() => setUsuario(null)).finally(() => setCargando(false));
    // Si una petición responde 401 (sesión vencida o cerrada desde otro lado), se vuelve al ingreso.
    cuandoSePierdaLaSesion(() => { setUsuario(null); qc.clear(); });
  }, [qc]);

  const ingresar = useCallback(async (email: string, clave: string) => {
    const u = await sesion.ingresar(email, clave);
    if (u.rol === "cliente") {
      await sesion.salir();
      throw new Error("Esta app es para la oficina y los mensajeros. Los clientes ingresan por el portal de clientes.");
    }
    qc.clear();
    setUsuario(u);
  }, [qc]);

  const salir = useCallback(async () => {
    await sesion.salir().catch(() => {});
    qc.clear();
    limpiarNavegacion(CLAVE_NAV_ADMIN); // la próxima vez entra al Inicio
    setUsuario(null);
  }, [qc]);

  return <Ctx.Provider value={{ usuario, cargando, ingresar, salir }}>{children}</Ctx.Provider>;
}

export function useSesion() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSesion fuera de ProveedorSesion");
  return s;
}

/** Usuario con sesión (solo dentro de rutas protegidas). */
export function useUsuario(): Usuario {
  const { usuario } = useSesion();
  if (!usuario) throw new Error("Sin sesión");
  return usuario;
}

export const esOficina = (r: Rol) => r === "admin" || r === "asistente";
