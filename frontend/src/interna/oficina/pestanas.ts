/* Las pestañas de la oficina, cada una en su archivo. Solo se descarga la que se abre; el menú adelanta la descarga
   cuando la persona apunta o toca un botón (precargarPestana), así el cambio de pestaña casi no espera a la red. */
import { perezoso } from "../../lib/perezoso";

export const Panel = perezoso(() => import("./Panel"));
export const Pedidos = perezoso(() => import("./Pedidos"));
export const Clientes = perezoso(() => import("./Clientes"));
export const Caja = perezoso(() => import("./Caja"));
export const Cuentas = perezoso(() => import("./Cuentas"));
export const Sueldos = perezoso(() => import("./Sueldos"));
export const Solicitudes = perezoso(() => import("./Solicitudes"));
export const Mas = perezoso(() => import("./Mas"));

const PORCLAVE: Record<string, { precargar: () => Promise<unknown> }> = {
  inicio: Panel, pedidos: Pedidos, clientes: Clientes, caja: Caja, cuentas: Cuentas, sueldos: Sueldos, solicitudes: Solicitudes,
  mas: Mas, resultados: Mas, personal: Mas, historial: Mas, papelera: Mas, respaldo: Mas,
};
/** Baja el archivo de una pestaña sin abrirla (al pasar el mouse, al tocar o al enfocar su botón). */
export function precargarPestana(clave: string) {
  PORCLAVE[clave]?.precargar().catch(() => { /* se reintenta al abrirla */ });
}
