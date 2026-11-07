/* Reglas de negocio puras (sin base de datos), tomadas de app/js/app.js para que el servidor
   calcule lo mismo que la app. Aquí se irán pasando los cálculos de saldos, caja y sueldos. */

export const MEDIOS = ["efectivo", "nequi", "bancolombia"];
export const METODOS_ENTREGA = ["efectivo", "transf_js", "transf_cliente"];
export const CUENTAS_JS = ["nequi", "bancolombia"];
export const MOTIVOS = ["no_contesta", "direccion", "rechazo", "reprogramar", "otro"];
export const ROLES = ["admin", "asistente", "mensajero", "cliente"];
export const TIPOS_PERSONAL = ["mensajero", "dueno", "oficina", "patinador", "empresa"];
export const VENTANA_CORRECCION_MS = 24 * 3_600_000;

export const cerrado = p => p.estado === "entregado" || p.estado === "devuelto";

/** Diferencia entre lo cobrado y lo que debía cobrar (igual que la pantalla de entrega de la app). */
export function diferenciaCobro({ aCobrar, valorCobrado, metodo }) {
  const aC = Number(aCobrar) || 0;
  if (!aC) return 0;
  const esperado = metodo === "transf_cliente" ? 0 : aC;
  return (Number(valorCobrado) || 0) - esperado;
}

const servicio = p => (p.estado === "devuelto" && !p.cobrarDev ? 0 : Number(p.valorServicio) || 0);
const gastoDe = p => Number(p.gasto) || 0;
const pagoDomi = p => (!p.domiPagado ? 0 : p.domiPagoValor != null ? Number(p.domiPagoValor) || 0 : servicio(p));

/** Saldo de un pedido para la cuenta del cliente: cobrado − domicilio − flete + domicilio pagado aparte. */
export function saldoPedido(p) {
  if (!cerrado(p)) return 0;
  const cob = p.metodo === "transf_cliente" || p.estado === "devuelto" ? 0 : Number(p.valorCobrado) || 0;
  return cob - (servicio(p) + gastoDe(p)) + pagoDomi(p);
}
