/* Modo administración (pintarAdmin del prototipo): cada pestaña de la oficina. */
import { Suspense, useEffect } from "react";
import { DEMO } from "../demo";
import { E } from "../estado";
import { perezoso } from "../../lib/perezoso";

// Cada pestaña se descarga aparte, así la oficina arranca más rápido. Las demás se precargan cuando el navegador queda libre.
const Panel = perezoso(() => import("./Panel"));
const Pedidos = perezoso(() => import("./Pedidos"));
const Clientes = perezoso(() => import("./Clientes"));
const Caja = perezoso(() => import("./Caja"));
const Cuentas = perezoso(() => import("./Cuentas"));
const Sueldos = perezoso(() => import("./Sueldos"));
const Solicitudes = perezoso(() => import("./Solicitudes"));
const Mas = perezoso(() => import("./Mas"));

export const AvisoDemo = () => DEMO ? <div className="aviso">Modo de prueba: los datos son inventados y los cambios se pierden al recargar la página.</div> : null;

/** Cuando el navegador queda libre, baja las demás pestañas para que cambiar de pestaña no espere a la red. */
function usePrecargarPestanas() {
  useEffect(() => {
    const precargar = () => [Panel, Pedidos, Clientes, Caja, Cuentas, Sueldos, Solicitudes, Mas].forEach(p => { p.precargar().catch(() => { /* se reintenta al abrir la pestaña */ }); });
    if ("requestIdleCallback" in window) { const id = requestIdleCallback(precargar, { timeout: 4000 }); return () => cancelIdleCallback(id); }
    const id = setTimeout(precargar, 2000);
    return () => clearTimeout(id);
  }, []);
}

export default function Oficina({ pintar }: { pintar: () => void }) {
  usePrecargarPestanas();
  const t = E.tabA;
  return <>
    <AvisoDemo />
    <Suspense fallback={<div className="vacio" role="status">Cargando…</div>}>
      {t === "pedidos" ? <Pedidos pintar={pintar} /> : t === "clientes" ? <Clientes pintar={pintar} /> : t === "caja" ? <Caja pintar={pintar} />
        : t === "cuentas" ? <Cuentas pintar={pintar} /> : t === "sueldos" ? <Sueldos pintar={pintar} /> : t === "solicitudes" ? <Solicitudes pintar={pintar} /> : t === "mas" ? <Mas pintar={pintar} /> : <Panel pintar={pintar} />}
    </Suspense>
  </>;
}
