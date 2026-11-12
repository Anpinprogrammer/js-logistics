/* Modo administración (pintarAdmin del prototipo): cada pestaña de la oficina. */
import { Suspense } from "react";
import { DEMO } from "../demo";
import { E } from "../estado";
import { Caja, Clientes, Cuentas, Mas, Panel, Pedidos, Solicitudes, Sueldos } from "./pestanas";

// Cada pestaña se descarga aparte y solo cuando se abre (ver pestanas.ts).

export const AvisoDemo = () => DEMO ? <div className="aviso">Modo de prueba: los datos son inventados y los cambios se pierden al recargar la página.</div> : null;

export default function Oficina({ pintar }: { pintar: () => void }) {
  const t = E.tabA;
  return <>
    <AvisoDemo />
    <Suspense fallback={<div className="vacio" role="status">Cargando…</div>}>
      {t === "pedidos" ? <Pedidos pintar={pintar} /> : t === "clientes" ? <Clientes pintar={pintar} /> : t === "caja" ? <Caja pintar={pintar} />
        : t === "cuentas" ? <Cuentas pintar={pintar} /> : t === "sueldos" ? <Sueldos pintar={pintar} /> : t === "solicitudes" ? <Solicitudes pintar={pintar} /> : t === "mas" ? <Mas pintar={pintar} /> : <Panel pintar={pintar} />}
    </Suspense>
  </>;
}
