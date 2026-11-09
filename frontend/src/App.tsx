/* La app de oficina y mensajeros. Sin sesión se ve el ingreso; con sesión, la app interna igual al prototipo (app/ del sistema viejo).
   Los clientes usan otro frontend (portal de clientes). */
import { lazy, Suspense } from "react";
import { useSesion } from "./auth/Sesion";

// El ingreso y la app interna van en archivos aparte: quien no ha entrado no baja la app, y quien ya entró no baja el formulario.
const Ingreso = lazy(() => import("./pages/Ingreso"));
const AppInterna = lazy(() => import("./interna/Marco"));

const cargando = <div className="grid min-h-dvh place-items-center text-sm text-slate-500" role="status">Cargando…</div>;

export default function App() {
  const { usuario, cargando: buscandoSesion } = useSesion();
  if (buscandoSesion) return cargando;
  return <Suspense fallback={cargando}>{usuario ? <AppInterna /> : <Ingreso />}</Suspense>;
}
