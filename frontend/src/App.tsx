/* La app de oficina y mensajeros. Sin sesión se ve el ingreso; con sesión, la app interna igual al prototipo (app/ del sistema viejo).
   Los clientes usan otro frontend (portal de clientes). */
import { useSesion } from "./auth/Sesion";
import Ingreso from "./pages/Ingreso";
import AppInterna from "./interna/Marco";

export default function App() {
  const { usuario, cargando } = useSesion();
  if (cargando) return <div className="grid min-h-dvh place-items-center text-sm text-slate-500" role="status">Cargando…</div>;
  if (!usuario) return <Ingreso />;
  return <AppInterna />;
}
