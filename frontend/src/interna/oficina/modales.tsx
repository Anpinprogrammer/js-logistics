/* Ventanas que una pestaña abre desde otra (el detalle de una guía desde el Panel, el formulario de cliente desde Pedidos…).
   Se cargan al abrirlas: así entrar al Panel no baja el código de Pedidos, Clientes y Caja. La ventana (ui.tsx) muestra
   "Cargando…" mientras llega el archivo, y si la pestaña dueña ya se abrió, sale de una vez. Cada una pide además las
   colecciones de su pestaña (datos.tsx), por si se abre desde una que no las tenía cargadas. */
import type { ComponentProps, ComponentType } from "react";
import { perezoso } from "../../lib/perezoso";
import { ConColecciones, necesarias } from "../datos";
import type * as P from "./Pedidos";
import type * as C from "./Clientes";
import type * as K from "./Caja";

function ventana<X extends object>(pestana: string, Comp: ComponentType<X>) {
  const cols = necesarias("admin", pestana);
  return (props: X) => <ConColecciones cols={cols}><Comp {...props} /></ConColecciones>;
}

export const AbrirPedido = ventana("pedidos", perezoso<ComponentProps<typeof P.AbrirPedido>>(() => import("./Pedidos").then(m => ({ default: m.AbrirPedido }))));
export const EnBloque = ventana("pedidos", perezoso<ComponentProps<typeof P.EnBloque>>(() => import("./Pedidos").then(m => ({ default: m.EnBloque }))));
export const AbrirCuenta = ventana("clientes", perezoso<ComponentProps<typeof C.AbrirCuenta>>(() => import("./Clientes").then(m => ({ default: m.AbrirCuenta }))));
export const FormCliente = ventana("clientes", perezoso<ComponentProps<typeof C.FormCliente>>(() => import("./Clientes").then(m => ({ default: m.FormCliente }))));
export const MovCaja = ventana("caja", perezoso<ComponentProps<typeof K.MovCaja>>(() => import("./Caja").then(m => ({ default: m.MovCaja }))));
export const CambiarMedio = ventana("caja", perezoso<ComponentProps<typeof K.CambiarMedio>>(() => import("./Caja").then(m => ({ default: m.CambiarMedio }))));
