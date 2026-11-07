/* Rutas por rol. Los clientes usan otro frontend (portal de clientes). */
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { esOficina, useSesion } from "./auth/Sesion";
import type { Rol } from "./api/tipos";
import { Cargando } from "./components/ui";
import Marco from "./components/Marco";
import Ingreso from "./pages/Ingreso";
import Cuenta from "./pages/Cuenta";
import Proximamente from "./pages/Proximamente";
import Ruta from "./pages/mensajero/Ruta";
import Entregados from "./pages/mensajero/Entregados";
import Inicio from "./pages/oficina/Inicio";
import Pedidos from "./pages/oficina/Pedidos";
import PedidoDetalle from "./pages/oficina/PedidoDetalle";
import Clientes from "./pages/oficina/Clientes";
import ClienteDetalle from "./pages/oficina/ClienteDetalle";
import Personal from "./pages/admin/Personal";
import Accesos from "./pages/admin/Accesos";

/** Solo deja pasar a los roles indicados; a los demás los manda a su inicio. */
function Solo({ roles, children }: { roles: Rol[]; children: ReactNode }) {
  const { usuario } = useSesion();
  if (!usuario) return null;
  return roles.includes(usuario.rol) ? <>{children}</> : <Navigate to={usuario.rol === "mensajero" ? "/ruta" : "/"} replace />;
}

const OFICINA: Rol[] = ["admin", "asistente"];

export default function App() {
  const { usuario, cargando } = useSesion();
  if (cargando) return <div className="grid min-h-dvh place-items-center"><Cargando /></div>;
  if (!usuario) return <Ingreso />;

  return (
    <Routes>
      <Route element={<Marco />}>
        <Route index element={esOficina(usuario.rol) ? <Inicio /> : <Navigate to="/ruta" replace />} />
        <Route path="ruta" element={<Solo roles={["mensajero"]}><Ruta /></Solo>} />
        <Route path="entregados" element={<Solo roles={["mensajero"]}><Entregados /></Solo>} />
        <Route path="pedidos" element={<Solo roles={OFICINA}><Pedidos /></Solo>} />
        <Route path="pedidos/:guia" element={<Solo roles={OFICINA}><PedidoDetalle /></Solo>} />
        <Route path="clientes" element={<Solo roles={OFICINA}><Clientes /></Solo>} />
        <Route path="clientes/:id" element={<Solo roles={OFICINA}><ClienteDetalle /></Solo>} />
        <Route path="caja" element={<Solo roles={OFICINA}>
          <Proximamente titulo="Caja" detalle="Caja general, arqueos, cierre del día, cajas de oficina, liquidaciones de mensajeros y sueldos llegan cuando el backend tenga esos módulos." />
        </Solo>} />
        <Route path="personal" element={<Solo roles={["admin"]}><Personal /></Solo>} />
        <Route path="accesos" element={<Solo roles={["admin"]}><Accesos /></Solo>} />
        <Route path="cuenta" element={<Cuenta />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
