/* Modo administración (pintarAdmin del prototipo): cada pestaña de la oficina. */
import { DEMO } from "../demo";
import { E } from "../estado";
import Panel from "./Panel";
import Pedidos from "./Pedidos";
import Clientes from "./Clientes";
import Caja from "./Caja";
import Cuentas from "./Cuentas";
import Sueldos from "./Sueldos";
import Mas from "./Mas";

export const AvisoDemo = () => DEMO ? <div className="aviso">Modo de prueba: los datos son inventados y los cambios se pierden al recargar la página.</div> : null;

export default function Oficina({ pintar }: { pintar: () => void }) {
  const t = E.tabA;
  return <>
    <AvisoDemo />
    {t === "pedidos" ? <Pedidos pintar={pintar} /> : t === "clientes" ? <Clientes pintar={pintar} /> : t === "caja" ? <Caja pintar={pintar} />
      : t === "cuentas" ? <Cuentas /> : t === "sueldos" ? <Sueldos pintar={pintar} /> : t === "mas" ? <Mas pintar={pintar} /> : <Panel pintar={pintar} />}
  </>;
}
