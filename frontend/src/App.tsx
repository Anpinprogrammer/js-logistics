/* La app de oficina y mensajeros. Sin sesión se ve el ingreso; con sesión, la app interna igual al prototipo (app/ del sistema viejo).
   Los clientes usan otro frontend (portal de clientes). Las pantallas de los correos son públicas y van antes de la sesión. */
import { lazy, Suspense, useEffect } from "react";
import { useLocation } from "react-router";
import { useSesion } from "./auth/Sesion";

// El ingreso y la app interna van en archivos aparte: quien no ha entrado no baja la app, y quien ya entró no baja el formulario.
const Ingreso = lazy(() => import("./pages/Ingreso"));
const Recuperar = lazy(() => import("./pages/Recuperar"));
const Restablecer = lazy(() => import("./pages/Restablecer"));
const cargarMarco = () => import("./interna/Marco");
const AppInterna = lazy(cargarMarco);
// El patinador solo tiene su caja: no baja la app de la oficina ni la de los mensajeros.
const AppPatinador = lazy(() => import("./interna/patinador/Patinador"));

const cargandoVista = <div className="grid min-h-dvh place-items-center text-sm text-slate-500" role="status">Cargando…</div>;

export default function App() {
  const { usuario, cargando: buscandoSesion } = useSesion();
  const { pathname } = useLocation();

  // Descarga el marco en paralelo con la sesión. El skeleton se muestra únicamente
  // cuando la navegación real ya está montada, nunca a pantalla completa antes de ella.
  useEffect(() => {
    if (pathname === "/" && usuario?.rol !== "patinador") void cargarMarco().catch(() => { /* lazy reintenta al entrar */ });
  }, [pathname, usuario?.rol]);

  // Los enlaces del correo abren su pantalla aunque haya una sesión abierta en el mismo navegador.
  const publica =
    pathname === "/recuperar" ? <Recuperar />
      : pathname === "/restablecer" || pathname === "/activar" || pathname === "/activar-cuenta" ? <Restablecer />
        : null;
  if (publica) return <Suspense fallback={cargandoVista}>{publica}</Suspense>;

  if (buscandoSesion) return cargandoVista;
  return <Suspense fallback={cargandoVista}>{usuario ? (usuario.rol === "patinador" ? <AppPatinador /> : <AppInterna />) : <Ingreso />}</Suspense>;
}
