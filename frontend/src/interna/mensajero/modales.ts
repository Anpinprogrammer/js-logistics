/* Ventanas del mensajero que la oficina también abre (Pedidos → entregar, recoger o la devolución).
   Se cargan al abrirlas, para que la pestaña Pedidos de la oficina no baje el modo mensajero completo. */
import type { ComponentProps } from "react";
import { perezoso } from "../../lib/perezoso";
import type { useVentana } from "../ui";
import type * as R from "./Recoger";
import type * as D from "./Reintento";

type Ventana = ReturnType<typeof useVentana>;
export const DlgRecoger = perezoso<ComponentProps<typeof R.DlgRecoger>>(() => import("./Recoger").then(m => ({ default: m.DlgRecoger })));
export const BloqueDevolucion = perezoso<ComponentProps<typeof D.BloqueDevolucion>>(() => import("./Reintento").then(m => ({ default: m.BloqueDevolucion })));
const entrega = () => import("./Entrega");
export const abrirEntregaEn = (v: Ventana, guia: string) => { void entrega().then(m => m.abrirEntregaEn(v, guia)).catch(() => v.avisar("No se pudo abrir la entrega. Revisa tu internet e intenta de nuevo.")); };
export const abrirDevolucionEn = (v: Ventana, guia: string) => { void entrega().then(m => m.abrirDevolucionEn(v, guia)).catch(() => v.avisar("No se pudo abrir la novedad. Revisa tu internet e intenta de nuevo.")); };
