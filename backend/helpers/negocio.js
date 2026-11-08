/* Listas cerradas para validar (Zod, CHECK) y reglas cortas del negocio.
   La fuente es constantes.js (copiado de app/js/app.js); los cálculos grandes están en calculos.js. */
import * as C from "./constantes.js";

export const MEDIOS = Object.keys(C.MEDIOS);
export const METODOS_ENTREGA = Object.keys(C.METODOS);
export const CUENTAS_JS = Object.keys(C.CUENTAS_JS);
export const MOTIVOS = Object.keys(C.MOTIVOS);
export const ROLES = Object.keys(C.ROLES);
export const TIPOS_PERSONAL = Object.keys(C.TIPOS);
export const TIPOS_MOVIMIENTO = Object.keys(C.MOVS);
export const VENTANA_CORRECCION_MS = C.VENTANA_CORRECCION_MS;

export { cerrado, saldoPedido } from "./calculos.js";

/** Diferencia entre lo cobrado y lo que debía cobrar (igual que la pantalla de entrega de la app). */
export function diferenciaCobro({ aCobrar, valorCobrado, metodo }) {
  const aC = Number(aCobrar) || 0;
  if (!aC) return 0;
  const esperado = metodo === "transf_cliente" ? 0 : aC;
  return (Number(valorCobrado) || 0) - esperado;
}
