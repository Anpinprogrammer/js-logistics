/* La app de oficina y mensajeros. Sin sesión se ve el ingreso; con sesión, la app interna igual al prototipo (app/ del sistema viejo).
   Los clientes usan otro frontend (portal de clientes). Las pantallas de los correos son públicas y van antes de la sesión. */
import { lazy, Suspense } from "react";
import { useLocation } from "react-router";
import { useSesion } from "./auth/Sesion";

// El ingreso y la app interna van en archivos aparte: quien no ha entrado no baja la app, y quien ya entró no baja el formulario.
const Ingreso = lazy(() => import("./pages/Ingreso"));
const Recuperar = lazy(() => import("./pages/Recuperar"));
const Restablecer = lazy(() => import("./pages/Restablecer"));
const AppInterna = lazy(() => import("./interna/Marco"));

const cargandoVista = <div className="grid min-h-dvh place-items-center text-sm text-slate-500" role="status">Cargando…</div>;

export default function App() {
  const { usuario, cargando: buscandoSesion } = useSesion();
  const { pathname } = useLocation();

  // Los enlaces del correo abren su pantalla aunque haya una sesión abierta en el mismo navegador.
  const publica =
    pathname === "/recuperar" ? <Recuperar />
      : pathname === "/restablecer" || pathname === "/activar" || pathname === "/activar-cuenta" ? <Restablecer />
        : null;
  if (publica) return <Suspense fallback={cargandoVista}>{publica}</Suspense>;

  if (buscandoSesion) return cargandoVista;
  return <Suspense fallback={cargandoVista}>{usuario ? <AppInterna /> : <Ingreso />}</Suspense>;
}
