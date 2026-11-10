/* Movimientos de la cuenta de los clientes (pagos, pagos a clientes, compras por encargo, ganancias, cargos y abonos).
   Las reglas están en servicios/movimientos.js. */
import * as S from "../servicios/movimientos.js";
import { leerDe } from "../servicios/datos.js";
import { responder, diaDeFecha } from "./accion.js";

const conDia = b => ({ ...b, dia: b.dia ?? diaDeFecha(b.fecha) });
const soloMedio = b => Object.keys(b).length === 1 && b.medio !== undefined;

export const listar = responder(async ctx => {
  return leerDe(ctx, "movimientos");
}, { clave: "movimientos" });
export const crear = responder((ctx, req) => S.crear(ctx, conDia(req.valido.body)), { clave: "movimiento", status: 201 });
/** Solo { medio }: el asistente corrige el medio de un pago suyo. Lo demás: administración edita el movimiento. */
export const actualizar = responder((ctx, req) => {
  const b = req.valido.body, id = req.valido.params.id;
  return soloMedio(b) ? S.cambiarMedio(ctx, "movimientos", id, b) : S.editar(ctx, id, conDia(b));
}, { clave: "movimiento" });
export const eliminar = responder((ctx, req) => S.eliminar(ctx, req.valido.params.id));
export const reversar = responder((ctx, req) => S.reversarPagos(ctx, req.valido.body));
export const pagina = responder((ctx, req) => S.paginaOficina(ctx, req.valido.query));
export const ganancias = responder((ctx, req) => S.gananciasPorCliente(ctx, req.valido.query));
